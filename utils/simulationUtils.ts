
import { Room, Agent, AgentRole, EntityType, Coordinates, SeedCoreState } from "../types";
import { GRID_WIDTH, GRID_HEIGHT } from "../constants";
import { geminiService } from "../services/geminiService";
import { elevenLabsService } from "../services/elevenServices";

// --- GLOBAL LAYOUT CONSTANTS (Shared for generation and logic) ---
const ATRIUM_W = 20;
const ATRIUM_H = 12;
const ATRIUM_X = Math.floor(GRID_WIDTH / 2) - Math.floor(ATRIUM_W / 2); // 30
const ATRIUM_Y = GRID_HEIGHT - ATRIUM_H - 4; // 28

// Semantic Zones for AI Logic
const ZONES = {
  LOBBY: { x: ATRIUM_X, y: ATRIUM_Y, w: ATRIUM_W, h: ATRIUM_H },
  RECEPTION: { x: ATRIUM_X + Math.floor(ATRIUM_W / 2), y: ATRIUM_Y + 2 },
};

// Define explicitly what agents can walk on
const WALKABLE = new Set([
  EntityType.LOBBY_FLOOR,
  EntityType.ROOM_FLOOR,
  EntityType.GARDEN_PATH,
  EntityType.ROOM_DOOR,
  EntityType.RECEPTION_DESK, // Staff can be behind/at desk
  EntityType.SERVICE_HUB
]);

const isWalkable = (grid: EntityType[][], x: number, y: number) => {
    if (y < 0 || y >= GRID_HEIGHT || x < 0 || x >= GRID_WIDTH) return false;
    return WALKABLE.has(grid[y][x]);
};

export const generateMap = (width: number, height: number) => {
  const grid: EntityType[][] = Array(height).fill(null).map(() => Array(width).fill(EntityType.EMPTY));
  const rooms: Room[] = [];

  const safeSet = (x: number, y: number, type: EntityType) => {
    if (x >= 0 && x < width && y >= 0 && y < height) {
      grid[y][x] = type;
    }
  };

  // 1. GRAND ATRIUM (Lobby)
  for (let y = ATRIUM_Y; y < ATRIUM_Y + ATRIUM_H; y++) {
    for (let x = ATRIUM_X; x < ATRIUM_X + ATRIUM_W; x++) {
      safeSet(x, y, EntityType.LOBBY_FLOOR);
    }
  }
  // Reception Desk
  const deskY = ZONES.RECEPTION.y;
  const deskX = ZONES.RECEPTION.x;
  safeSet(deskX, deskY, EntityType.RECEPTION_DESK);
  safeSet(deskX - 1, deskY, EntityType.RECEPTION_DESK);
  safeSet(deskX + 1, deskY, EntityType.RECEPTION_DESK);

  rooms.push({
    id: "LOBBY-MAIN",
    name: "Grand Atrium",
    type: 'LOBBY',
    topLeft: { x: ATRIUM_X, y: ATRIUM_Y },
    bottomRight: { x: ATRIUM_X + ATRIUM_W - 1, y: ATRIUM_Y + ATRIUM_H - 1 }
  });

  // 2. WINGS GENERATION
  const createRoom = (id: string, x: number, y: number, w: number, h: number) => {
    // Walls
    for (let ry = y; ry < y + h; ry++) {
      for (let rx = x; rx < x + w; rx++) {
        if (rx === x || rx === x + w - 1 || ry === y || ry === y + h - 1) {
           // Door logic: Bottom center of room if above hall, Top center if below
           const isDoor = (ry === y + h - 1 || ry === y) && rx === x + Math.floor(w/2);
           if (isDoor) safeSet(rx, ry, EntityType.ROOM_DOOR);
           else safeSet(rx, ry, EntityType.ROOM_WALL);
        } else {
           safeSet(rx, ry, EntityType.ROOM_FLOOR);
        }
      }
    }
    // Furniture
    safeSet(x + 1, y + 1, EntityType.ROOM_FURNITURE);
    rooms.push({ id, name: `Room ${id}`, type: 'SUITE', topLeft: {x,y}, bottomRight: {x:x+w-1, y:y+h-1} });
  };

  // Vertical Wings extending UP from the Atrium sides
  const westWingX = ATRIUM_X - 2; // 28
  const eastWingX = ATRIUM_X + ATRIUM_W + 1; // 51
  const wingHeight = 26; 
  
  // West Wing Hallway
  for(let y = ATRIUM_Y - wingHeight; y < ATRIUM_Y; y++) {
      safeSet(westWingX, y, EntityType.LOBBY_FLOOR); 
      safeSet(westWingX - 1, y, EntityType.LOBBY_FLOOR); 
  }

  // East Wing Hallway
  for(let y = ATRIUM_Y - wingHeight; y < ATRIUM_Y; y++) {
      safeSet(eastWingX, y, EntityType.LOBBY_FLOOR); 
      safeSet(eastWingX + 1, y, EntityType.LOBBY_FLOOR); 
  }

  // Generate Rooms along West Wing
  for(let i=0; i<6; i++) {
     createRoom(`1${i}A`, westWingX - 6, ATRIUM_Y - 4 - (i*4), 5, 4);
     createRoom(`1${i}B`, westWingX + 1, ATRIUM_Y - 4 - (i*4), 5, 4);
  }

  // Generate Rooms along East Wing
  for(let i=0; i<6; i++) {
     createRoom(`2${i}A`, eastWingX - 5, ATRIUM_Y - 4 - (i*4), 5, 4);
     createRoom(`2${i}B`, eastWingX + 2, ATRIUM_Y - 4 - (i*4), 5, 4);
  }

  // 3. TOP CONNECTING CORRIDOR
  const bridgeY = Math.max(0, ATRIUM_Y - wingHeight);
  for(let x = westWingX; x <= eastWingX; x++) {
      safeSet(x, bridgeY, EntityType.LOBBY_FLOOR);
      safeSet(x, bridgeY + 1, EntityType.LOBBY_FLOOR);
  }
  // Rooms along the top bridge
  for(let i=0; i<6; i++) {
     createRoom(`30${i}`, westWingX + 2 + (i*6), bridgeY - 4, 5, 4);
  }

  // 4. GARDEN
  const gardenX = westWingX + 4;
  const gardenY = bridgeY + 4;
  const gardenW = (eastWingX - westWingX) - 6;
  const gardenH = (ATRIUM_Y - bridgeY) - 6;

  for(let y=gardenY; y<gardenY+gardenH; y++) {
    for(let x=gardenX; x<gardenX+gardenW; x++) {
       const r = Math.random();
       if (r > 0.8) safeSet(x, y, EntityType.GARDEN_PLANT);
       else if (r > 0.6) safeSet(x, y, EntityType.GARDEN_WATER);
       else safeSet(x, y, EntityType.GARDEN_PATH);
    }
  }
  rooms.push({
      id: "GARDEN-MAIN", name: "Central Zen Court", type: 'GARDEN', 
      topLeft: {x: gardenX, y: gardenY}, bottomRight: {x: gardenX+gardenW, y: gardenY+gardenH}
  });

  return { grid, rooms };
};

// --- AI DIALOGUE & SPEECH GENERATION ---

// Throttle dialogue generation (avoid API spam)
const DIALOGUE_COOLDOWN_MS = 15000; // Generate dialogue every 15 seconds max per agent
const DIALOGUE_CHANCE = 0.15; // 15% chance per eligible state change

// Conversation lock: Only one agent can be in CONVERSING state at a time
let currentConversingAgentId: string | null = null;
let dialogueGenerationQueue: Array<() => Promise<void>> = [];
let isProcessingDialogue = false;

// Voice IDs for different agent roles
const VOICE_IDS = {
  [AgentRole.GUEST]: '21m00Tcm4TlvDq8ikWAM', // Rachel - warm, human
  [AgentRole.ROBOT_WAITER]: 'EXAVITQu4vr4xnSDxMaL', // Bella - professional, friendly
  [AgentRole.ROBOT_CONCIERGE]: 'VR6AewLTigWG4xSOukaG', // Arnold - authoritative, helpful
  [AgentRole.ROBOT_GARDENER]: 'ThT5KcBeYPX3keUQqHPh', // Dorothy - calm, gentle
  [AgentRole.STAFF_HUMAN]: '21m00Tcm4TlvDq8ikWAM', // Rachel
};

/**
 * Generate contextual dialogue for an agent using Gemini
 */
async function generateAgentDialogue(
  agent: Agent,
  state: SeedCoreState,
  nearbyAgents: Agent[]
): Promise<string | null> {
  try {
    const roleName = agent.role === AgentRole.GUEST ? 'Guest' :
                     agent.role === AgentRole.ROBOT_WAITER ? 'Robot Waiter' :
                     agent.role === AgentRole.ROBOT_CONCIERGE ? 'Robot Concierge' :
                     agent.role === AgentRole.ROBOT_GARDENER ? 'Robot Gardener' :
                     'Staff';

    const location = agent.position.x >= ATRIUM_X && agent.position.x < ATRIUM_X + ATRIUM_W &&
                     agent.position.y >= ATRIUM_Y && agent.position.y < ATRIUM_Y + ATRIUM_H
                     ? 'Grand Atrium' : 'Hotel Wing';

    const nearbyCount = nearbyAgents.length;
    const context = nearbyCount > 0 
      ? `There are ${nearbyCount} other ${nearbyCount === 1 ? 'person' : 'people'} nearby.`
      : 'You are alone in this area.';

    const prompt = `You are a ${roleName} in a luxury hotel simulation.
Current state: ${agent.state}
Mood: ${agent.mood}
Location: ${location}
Time: ${state.timeOfDay.toFixed(1)} hours
Atmosphere: ${state.activeAtmosphere}
${context}

Generate ONE complete, natural sentence (15-25 words) that this ${roleName} would say in this situation.
- If you're a robot waiter: Be polite, helpful, service-oriented. Offer assistance or make an observation about the hotel.
- If you're a guest: Be casual, conversational. Comment on the hotel atmosphere, your experience, or what you're noticing.
- Make it a full, complete sentence. No markdown, no quotes, just plain text dialogue.`;

    // Use geminiService's generateNarrative method as a base, but customize for agents
    // We'll use a simplified approach that works with the existing service
    const { GoogleGenAI } = await import("@google/genai");
    const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('[simulationUtils] No API key available for dialogue generation');
      return null;
    }

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        temperature: 0.9,
        maxOutputTokens: 150, // Increased to allow for longer, more natural dialogue
      }
    });

    const text = response?.text?.trim() || null;
    
    if (text) {
      // Remove any quotes that might wrap the response
      let cleanedText = text.replace(/^["']|["']$/g, '').trim();
      
      // Ensure we have a complete sentence (ends with punctuation)
      if (cleanedText && !cleanedText.match(/[.!?]$/)) {
        // If it doesn't end with punctuation, it might be truncated
        // Try to find the last complete sentence
        const sentences = cleanedText.match(/[^.!?]*[.!?]/g);
        if (sentences && sentences.length > 0) {
          cleanedText = sentences.join(' ').trim();
        }
      }
      
      console.log(`[simulationUtils] Generated dialogue for ${agent.id}: "${cleanedText}"`);
      return cleanedText.length > 0 ? cleanedText : null;
    }
    
    console.warn(`[simulationUtils] No dialogue generated for ${agent.id}`);
    return null;
  } catch (error) {
    console.error(`[simulationUtils] Failed to generate dialogue for ${agent.id}:`, error);
    return null;
  }
}

/**
 * Convert dialogue to speech using ElevenLabs
 */
async function convertDialogueToSpeech(
  dialogue: string,
  agentRole: AgentRole
): Promise<string | null> {
  try {
    const voiceId = VOICE_IDS[agentRole] || VOICE_IDS[AgentRole.GUEST];
    
    // Adjust voice settings based on role
    const voiceSettings = agentRole === AgentRole.ROBOT_WAITER || agentRole === AgentRole.ROBOT_CONCIERGE
      ? { stability: 0.5, similarity_boost: 0.8 } // More consistent for robots
      : { stability: 0.35, similarity_boost: 0.75 }; // More natural for guests

    const result = await elevenLabsService.textToSpeech(dialogue, voiceId, voiceSettings);
    
    if (result.audioUrl && !result.error) {
      return result.audioUrl;
    }
    
    return null;
  } catch (error) {
    console.error(`[simulationUtils] Failed to convert dialogue to speech:`, error);
    return null;
  }
}

/**
 * Check if agent should generate dialogue based on state and timing
 */
function shouldGenerateDialogue(agent: Agent, currentTime: number): boolean {
  // Only generate for guests and waiters
  if (agent.role !== AgentRole.GUEST && agent.role !== AgentRole.ROBOT_WAITER) {
    return false;
  }

  // Check cooldown
  if (agent.lastDialogueTime) {
    const timeSinceLastDialogue = currentTime - agent.lastDialogueTime;
    if (timeSinceLastDialogue < DIALOGUE_COOLDOWN_MS) {
      return false;
    }
  }

  // Only generate in certain states
  const eligibleStates = ['PAUSING', 'SOCIALIZING', 'OBSERVING', 'SERVICING', 'CONVERSING'];
  if (!eligibleStates.includes(agent.state)) {
    return false;
  }

  // Random chance to avoid generating for all agents simultaneously
  return Math.random() < DIALOGUE_CHANCE;
}

/**
 * Find nearby agents (within 5 grid units)
 */
function findNearbyAgents(agent: Agent, allAgents: Agent[]): Agent[] {
  return allAgents.filter(other => {
    if (other.id === agent.id) return false;
    const dx = Math.abs(other.position.x - agent.position.x);
    const dy = Math.abs(other.position.y - agent.position.y);
    return dx <= 5 && dy <= 5;
  });
}

export const generateAgents = (count: number, width: number, height: number): Agent[] => {
  const agents: Agent[] = [];
  
  // GUEST GENERATION: Focused in the Lobby Atrium for visibility
  const guestCount = 10;
  
  for (let i = 0; i < guestCount; i++) {
    // Spawn mostly in lobby, some near wings
    // Bias towards the center (ATRIUM_X + W/2) ~ 40
    const centerX = ATRIUM_X + Math.floor(ATRIUM_W / 2);
    const centerY = ATRIUM_Y + Math.floor(ATRIUM_H / 2);
    
    // Random position within Atrium bounds
    const spawnX = centerX + Math.floor(Math.random() * 12) - 6;
    const spawnY = centerY + Math.floor(Math.random() * 8) - 4;

    agents.push({
      id: `G-${i}`,
      role: AgentRole.GUEST,
      position: { x: Math.max(0, spawnX), y: Math.max(0, spawnY) },
      target: null, 
      state: 'WALKING',
      mood: 'Neutral'
    });
  }

  // ROBOT GENERATION
  const robotCount = 5;
  
  for (let i = 0; i < robotCount; i++) {
    const isConcierge = i % 2 === 0;
    let spawnX, spawnY;

    if (isConcierge) {
      spawnX = ZONES.RECEPTION.x;
      spawnY = ZONES.RECEPTION.y;
    } else {
      const centerX = ATRIUM_X + Math.floor(ATRIUM_W / 2);
      const centerY = ATRIUM_Y + Math.floor(ATRIUM_H / 2);
      spawnX = centerX + Math.floor(Math.random() * 8) - 4;
      spawnY = centerY + Math.floor(Math.random() * 8) - 4;
    }

    agents.push({
      id: `R-${i}`,
      role: isConcierge ? AgentRole.ROBOT_CONCIERGE : AgentRole.ROBOT_WAITER,
      position: { x: spawnX, y: spawnY },
      target: null,
      state: 'SERVICING',
      mood: 'Operational'
    });
  }

  return agents;
};

export const updateAgentsLogic = (
  agents: Agent[], 
  grid: EntityType[][],
  coreState?: SeedCoreState
): Agent[] => {
  const currentTime = Date.now();
  const defaultState: SeedCoreState = {
    activeAtmosphere: 'MORNING_LIGHT',
    logs: [],
    timeOfDay: 12.0
  };
  const state = coreState || defaultState;

  return agents.map(agent => {
    let { position, target, state: agentState } = agent;
    const previousPosition = { ...position };

    const isValid = (x: number, y: number) => isWalkable(grid, x, y);

    // TARGET SELECTION LOGIC - Skip if agent is in CONVERSING state
    if (agentState === 'CONVERSING') {
      // Keep agent stationary, don't change target or state
      target = position;
    } else if (!target || (position.x === target.x && position.y === target.y)) {
       let attempts = 0;
       let found = false;
       
       if (Math.random() > 0.8) {
           agentState = 'PAUSING';
           target = position;
       } else {
           agentState = 'WALKING';
       }

       while(!found && attempts < 15) {
          let tx, ty;

          // Free movement logic primarily in lobby
          if (agent.role === AgentRole.ROBOT_CONCIERGE) {
             tx = ZONES.RECEPTION.x + Math.floor(Math.random() * 8) - 4;
             ty = ZONES.RECEPTION.y + Math.floor(Math.random() * 6) - 3;
          } 
          else {
             // Guests and Waiters wander the main atrium freely
             const centerX = ATRIUM_X + Math.floor(ATRIUM_W / 2);
             const centerY = ATRIUM_Y + Math.floor(ATRIUM_H / 2);
             
             tx = centerX + Math.floor(Math.random() * 16) - 8;
             ty = centerY + Math.floor(Math.random() * 10) - 5;
          }
          
          tx = Math.floor(tx);
          ty = Math.floor(ty);

          if (isValid(tx, ty)) {
              target = { x: tx, y: ty };
              found = true;
          }
          attempts++;
       }
       
       if (!found) target = position;
    }

    // CONVERSING state logic: Stay in conversation, don't move
    if (agentState === 'CONVERSING') {
      // Keep agent stationary (target already set to current position)
      target = position;
      // After some time (simulated by random chance), return to normal state
      // Increased duration: 2% chance per tick (about 50 seconds average at 1 tick/second)
      if (Math.random() < 0.02) {
        agentState = 'PAUSING';
      }
    }
    
    // MOVEMENT LOGIC - Skip movement if agent is in CONVERSING state
    if (agentState !== 'CONVERSING' && target && (target.x !== position.x || target.y !== position.y)) {
       const dx = Math.sign(target.x - position.x);
       const dy = Math.sign(target.y - position.y);
       
       const moves = [];
       if (dx !== 0) moves.push({ x: position.x + dx, y: position.y });
       if (dy !== 0) moves.push({ x: position.x, y: position.y + dy });
       if (dx !== 0 && dy !== 0) moves.push({ x: position.x + dx, y: position.y + dy }); // Allow diagonal

       const validMoves = moves.filter(m => isValid(m.x, m.y));

       if (validMoves.length > 0) {
           position = validMoves[Math.floor(Math.random() * validMoves.length)];
       } else {
           target = null;
       }
    }

    // Return updated agent (dialogue generation happens separately via updateAgentsDialogue)
    return { ...agent, position, previousPosition, target, state: agentState };
  });
};

/**
 * Process the dialogue generation queue one at a time
 */
async function processDialogueQueue(): Promise<void> {
  if (isProcessingDialogue || dialogueGenerationQueue.length === 0) {
    return;
  }

  isProcessingDialogue = true;
  const nextTask = dialogueGenerationQueue.shift();
  
  if (nextTask) {
    try {
      await nextTask();
    } catch (error) {
      console.error('[simulationUtils] Error processing dialogue queue:', error);
    } finally {
      isProcessingDialogue = false;
      // Process next item in queue
      if (dialogueGenerationQueue.length > 0) {
        setTimeout(() => processDialogueQueue(), 500); // Small delay between requests
      }
    }
  }
}

/**
 * Generate dialogue immediately for a specific agent (e.g., when clicked)
 * This bypasses cooldown and state checks for immediate response
 * Uses a queue to prevent concurrent API calls
 */
export async function generateDialogueForAgent(
  agent: Agent,
  allAgents: Agent[],
  coreState: SeedCoreState,
  onAgentUpdate?: (agentId: string, dialogue: string, audioUrl: string | null) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Add to queue
    dialogueGenerationQueue.push(async () => {
      try {
        const nearbyAgents = findNearbyAgents(agent, allAgents);
        const dialogue = await generateAgentDialogue(agent, coreState, nearbyAgents);
        
        if (dialogue) {
          const audioUrl = await convertDialogueToSpeech(dialogue, agent.role);
          
          // Callback to update agent state (caller should handle state update)
          if (onAgentUpdate) {
            onAgentUpdate(agent.id, dialogue, audioUrl);
          } else {
            console.log(`[Agent ${agent.id}] Dialogue: "${dialogue}"${audioUrl ? ' (audio ready)' : ''}`);
          }
          
          // Play audio immediately if available
          if (audioUrl && typeof window !== 'undefined') {
            const audio = new Audio(audioUrl);
            audio.volume = 0.7;
            audio.play().catch(error => {
              console.warn(`[simulationUtils] Failed to play audio for ${agent.id}:`, error);
            });
          }
        }
        resolve();
      } catch (error) {
        console.error(`[simulationUtils] Error generating dialogue for ${agent.id}:`, error);
        reject(error);
      }
    });

    // Start processing queue if not already processing
    processDialogueQueue();
  });
}

/**
 * Exit conversation for the currently conversing agent
 */
export function exitConversation(agentId: string): void {
  if (currentConversingAgentId === agentId) {
    currentConversingAgentId = null;
  }
}

/**
 * Set the currently conversing agent (only one at a time)
 */
export function setConversingAgent(agentId: string): string | null {
  const previousAgentId = currentConversingAgentId;
  currentConversingAgentId = agentId;
  return previousAgentId; // Return previous agent ID so caller can exit it
}

/**
 * Async function to update agent dialogue and speech
 * Call this separately from updateAgentsLogic to avoid blocking movement updates
 */
export async function updateAgentsDialogue(
  agents: Agent[],
  coreState: SeedCoreState,
  onAgentUpdate?: (agentId: string, dialogue: string, audioUrl: string | null) => void
): Promise<void> {
  const currentTime = Date.now();
  
  // Process one agent at a time to avoid API rate limits
  for (const agent of agents) {
    if (shouldGenerateDialogue(agent, currentTime)) {
      try {
        const nearbyAgents = findNearbyAgents(agent, agents);
        const dialogue = await generateAgentDialogue(agent, coreState, nearbyAgents);
        
        if (dialogue) {
          const audioUrl = await convertDialogueToSpeech(dialogue, agent.role);
          
          // Callback to update agent state (caller should handle state update)
          if (onAgentUpdate) {
            onAgentUpdate(agent.id, dialogue, audioUrl);
          } else {
            console.log(`[Agent ${agent.id}] Dialogue: "${dialogue}"${audioUrl ? ' (audio ready)' : ''}`);
          }
          
          // Play audio immediately if available
          if (audioUrl && typeof window !== 'undefined') {
            const audio = new Audio(audioUrl);
            audio.volume = 0.7;
            audio.play().catch(error => {
              console.warn(`[simulationUtils] Failed to play audio for ${agent.id}:`, error);
            });
          }
        }
      } catch (error) {
        console.error(`[simulationUtils] Error generating dialogue for ${agent.id}:`, error);
      }
    }
  }
}
