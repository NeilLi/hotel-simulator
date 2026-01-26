// pkgRequests.ts
// Centralized request builders for SeedCore PKG evaluate_async.

import type { PKGEvaluateAsyncRequest } from './seedcoreService';
import type { WearableDesignDraft, WearableIntent, WearableTicket } from './wearableStudioTypes';
import type { Snapshot, Room } from '../types';

export function buildPreviewPKGRequest(
  design: WearableDesignDraft,
  intent: WearableIntent,
  runId: string | null,
  snapshot: Snapshot | null
): PKGEvaluateAsyncRequest {
  const req: PKGEvaluateAsyncRequest = {
    task_facts: {
      namespace: 'hotel',
      subject: `guest:persona_${runId?.slice(0, 8) || 'anonymous'}`,
      predicate: 'request_diy_preview',
      object_data: {
        style: intent.style,
        type: intent.type,
        fabric: design.fabricType,
        placement: design.printSpec?.placement || 'FRONT',
        is_kids_zone: false,
      },
    },
    zone_id: 'WEAR',
    snapshot_id: snapshot?.id,
    current_time: new Date().toISOString(),
    mode: 'advisory',
  };

  // MANUAL TAG ENRICHMENT for WASM rules
  (req.task_facts as any).tags = ['hotel', 'request_diy_preview', 'zone', 'wear', 'environment'];

  return req;
}

export function buildMfgPKGRequest(
  ticket: WearableTicket,
  design: WearableDesignDraft,
  intent: WearableIntent,
  snapshot: Snapshot | null
): PKGEvaluateAsyncRequest {
  const req: PKGEvaluateAsyncRequest = {
    task_facts: {
      namespace: 'hotel',
      subject: `guest:persona_${ticket.runId.slice(0, 8)}`,
      predicate: 'request_diy_print',
      object_data: {
        style: intent.style,
        type: intent.type,
        size: intent.size,
        fabric: design.fabricType,
        placement: design.printSpec?.placement || 'FRONT',
        thread_count: design.threadCount,
        ticket_id: ticket.ticketId,
        design_concept: design.designConcept,
      },
    },
    zone_id: 'WEAR',
    snapshot_id: snapshot?.id,
    current_time: new Date().toISOString(),
    mode: 'advisory',
  };

  return req;
}

export interface RoomAccessContext {
  actorSubject?: string; // e.g., "guest:persona_e41828e2"
  actorRole?: string; // e.g., "DIRECTOR", "GUEST"
  actorAuthLevel?: string; // e.g., "DIRECTOR", "VIP"
  doorId?: string; // e.g., "DOOR-W-28-B"
  lockState?: 'locked' | 'unlocked';
  occupancy?: 'occupied' | 'vacant' | 'reserved';
  securityLevel?: 'standard' | 'vip' | 'restricted';
}

/**
 * Builds an optimized PKG evaluation request for room access.
 * 
 * Implements the recommended "hotel simulator → seedcore" input schema:
 * 1. Actor/requestor info (who is requesting)
 * 2. Room state + door linkage (what is being accessed)
 * 3. Curated governed_facts bundle (2-5 relevant facts, <2KB total)
 * 
 * @param room - The room being accessed
 * @param snapshot - Active snapshot for evaluation
 * @param context - Optional actor and room runtime context
 * @returns Optimized PKG evaluation request
 */
export function buildRoomSelectionPKGRequest(
  room: Room,
  snapshot: Snapshot | null,
  context?: RoomAccessContext
): PKGEvaluateAsyncRequest {
  const baseSubject = `room:${room.id}`;
  const zoneId = 'DIRECTOR';
  
  // 1) ACTOR CONTEXT: Who is requesting
  const actorSubject = context?.actorSubject || `guest:persona_${Date.now().toString(36).slice(-8)}`;
  const actorRole = context?.actorRole || 'DIRECTOR'; // Default to DIRECTOR for map view
  const actorAuthLevel = context?.actorAuthLevel || zoneId;

  // 2) ROOM STATE: Enhanced object_data with door linkage and runtime state
  const doorId = context?.doorId || `DOOR-${room.id}`;
  const objectData: Record<string, any> = {
    room_id: room.id,
    room_name: room.name,
    room_type: room.type,
    door_id: doorId,
    grid_position: {
      top_left: room.topLeft,
      bottom_right: room.bottomRight,
    },
  };

  // Add runtime state if provided
  if (context?.lockState) objectData.lock_state = context.lockState;
  if (context?.occupancy) objectData.occupancy = context.occupancy;
  if (context?.securityLevel) objectData.security_level = context.securityLevel;

  // 3) SUBJECT CLOSURE: Multi-subject fact hydration
  const relatedSubjects: string[] = [
    'system:room_environment', // Global room topology, building mode, lockdown state
    'system:doors_management',   // Door control capabilities, access routing
    'system:smart_hvac',         // Environmental controls
    `zone:${zoneId}`,            // Zone-level policy facts and role definitions
  ];

  // Add actor subject to related subjects for actor-scoped facts
  if (actorSubject) {
    relatedSubjects.push(actorSubject);
  }

  // 4) CURATED GOVERNED_FACTS: Small bundle (2-5 facts) relevant to room access
  // Keep total input <2KB for fast OPA evaluation
  const governedFacts: Array<{
    subject: string;
    predicate: string;
    object_data: Record<string, any>;
  }> = [];

  // Fact 1: System room environment capabilities
  // This enables policies to know what environmental controls are available
  governedFacts.push({
    subject: 'system:room_environment',
    predicate: 'hasCapabilities',
    object_data: {
      zones: ['JOURNEY', 'GIFT', 'WEAR', 'KIDS', 'DIRECTOR'],
      controlType: 'adaptive',
      integration: ['hvac', 'lighting', 'sensors', 'doors'],
      capabilities: [
        'temperature_control',
        'lighting_adjustment',
        'humidity_control',
        'air_quality',
        'door_access_control',
      ],
    },
  });

  // Fact 2: Room-specific security profile
  // This enables special room-level policy behavior (VIP, restricted, etc.)
  const securityProfile: Record<string, any> = {
    zone_id: zoneId,
    security_level: context?.securityLevel || (room.type === 'SUITE' ? 'vip' : 'standard'),
    requires_two_factor: context?.securityLevel === 'vip' || context?.securityLevel === 'restricted',
  };

  // Determine allowed/denied roles based on room type and security level
  if (room.type === 'SUITE' || securityProfile.security_level === 'vip') {
    securityProfile.allow_roles = ['DIRECTOR', 'VIP'];
    securityProfile.deny_roles = ['GUEST'];
  } else {
    securityProfile.allow_roles = ['DIRECTOR', 'GUEST'];
    securityProfile.deny_roles = [];
  }

  governedFacts.push({
    subject: baseSubject,
    predicate: 'securityProfile',
    object_data: securityProfile,
  });

  // Fact 3: Door linkage (if door ID is available)
  if (doorId) {
    governedFacts.push({
      subject: doorId,
      predicate: 'controlsAccessTo',
      object_data: {
        room_id: room.id,
        room_name: room.name,
        lock_state: context?.lockState || 'unlocked',
        access_system: 'system:doors_management',
      },
    });
  }

  const req: PKGEvaluateAsyncRequest = {
    task_facts: {
      namespace: 'hotel',
      subject: baseSubject,
      predicate: 'request_room_access',
      object_data: objectData,
    },
    zone_id: zoneId,
    snapshot_id: snapshot?.id,
    current_time: new Date().toISOString(),
    mode: 'advisory',
    related_subjects: relatedSubjects, // Multi-subject fact hydration
    signals: {
      // Actor/requestor context
      actor_subject: actorSubject,
      actor_role: actorRole,
      actor_auth_level: actorAuthLevel,
    },
    governed_facts: governedFacts, // Curated facts bundle (2-5 facts)
  };

  // MANUAL TAG ENRICHMENT for WASM rules
  (req.task_facts as any).tags = [
    'hotel',
    'request_room_access',
    `room:${room.id}`,
    'zone',
    'director',
    'room_selection',
    room.type.toLowerCase(),
    'multi_subject', // Flag indicating multi-subject evaluation
    actorRole.toLowerCase(), // Actor role tag
  ];

  return req;
}
