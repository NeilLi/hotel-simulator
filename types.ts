
export enum EntityType {
  EMPTY = 'EMPTY',
  WALL = 'WALL',
  LOBBY_FLOOR = 'LOBBY_FLOOR',
  RECEPTION_DESK = 'RECEPTION_DESK',
  GARDEN_PATH = 'GARDEN_PATH',
  GARDEN_PLANT = 'GARDEN_PLANT',
  GARDEN_WATER = 'GARDEN_WATER',
  ROOM_FLOOR = 'ROOM_FLOOR',
  ROOM_WALL = 'ROOM_WALL',
  ROOM_DOOR = 'ROOM_DOOR',
  ROOM_FURNITURE = 'ROOM_FURNITURE',
  SERVICE_HUB = 'SERVICE_HUB', // New: Robotic docking/prep area
}

export enum AgentRole {
  GUEST = 'GUEST',
  STAFF_HUMAN = 'STAFF_HUMAN',
  ROBOT_WAITER = 'ROBOT_WAITER',
  ROBOT_CONCIERGE = 'ROBOT_CONCIERGE',
  ROBOT_GARDENER = 'ROBOT_GARDENER',
}

export interface Coordinates {
  x: number;
  y: number;
}

export interface Agent {
  id: string;
  role: AgentRole;
  position: Coordinates;
  previousPosition?: Coordinates; // New: For calculating facing direction
  target: Coordinates | null;
  state: 'SOCIALIZING' | 'WALKING' | 'PAUSING' | 'OBSERVING' | 'SERVICING' | 'CHARGING' | 'CONVERSING';
  mood: string;
  // AI-generated dialogue and speech
  dialogue?: string;
  audioUrl?: string;
  lastDialogueTime?: number; // Timestamp of last dialogue generation
  isGeneratingDialogue?: boolean; // Flag to show when dialogue is being generated
}

export interface Room {
  id: string;
  name: string;
  type: 'SUITE' | 'LOBBY' | 'GARDEN' | 'SERVICE';
  topLeft: Coordinates;
  bottomRight: Coordinates;
}

export enum SeedCorePlane {
  NARRATIVE = 'NARRATIVE',
  DIRECTOR = 'DIRECTOR',
  ACTORS = 'ACTORS',
  SET = 'SET'
}

export interface SeedCoreLog {
  id: string;
  timestamp: number;
  plane: SeedCorePlane;
  message: string;
  mood: 'NEUTRAL' | 'WARM' | 'TENSE';
}

export interface SeedCoreState {
  activeAtmosphere: 'MORNING_LIGHT' | 'GOLDEN_HOUR' | 'EVENING_CHIC' | 'MIDNIGHT_LOUNGE';
  logs: SeedCoreLog[];
  timeOfDay: number;
}
