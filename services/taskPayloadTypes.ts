/**
 * TaskPayload v2.5+ Type Definitions
 * 
 * Instance-level task params structure with envelope isolation.
 * Based on working implementation in MagicAtelier.tsx
 * 
 * @see components/DIYEra/MagicAtelier.tsx for usage examples
 */

// ============================================================================
// 1. Router Inbox: params.routing (Read-Only Input)
// ============================================================================

/**
 * Router inbox format - tells router which agent/specialization to route to.
 * This is read-only input for the router (TaskPayload v2.5+)
 */
export interface RouterInbox {
  /** HARD constraint - must match (routing fails otherwise) */
  required_specialization?: string;
  
  /** SOFT preference - prefer, but may fall back */
  specialization?: string;
  
  /** Skill scores (0.0-1.0) for routing/scoring */
  skills?: Record<string, number>;
  
  /** Required tool names (RBAC + selection signals) - strings only */
  tools?: string[];
  
  /** Tag matching / structured routing intent */
  routing_tags?: string[];
  
  /** Scheduling metadata (priority/deadline/TTL) */
  hints?: {
    /** Priority level (0-10 scale) */
    priority?: number;
    /** ISO8601 deadline timestamp */
    deadline_at?: string;
    /** Time-to-live in seconds */
    ttl_seconds?: number;
  };
}

// ============================================================================
// 2. Router Output: params._router (System Generated, Write-Only)
// ============================================================================

/**
 * Router output - system generated after routing decision.
 * Upstream components must NEVER write this.
 */
export interface RouterOutput {
  /** Whether this is a high-stakes task */
  is_high_stakes?: boolean;
  
  /** Selected agent ID */
  agent_id?: string;
  
  /** Selected organ ID */
  organ_id?: string;
  
  /** Routing decision reason */
  reason?: string;
  
  /** Additional routing metadata */
  [key: string]: any;
}

// ============================================================================
// 3. Cognitive Envelope: params.cognitive
// ============================================================================

/**
 * Cognitive envelope - controls inference style, memory I/O, and model routing.
 * Usually populated after routing determines agent_id.
 */
export interface CognitiveEnvelope {
  /** Agent ID (usually populated after routing, derived from _router.agent_id) */
  agent_id?: string;
  
  /** Cognitive type (e.g., "task_planning", "conversation", "analysis") */
  cog_type?: string;
  
  /** Decision kind (e.g., "planner", "classifier", "generator") */
  decision_kind?: string;
  
  /** LLM provider override (e.g., "openai", "anthropic", "google") */
  llm_provider_override?: string;
  
  /** LLM model override (e.g., "gpt-4o", "claude-3-opus", "gemini-pro") */
  llm_model_override?: string;
  
  /** Skip retrieval (RAG) */
  skip_retrieval?: boolean;
  
  /** Disable memory writes */
  disable_memory_write?: boolean;
  
  /** Force RAG retrieval */
  force_rag?: boolean;
  
  /** Force deep reasoning mode */
  force_deep_reasoning?: boolean;
  
  /** Additional cognitive controls */
  [key: string]: any;
}

// ============================================================================
// 4. Chat Envelope: params.chat
// ============================================================================

/**
 * Chat message window/context envelope
 */
export interface ChatEnvelope {
  /** Chat session ID */
  session_id?: string;
  
  /** Message history */
  messages?: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp?: string;
    metadata?: Record<string, any>;
  }>;
  
  /** Current user message */
  user_message?: string;
  
  /** Chat context metadata */
  context?: Record<string, any>;
  
  /** Additional chat fields */
  [key: string]: any;
}

// ============================================================================
// 5. Risk Envelope: params.risk
// ============================================================================

/**
 * Risk classification and audit protocols envelope
 */
export interface RiskEnvelope {
  /** Risk level (e.g., "low", "medium", "high", "critical") */
  level?: string;
  
  /** Risk classification reason */
  classification?: string;
  
  /** Audit flags */
  audit_flags?: string[];
  
  /** Required protocols */
  protocols?: string[];
  
  /** Risk score (0.0-1.0) */
  score?: number;
  
  /** Additional risk metadata */
  [key: string]: any;
}

// ============================================================================
// 6. Graph Envelope: params.graph
// ============================================================================

/**
 * Graph operations payload when applicable
 */
export interface GraphEnvelope {
  /** Graph operation type */
  operation?: string;
  
  /** Graph nodes */
  nodes?: Array<{
    id: string;
    type?: string;
    properties?: Record<string, any>;
  }>;
  
  /** Graph edges */
  edges?: Array<{
    source: string;
    target: string;
    type?: string;
    properties?: Record<string, any>;
  }>;
  
  /** Graph query */
  query?: string;
  
  /** Additional graph metadata */
  [key: string]: any;
}

// ============================================================================
// 7. Multimodal Envelope: params.multimodal (v2.5)
// ============================================================================

/**
 * Multimodal metadata envelope (v2.5)
 * Stores metadata only. Media binaries live externally. Embeddings live in dedicated tables.
 */
export interface MultimodalEnvelope {
  /** Source type: "vision" | "voice" | "text" */
  source?: 'vision' | 'voice' | 'text';
  
  /** Media URI (e.g., s3://.../camera_101.mp4) */
  media_uri?: string;
  
  /** Scene description (for vision) */
  scene_description?: string;
  
  /** Transcription (for voice) */
  transcription?: string;
  
  /** Confidence score (0.0-1.0) */
  confidence?: number;
  
  /** Detected objects (for vision) */
  detected_objects?: Array<{
    class: string;
    bbox?: [number, number, number, number];
    confidence?: number;
    [key: string]: any;
  }>;
  
  /** Timestamp (ISO8601) */
  timestamp?: string;
  
  /** Camera/sensor ID */
  camera_id?: string;
  sensor_id?: string;
  
  /** Location context */
  location_context?: string;
  
  /** Real-time flag */
  is_real_time?: boolean;
  
  /** Time-to-live in seconds */
  ttl_seconds?: number;
  
  /** Parent stream ID */
  parent_stream_id?: string;
  
  /** Additional multimodal metadata */
  [key: string]: any;
}

// ============================================================================
// 8. Tool Calls: params.tool_calls (Executable Requests)
// ============================================================================

/**
 * Tool invocation object
 * 
 * Note: This is separate from routing.tools (which are required tool names as strings).
 * tool_calls contains the actual executable tool invocations with arguments.
 */
export interface ToolCall {
  /** Tool name (e.g., "iot.control", "reachy.motion") */
  name: string;
  
  /** Tool arguments */
  args: Record<string, any>;
  
  /** Optional tool call ID for tracking */
  id?: string;
  
  /** Optional timeout in seconds */
  timeout_seconds?: number;
}

// ============================================================================
// 9. Interaction Mode: params.interaction
// ============================================================================

/**
 * Interaction mode envelope
 */
export interface InteractionEnvelope {
  /** Interaction mode */
  mode?: 'coordinator_routed' | 'agent_tunnel' | 'direct';
  
  /** Additional interaction metadata */
  [key: string]: any;
}

// ============================================================================
// 10. Complete TaskParams Structure (v2.5+)
// ============================================================================

/**
 * Complete TaskParams structure with envelope isolation (v2.5+)
 * 
 * Envelope isolation rules:
 * - params.routing: Router Inbox (read-only input)
 * - params._router: Router Output (system generated, write-only)
 * - params.cognitive: Cognitive execution controls
 * - params.chat: Chat message window/context
 * - params.risk: Upstream classification (audit + protocols)
 * - params.graph: Graph ops payload when applicable
 * - params.multimodal: Voice/vision metadata (v2.5)
 * - params.tool_calls: Executable tool invocations (structured)
 * - params.interaction: Interaction mode controls
 * 
 * Critical rule: If params.interaction.mode == "agent_tunnel", router is skipped
 * and params.routing is ignored.
 */
export interface TaskParamsV25 {
  /** Router inbox (read-only input) */
  routing?: RouterInbox;
  
  /** Router output (system generated, write-only - upstream must never write) */
  _router?: RouterOutput;
  
  /** Cognitive execution controls */
  cognitive?: CognitiveEnvelope;
  
  /** Chat message window/context */
  chat?: ChatEnvelope;
  
  /** Risk classification and audit protocols */
  risk?: RiskEnvelope;
  
  /** Graph operations payload */
  graph?: GraphEnvelope;
  
  /** Multimodal metadata (v2.5) */
  multimodal?: MultimodalEnvelope;
  
  /** Executable tool invocations (structured) */
  tool_calls?: ToolCall[];
  
  /** Interaction mode controls */
  interaction?: InteractionEnvelope;
  
  /** Custom metadata (not part of core spec) */
  meta?: Record<string, any>;
  
  /** Additional custom fields */
  [key: string]: any;
}

// ============================================================================
// 11. Helper Functions
// ============================================================================

/**
 * Build a router inbox for task routing
 * 
 * @example
 * ```typescript
 * const routing = buildRouterInbox({
 *   required_specialization: "reachy_actuator",
 *   specialization: "reachy_actuator",
 *   skills: { motion_control: 0.9, voice_interaction: 0.7 },
 *   tools: ["reachy.motion", "reachy.voice"],
 *   routing_tags: ["hotel_guest_room", "concierge"],
 *   hints: { priority: 5, ttl_seconds: 300 }
 * });
 * ```
 */
export function buildRouterInbox(options: Partial<RouterInbox>): RouterInbox {
  return {
    required_specialization: options.required_specialization,
    specialization: options.specialization,
    skills: options.skills,
    tools: options.tools,
    routing_tags: options.routing_tags,
    hints: options.hints,
  };
}

/**
 * Build cognitive envelope for task execution
 * 
 * @example
 * ```typescript
 * const cognitive = buildCognitiveEnvelope({
 *   cog_type: "task_planning",
 *   decision_kind: "planner",
 *   skip_retrieval: false,
 *   disable_memory_write: false
 * });
 * ```
 */
export function buildCognitiveEnvelope(options: Partial<CognitiveEnvelope>): CognitiveEnvelope {
  return {
    agent_id: options.agent_id,
    cog_type: options.cog_type,
    decision_kind: options.decision_kind,
    llm_provider_override: options.llm_provider_override,
    llm_model_override: options.llm_model_override,
    skip_retrieval: options.skip_retrieval ?? false,
    disable_memory_write: options.disable_memory_write ?? false,
    force_rag: options.force_rag,
    force_deep_reasoning: options.force_deep_reasoning,
  };
}

/**
 * Build tool calls array
 * 
 * @example
 * ```typescript
 * const toolCalls = buildToolCalls([
 *   { name: "reachy.motion", args: { action: "initialize", persona: "Mimi" } },
 *   { name: "iot.control", args: { device: "lights", location: "lobby", action: "off" } }
 * ]);
 * ```
 */
export function buildToolCalls(calls: Array<{ name: string; args: Record<string, any>; id?: string; timeout_seconds?: number }>): ToolCall[] {
  return calls.map(call => ({
    name: call.name,
    args: call.args,
    id: call.id,
    timeout_seconds: call.timeout_seconds,
  }));
}

/**
 * Build multimodal envelope for vision/voice tasks
 * 
 * @example
 * ```typescript
 * const multimodal = buildMultimodalEnvelope({
 *   source: "vision",
 *   media_uri: "s3://hotel-assets/camera_101.mp4",
 *   scene_description: "Person detected near Room 101",
 *   confidence: 0.92,
 *   detected_objects: [{ class: "person", bbox: [100, 200, 150, 300] }],
 *   camera_id: "camera_101",
 *   location_context: "room_101_corridor",
 *   is_real_time: true,
 *   ttl_seconds: 60
 * });
 * ```
 */
export function buildMultimodalEnvelope(options: Partial<MultimodalEnvelope>): MultimodalEnvelope {
  return {
    source: options.source,
    media_uri: options.media_uri,
    scene_description: options.scene_description,
    transcription: options.transcription,
    confidence: options.confidence,
    detected_objects: options.detected_objects,
    timestamp: options.timestamp || new Date().toISOString(),
    camera_id: options.camera_id,
    sensor_id: options.sensor_id,
    location_context: options.location_context,
    is_real_time: options.is_real_time,
    ttl_seconds: options.ttl_seconds,
    parent_stream_id: options.parent_stream_id,
  };
}

/**
 * Build complete TaskParams v2.5+ structure
 * 
 * @example
 * ```typescript
 * const params = buildTaskParamsV25({
 *   interaction: { mode: "coordinator_routed" },
 *   routing: buildRouterInbox({
 *     required_specialization: "reachy_actuator",
 *     tools: ["reachy.motion"],
 *     routing_tags: ["hotel_guest_room"]
 *   }),
 *   cognitive: buildCognitiveEnvelope({
 *     cog_type: "task_planning",
 *     decision_kind: "planner"
 *   }),
 *   tool_calls: buildToolCalls([
 *     { name: "reachy.motion", args: { action: "initialize" } }
 *   ]),
 *   meta: { guest_id: "guest_123", activation_type: "companion_birth" }
 * });
 * ```
 */
export function buildTaskParamsV25(options: Partial<TaskParamsV25>): TaskParamsV25 {
  const params: TaskParamsV25 = {};
  
  if (options.interaction) {
    params.interaction = options.interaction;
  }
  
  if (options.routing) {
    params.routing = options.routing;
  }
  
  if (options._router) {
    // Warn if upstream is trying to write _router (should be system-generated)
    console.warn('[TaskParamsV25] Warning: _router should be system-generated, not written by upstream');
    params._router = options._router;
  }
  
  if (options.cognitive) {
    params.cognitive = options.cognitive;
  }
  
  if (options.chat) {
    params.chat = options.chat;
  }
  
  if (options.risk) {
    params.risk = options.risk;
  }
  
  if (options.graph) {
    params.graph = options.graph;
  }
  
  if (options.multimodal) {
    params.multimodal = options.multimodal;
  }
  
  if (options.tool_calls) {
    params.tool_calls = options.tool_calls;
  }
  
  if (options.meta) {
    params.meta = options.meta;
  }
  
  // Copy any additional custom fields
  Object.keys(options).forEach(key => {
    if (!['interaction', 'routing', '_router', 'cognitive', 'chat', 'risk', 'graph', 'multimodal', 'tool_calls', 'meta'].includes(key)) {
      params[key] = (options as any)[key];
    }
  });
  
  return params;
}

/**
 * Validate that routing.tools contains only strings (not tool call objects)
 * 
 * @throws Error if routing.tools contains non-string values
 */
export function validateRouterTools(routing: RouterInbox): void {
  if (routing.tools && !Array.isArray(routing.tools)) {
    throw new Error('routing.tools must be an array');
  }
  
  if (routing.tools) {
    const invalidTools = routing.tools.filter(tool => typeof tool !== 'string');
    if (invalidTools.length > 0) {
      throw new Error(`routing.tools must contain only strings, found: ${JSON.stringify(invalidTools)}`);
    }
  }
}

/**
 * Check if task should bypass router (agent_tunnel mode)
 */
export function shouldBypassRouter(params: TaskParamsV25): boolean {
  return params.interaction?.mode === 'agent_tunnel';
}

/**
 * Extract required tools from routing envelope
 */
export function getRequiredTools(params: TaskParamsV25): string[] {
  return params.routing?.tools || [];
}

/**
 * Extract tool calls from params
 */
export function getToolCalls(params: TaskParamsV25): ToolCall[] {
  return params.tool_calls || [];
}
