/**
 * TaskPayload v2.5+ Usage Examples
 * 
 * Examples showing how to use the TaskPayload v2.5+ types and helpers
 * Based on working implementation in MagicAtelier.tsx
 */

import {
  buildRouterInbox,
  buildCognitiveEnvelope,
  buildToolCalls,
  buildMultimodalEnvelope,
  buildTaskParamsV25,
  validateRouterTools,
  shouldBypassRouter,
  getRequiredTools,
  getToolCalls,
  type TaskParamsV25,
  type RouterInbox,
  type ToolCall,
} from './taskPayloadTypes';
import { seedcoreService } from './seedcoreService';

// ============================================================================
// Example 1: Companion Activation (from MagicAtelier.tsx pattern)
// ============================================================================

export async function createCompanionActivationTask(
  buddyIdentity: { name: string; role: string },
  guestId: string,
  snapshotId?: number
) {
  // Build router inbox
  const routing = buildRouterInbox({
    required_specialization: 'reachy_actuator', // HARD constraint
    specialization: 'reachy_actuator', // SOFT preference
    skills: {
      motion_control: 0.9,
      voice_interaction: 0.7,
      hotel_services: 0.8,
    },
    tools: ['reachy.motion', 'reachy.voice'], // Required tool names (strings only)
    routing_tags: ['hotel_guest_room', buddyIdentity.role, 'companion'],
    hints: {
      priority: 5, // Normal priority (0-10 scale)
      ttl_seconds: 300, // 5 minute TTL
    },
  });

  // Build cognitive envelope
  const cognitive = buildCognitiveEnvelope({
    cog_type: 'task_planning',
    decision_kind: 'planner',
    skip_retrieval: false,
    disable_memory_write: false,
  });

  // Build tool calls
  const toolCalls = buildToolCalls([
    {
      name: 'reachy.motion',
      args: {
        action: 'initialize',
        persona: buddyIdentity.name,
        role: buddyIdentity.role,
      },
    },
  ]);

  // Build complete params
  const params = buildTaskParamsV25({
    interaction: {
      mode: 'coordinator_routed', // Uses router, not direct agent tunnel
    },
    routing,
    cognitive,
    tool_calls: toolCalls,
    meta: {
      guest_id: guestId,
      persona_name: buddyIdentity.name,
      base_capability_name: 'reachy_actuator',
      activation_type: 'companion_birth',
    },
  });

  // Validate routing tools (optional, but recommended)
  validateRouterTools(routing);

  // Create task
  const task = await seedcoreService.createTask({
    type: 'action',
    description: `Activate companion "${buddyIdentity.name}" (${buddyIdentity.role}) - Materialize robot instance`,
    domain: 'robot',
    snapshot_id: snapshotId,
    params,
    run_immediately: true,
  });

  return task;
}

// ============================================================================
// Example 2: Security Monitoring Task with Vision
// ============================================================================

export async function createSecurityMonitoringTask(
  cameraId: string,
  mediaUri: string,
  detectedObjects: Array<{ class: string; bbox: [number, number, number, number]; confidence: number }>,
  locationContext: string
) {
  // Build multimodal envelope
  const multimodal = buildMultimodalEnvelope({
    source: 'vision',
    media_uri: mediaUri,
    scene_description: `Person detected near ${locationContext}`,
    confidence: 0.92,
    detected_objects: detectedObjects,
    camera_id: cameraId,
    location_context: locationContext,
    is_real_time: true,
    ttl_seconds: 60,
  });

  // Build router inbox for security specialization
  const routing = buildRouterInbox({
    required_specialization: 'SecurityMonitoring', // HARD constraint
    specialization: 'SecurityMonitoring', // SOFT preference
    skills: {
      threat_assessment: 0.9,
      anomaly_detection: 0.85,
    },
    tools: ['alerts.raise', 'sensors.read_all'], // Required tool names
    routing_tags: ['security', 'monitoring', 'vision'],
    hints: {
      priority: 7, // High priority
      ttl_seconds: 60,
    },
  });

  // Build tool calls for alerting
  const toolCalls = buildToolCalls([
    {
      name: 'alerts.raise',
      args: {
        severity: 'medium',
        location: locationContext,
        camera_id: cameraId,
      },
    },
  ]);

  // Build complete params
  const params = buildTaskParamsV25({
    interaction: {
      mode: 'coordinator_routed',
    },
    routing,
    multimodal,
    tool_calls: toolCalls,
    risk: {
      level: 'medium',
      classification: 'suspicious_activity',
      audit_flags: ['vision_detection', 'real_time'],
    },
  });

  // Create task
  const task = await seedcoreService.createTask({
    type: 'action',
    description: `Security monitoring: ${detectedObjects.length} object(s) detected at ${locationContext}`,
    domain: 'security',
    params,
    run_immediately: true,
  });

  return task;
}

// ============================================================================
// Example 3: Voice Command Task
// ============================================================================

export async function createVoiceCommandTask(
  transcription: string,
  mediaUri: string,
  locationContext: string
) {
  // Build multimodal envelope for voice
  const multimodal = buildMultimodalEnvelope({
    source: 'voice',
    media_uri: mediaUri,
    transcription,
    confidence: 0.95,
    location_context: locationContext,
    is_real_time: true,
    ttl_seconds: 120,
  });

  // Build router inbox for voice processing
  const routing = buildRouterInbox({
    specialization: 'VoiceCommandProcessor',
    skills: {
      natural_language_understanding: 0.9,
      intent_classification: 0.85,
    },
    tools: ['iot.control', 'room_service.request'],
    routing_tags: ['voice', 'command', locationContext],
  });

  // Build cognitive envelope for conversation
  const cognitive = buildCognitiveEnvelope({
    cog_type: 'conversation',
    decision_kind: 'classifier',
    skip_retrieval: false,
  });

  // Build complete params
  const params = buildTaskParamsV25({
    interaction: {
      mode: 'coordinator_routed',
    },
    routing,
    cognitive,
    multimodal,
    chat: {
      user_message: transcription,
      context: {
        location: locationContext,
        modality: 'voice',
      },
    },
  });

  // Create task
  const task = await seedcoreService.createTask({
    type: 'chat',
    description: `Voice command: ${transcription.slice(0, 100)}`,
    domain: 'guest_services',
    params,
    run_immediately: true,
  });

  return task;
}

// ============================================================================
// Example 4: Agent Tunnel Mode (Bypasses Router)
// ============================================================================

export async function createDirectAgentTask(agentId: string, command: string) {
  // When using agent_tunnel mode, routing is ignored
  const params = buildTaskParamsV25({
    interaction: {
      mode: 'agent_tunnel', // Bypasses router
    },
    cognitive: {
      agent_id: agentId, // Direct agent assignment
      cog_type: 'direct_command',
    },
    tool_calls: buildToolCalls([
      {
        name: 'agent.execute',
        args: {
          command,
        },
      },
    ]),
  });

  // Check if router should be bypassed
  if (shouldBypassRouter(params)) {
    console.log('Router bypassed - using agent tunnel mode');
  }

  // Create task
  const task = await seedcoreService.createTask({
    type: 'action',
    description: `Direct command to ${agentId}: ${command}`,
    params,
    run_immediately: true,
  });

  return task;
}

// ============================================================================
// Example 5: Utility Functions Usage
// ============================================================================

export function demonstrateUtilityFunctions(params: TaskParamsV25) {
  // Check if router should be bypassed
  const bypassRouter = shouldBypassRouter(params);
  console.log('Should bypass router:', bypassRouter);

  // Extract required tools from routing
  const requiredTools = getRequiredTools(params);
  console.log('Required tools:', requiredTools);

  // Extract tool calls
  const toolCalls = getToolCalls(params);
  console.log('Tool calls:', toolCalls);

  // Validate routing tools (if routing exists)
  if (params.routing) {
    try {
      validateRouterTools(params.routing);
      console.log('Routing tools validated successfully');
    } catch (error) {
      console.error('Routing tools validation failed:', error);
    }
  }
}

// ============================================================================
// Example 6: Manual Construction (for advanced use cases)
// ============================================================================

export function createManualTaskParams(): TaskParamsV25 {
  // You can also construct params manually if needed
  const params: TaskParamsV25 = {
    interaction: {
      mode: 'coordinator_routed',
    },
    routing: {
      required_specialization: 'CustomSpecialization',
      specialization: 'CustomSpecialization',
      skills: {
        custom_skill: 0.95,
      },
      tools: ['custom.tool'],
      routing_tags: ['custom', 'tag'],
      hints: {
        priority: 8,
        ttl_seconds: 180,
      },
    },
    cognitive: {
      cog_type: 'custom_processing',
      decision_kind: 'custom',
      llm_provider_override: 'openai',
      llm_model_override: 'gpt-4o',
    },
    tool_calls: [
      {
        name: 'custom.tool',
        args: {
          custom_param: 'value',
        },
      },
    ],
    meta: {
      custom_field: 'custom_value',
    },
  };

  return params;
}
