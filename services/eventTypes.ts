/* ---------------------------- Event Types ---------------------------- */

// Unified event type for seedcore.hotel.events topic
export type SeedcoreHotelEvent = {
  eventId: string;
  timestamp: number;
  sessionId: string;
  userId?: string;
  source: "ui" | "sim";
  type: string;
  payload: Record<string, unknown>;
};

// Allowed event types (meaningful events only)
export const ALLOWED_EVENT_TYPES = new Set([
  "ui.hotspot.entered",
  "ui.hotspot.left",
  "ui.voice.transcript.final",
  "ui.button.clicked",
  "ui.keyboard.pressed",
  "sim.room.occupancy.changed",
  "sim.agent.state.changed",
] as const);

// Event type definitions for type safety
export type UIEventType =
  | "ui.hotspot.entered"
  | "ui.hotspot.left"
  | "ui.voice.transcript.final"
  | "ui.button.clicked"
  | "ui.keyboard.pressed";

export type SimEventType =
  | "sim.room.occupancy.changed"
  | "sim.agent.state.changed";

export type EventType = UIEventType | SimEventType;

// Payload types for type safety
export interface HotspotEnteredPayload extends Record<string, unknown> {
  hotspotId: string;
}

export interface HotspotLeftPayload extends Record<string, unknown> {
  hotspotId: string;
}

export interface VoiceTranscriptPayload extends Record<string, unknown> {
  transcript: string;
  isFinal?: boolean;
}

export interface ButtonClickedPayload extends Record<string, unknown> {
  buttonId: string;
}

export interface KeyboardPressedPayload extends Record<string, unknown> {
  key: string;
  action?: string;
}

export interface RoomOccupancyChangedPayload extends Record<string, unknown> {
  roomId: string;
  roomName: string;
  occupancy: number;
}

export interface AgentStateChangedPayload extends Record<string, unknown> {
  agentId: string;
  agentRole: string;
  state: string;
  previousState?: string;
}

