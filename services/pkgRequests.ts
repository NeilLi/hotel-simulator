// pkgRequests.ts
// Centralized request builders for SeedCore PKG evaluate_async.

import type { PKGEvaluateAsyncRequest } from './seedcoreService';
import type { WearableDesignDraft, WearableIntent, WearableTicket } from './wearableStudioTypes';
import type { Snapshot } from '../types';

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
