/* ---------------------------- Event Emitter Service ---------------------------- */

import type { SeedcoreHotelEvent, EventType } from './eventTypes';
import type {
  HotspotEnteredPayload,
  HotspotLeftPayload,
  VoiceTranscriptPayload,
  ButtonClickedPayload,
  KeyboardPressedPayload,
  RoomOccupancyChangedPayload,
  AgentStateChangedPayload,
} from './eventTypes';

type EventCallback = (event: SeedcoreHotelEvent) => void;

// Simple UUID generator
function generateUUID(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}-${Math.random().toString(36).substring(2, 9)}`;
}

class EventEmitterService {
  private callbacks: EventCallback[] = [];
  private sessionId: string;
  private userId?: string;

  constructor() {
    // Generate session ID (persists for this browser session)
    this.sessionId = this.getOrCreateSessionId();
  }

  private getOrCreateSessionId(): string {
    const stored = sessionStorage.getItem('seedcore_session_id');
    if (stored) return stored;
    
    const newId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    sessionStorage.setItem('seedcore_session_id', newId);
    return newId;
  }

  setUserId(userId: string) {
    this.userId = userId;
  }

  subscribe(callback: EventCallback): () => void {
    this.callbacks.push(callback);
    return () => {
      const index = this.callbacks.indexOf(callback);
      if (index > -1) {
        this.callbacks.splice(index, 1);
      }
    };
  }

  // Main emit function - publishes to seedcore.hotel.events
  emitHotelEvent(event: Omit<SeedcoreHotelEvent, 'eventId' | 'timestamp' | 'sessionId' | 'userId'>) {
    const fullEvent: SeedcoreHotelEvent = {
      ...event,
      eventId: generateUUID(),
      timestamp: Date.now(),
      sessionId: this.sessionId,
      userId: this.userId,
    };

    // Notify all subscribers (Kafka publisher, etc.)
    this.callbacks.forEach((cb) => {
      try {
        cb(fullEvent);
      } catch (error) {
        console.error('[EventEmitter] Callback error:', error);
      }
    });
  }

  // Convenience methods for UI events
  emitHotspotEntered(payload: HotspotEnteredPayload) {
    this.emitHotelEvent({
      source: "ui",
      type: "ui.hotspot.entered",
      payload,
    });
  }

  emitHotspotLeft(payload: HotspotLeftPayload) {
    this.emitHotelEvent({
      source: "ui",
      type: "ui.hotspot.left",
      payload,
    });
  }

  emitVoiceTranscript(payload: VoiceTranscriptPayload) {
    this.emitHotelEvent({
      source: "ui",
      type: "ui.voice.transcript.final",
      payload,
    });
  }

  emitButtonClick(payload: ButtonClickedPayload) {
    // Only emit meaningful button clicks
    const meaningfulButtons = [
      'initialize-intelligence',
      'director-mode',
      'robot-hotspot',
      'robot-panel-assistance',
      'robot-panel-services',
      'regenerate-visuals',
      'lobby-choice',
      'robot-panel-close',
    ];
    
    if (meaningfulButtons.includes(payload.buttonId)) {
      this.emitHotelEvent({
        source: "ui",
        type: "ui.button.clicked",
        payload,
      });
    }
  }

  emitKeyboardPressed(payload: KeyboardPressedPayload) {
    // Only emit meaningful keyboard actions
    if (payload.key === 'Enter' && payload.action) {
      this.emitHotelEvent({
        source: "ui",
        type: "ui.keyboard.pressed",
        payload,
      });
    }
  }

  // Convenience methods for Sim events
  emitRoomOccupancyChanged(payload: RoomOccupancyChangedPayload) {
    // Room occupancy events are already filtered for changes in App.tsx
    this.emitHotelEvent({
      source: "sim",
      type: "sim.room.occupancy.changed",
      payload,
    });
  }

  emitAgentStateChanged(payload: AgentStateChangedPayload) {
    // Agent state events are already filtered for significance in App.tsx
    this.emitHotelEvent({
      source: "sim",
      type: "sim.agent.state.changed",
      payload,
    });
  }
}

export const eventEmitter = new EventEmitterService();
