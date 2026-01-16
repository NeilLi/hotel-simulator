import { Room, Agent, AgentRole, EntityType, Coordinates } from "../types";
import { GRID_WIDTH, GRID_HEIGHT } from "../constants";
import { seedcoreService } from "../services/seedcoreService";

// --- LAYOUT CONFIGURATION ---
const WING_WIDTH = 20; // Width of side towers
const LOBBY_WIDTH = 24;
const LOBBY_HEIGHT = 12;

// Semantic Zones
const WEST_WING_X = 4;
const EAST_WING_X = GRID_WIDTH - WING_WIDTH - 4; // 80 - 20 - 4 = 56
const LOBBY_X = Math.floor((GRID_WIDTH - LOBBY_WIDTH) / 2); // Center ~28
const LOBBY_Y = GRID_HEIGHT - LOBBY_HEIGHT - 2; // Bottom aligned ~30

// Define explicitly what agents can walk on
const WALKABLE = new Set([
  EntityType.LOBBY_FLOOR,
  EntityType.ROOM_FLOOR,
  EntityType.GARDEN_PATH,
  EntityType.ROOM_DOOR,
  EntityType.RECEPTION_DESK,
  EntityType.SERVICE_HUB,
  EntityType.EMPTY // Allow walking in empty corridors if needed (usually handled by FLOOR types)
]);

const isWalkable = (grid: EntityType[][], x: number, y: number) => {
    if (y < 0 || y >= GRID_HEIGHT || x < 0 || x >= GRID_WIDTH) return false;
    return WALKABLE.has(grid[y][x]);
};

export const generateMap = (width: number, height: number) => {
  const grid: EntityType[][] = Array(height).fill(null).map(() => Array(width).fill(EntityType.EMPTY));
  const rooms: Room[] = [];

  // Helper to fill grid and create room metadata
  const createBlock = (
    id: string, 
    name: string, 
    type: 'SUITE' | 'LOBBY' | 'GARDEN' | 'SERVICE', 
    x: number, y: number, w: number, h: number,
    gridType: EntityType = EntityType.ROOM_FLOOR
  ) => {
    // Fill Grid
    for(let ry = y; ry < y + h; ry++) {
        for(let rx = x; rx < x + w; rx++) {
            if (rx >= 0 && rx < width && ry >= 0 && ry < height) {
                // Determine if wall or floor
                const isWall = rx === x || rx === x+w-1 || ry === y || ry === y+h-1;
                // Simple door logic: centers of walls
                const isDoor = isWall && (
                    (rx === x + Math.floor(w/2)) || // Top/Bottom middle
                    (ry === y + Math.floor(h/2))    // Left/Right middle
                );
                
                if (type === 'GARDEN') {
                    grid[ry][rx] = EntityType.GARDEN_PATH; // Base
                } else if (type === 'LOBBY') {
                    grid[ry][rx] = EntityType.LOBBY_FLOOR;
                } else {
                    if (isDoor) grid[ry][rx] = EntityType.ROOM_DOOR;
                    else if (isWall) grid[ry][rx] = EntityType.ROOM_WALL;
                    else grid[ry][rx] = gridType;
                }
            }
        }
    }
    
    // Create Room Object
    rooms.push({
        id, name, type,
        topLeft: {x, y},
        bottomRight: {x: x+w-1, y: y+h-1}
    });
  };

  // --- 1. THE GRAND LOBBY (South Center) ---
  createBlock("LOBBY-MAIN", "Grand Atrium", 'LOBBY', LOBBY_X, LOBBY_Y, LOBBY_WIDTH, LOBBY_HEIGHT);
  
  // Reception Desk (Visual only in grid)
  const deskX = LOBBY_X + Math.floor(LOBBY_WIDTH/2);
  const deskY = LOBBY_Y + LOBBY_HEIGHT - 3;
  if (deskY < height) {
      grid[deskY][deskX] = EntityType.RECEPTION_DESK;
      grid[deskY][deskX-1] = EntityType.RECEPTION_DESK;
      grid[deskY][deskX+1] = EntityType.RECEPTION_DESK;
  }

  // --- 2. WEST WING (Residential) ---
  // A vertical strip with a central corridor
  const westCorridorX = WEST_WING_X + 9;
  const wingTop = 4;
  const wingBottom = LOBBY_Y + 4; // Overlap slightly with lobby Y level
  
  // Draw Central Corridor for West Wing
  for(let y = wingTop; y < wingBottom; y++) {
      grid[y][westCorridorX] = EntityType.LOBBY_FLOOR;
      grid[y][westCorridorX+1] = EntityType.LOBBY_FLOOR;
  }

  // Rooms Left of Corridor
  const roomH = 5;
  const roomW = 8;
  for(let y = wingTop; y < wingBottom - roomH; y += roomH + 1) {
      createBlock(`W-${y}`, `Suite ${100 + Math.floor(y/6)}`, 'SUITE', WEST_WING_X, y, roomW, roomH);
  }
  // Rooms Right of Corridor
  for(let y = wingTop; y < wingBottom - roomH; y += roomH + 1) {
      createBlock(`W-${y}-B`, `Suite ${100 + Math.floor(y/6)}B`, 'SUITE', westCorridorX + 2, y, roomW, roomH);
  }

  // --- 3. EAST WING (Executive) ---
  const eastCorridorX = EAST_WING_X + 9;
  
  // Draw Central Corridor for East Wing
  for(let y = wingTop; y < wingBottom; y++) {
      grid[y][eastCorridorX] = EntityType.LOBBY_FLOOR;
      grid[y][eastCorridorX+1] = EntityType.LOBBY_FLOOR;
  }

  // Large Executive Suites (Wider)
  const suiteH = 7;
  const suiteW = 8; // Keep width similar but taller
  
  for(let y = wingTop; y < wingBottom - suiteH; y += suiteH + 1) {
      createBlock(`E-${y}`, `Exec. ${200 + Math.floor(y/8)}`, 'SUITE', EAST_WING_X, y, suiteW, suiteH);
  }
  for(let y = wingTop; y < wingBottom - suiteH; y += suiteH + 1) {
      createBlock(`E-${y}-B`, `Exec. ${200 + Math.floor(y/8)}B`, 'SUITE', eastCorridorX + 2, y, suiteW, suiteH);
  }

  // --- 4. CONNECTORS ---
  // Bottom Connector (Lobby to Wings)
  const connectorY = LOBBY_Y + 2;
  // Connect West
  for(let x = WEST_WING_X + WING_WIDTH; x < LOBBY_X; x++) {
      grid[connectorY][x] = EntityType.LOBBY_FLOOR;
      grid[connectorY+1][x] = EntityType.LOBBY_FLOOR;
  }
  // Connect East
  for(let x = LOBBY_X + LOBBY_WIDTH; x < EAST_WING_X; x++) {
      grid[connectorY][x] = EntityType.LOBBY_FLOOR;
      grid[connectorY+1][x] = EntityType.LOBBY_FLOOR;
  }

  // --- 5. NORTH SERVICE SPINE (Back of House) ---x
  const serviceY = 2;
  const serviceH = 4;
  createBlock("SERVICE-N", "North Service Spine", 'SERVICE', WEST_WING_X, serviceY, (EAST_WING_X + WING_WIDTH) - WEST_WING_X, serviceH, EntityType.SERVICE_HUB);
  
  // Vertical connectors to service spine
  // West
  for(let y=serviceY+serviceH; y<wingTop+4; y++) {
      grid[y][westCorridorX] = EntityType.LOBBY_FLOOR;
  }
  // East
  for(let y=serviceY+serviceH; y<wingTop+4; y++) {
      grid[y][eastCorridorX] = EntityType.LOBBY_FLOOR;
  }

  // --- 6. CENTRAL ZEN GARDEN ---
  const gardenX = WEST_WING_X + WING_WIDTH + 2;
  const gardenW = (EAST_WING_X - 2) - gardenX;
  const gardenY = serviceY + serviceH + 2;
  const gardenH = LOBBY_Y - gardenY - 2;

  createBlock("GARDEN-MAIN", "Central Zen Court", 'GARDEN', gardenX, gardenY, gardenW, gardenH);

  // Detail the garden grid
  for(let y=gardenY; y<gardenY+gardenH; y++) {
      for(let x=gardenX; x<gardenX+gardenW; x++) {
          const r = Math.random();
          // Central pond
          const cx = gardenX + gardenW/2;
          const cy = gardenY + gardenH/2;
          const dist = Math.sqrt(Math.pow(x-cx, 2) + Math.pow(y-cy, 2));
          
          if (dist < 5) grid[y][x] = EntityType.GARDEN_WATER;
          else if (r > 0.85) grid[y][x] = EntityType.GARDEN_PLANT;
      }
  }

  return { grid, rooms };
};

export const generateAgents = (count: number, width: number, height: number): Agent[] => {
  const agents: Agent[] = [];
  
  // 1. GUESTS (Wander Lobby and Garden)
  for (let i = 0; i < 6; i++) {
    agents.push({
      id: `G-${i}`,
      role: AgentRole.GUEST,
      position: { x: LOBBY_X + 10 + Math.floor(Math.random()*4), y: LOBBY_Y + 4 + Math.floor(Math.random()*4) },
      target: null, 
      state: 'WALKING',
      mood: 'Neutral'
    });
  }

  // 2. STAFF (Service Spine & Lobby)
  agents.push({
      id: `R-CONCIERGE`,
      role: AgentRole.ROBOT_CONCIERGE,
      position: { x: LOBBY_X + Math.floor(LOBBY_WIDTH/2), y: LOBBY_Y + LOBBY_HEIGHT - 2 },
      target: null, state: 'SERVICING', mood: 'Operational'
  });

  // 3. WAITERS (Spawn in visible areas: Lobby & Garden Entrance)
  const waiterSpawns = [
    { x: LOBBY_X + 4, y: LOBBY_Y + 4 }, // Left Lobby
    { x: LOBBY_X + LOBBY_WIDTH - 4, y: LOBBY_Y + 4 }, // Right Lobby
    { x: WEST_WING_X + WING_WIDTH + 4, y: LOBBY_Y - 4 } // Garden Entrance
  ];

  waiterSpawns.forEach((pos, i) => {
      agents.push({
        id: `R-WAITER-${i}`,
        role: AgentRole.ROBOT_WAITER,
        position: pos,
        target: null, state: 'SERVICING', mood: 'Operational'
      });
  });

  return agents;
};

export const updateAgentsLogic = (
    agents: Agent[], 
    grid: EntityType[][], 
    frozenAgentId: string | null = null
): Agent[] => {
  return agents.map(agent => {
    // Freeze Interaction
    if (frozenAgentId && agent.id === frozenAgentId) {
        return { ...agent, state: 'SOCIALIZING', target: agent.position };
    }

    let { position, target, state } = agent;
    const previousPosition = { ...position };

    const isValid = (x: number, y: number) => isWalkable(grid, x, y);

    // --- TARGET SELECTION ---
    if (!target || (position.x === target.x && position.y === target.y)) {
       
       if (Math.random() > 0.95) return { ...agent, state: 'PAUSING', target: position }; 
       state = 'WALKING';

       let attempts = 0;
       let found = false;
       while(!found && attempts < 10) {
          let tx = position.x + Math.floor(Math.random() * 10) - 5;
          let ty = position.y + Math.floor(Math.random() * 10) - 5;
          
          // Guests prefer Lobby/Garden
          if (agent.role === AgentRole.GUEST) {
              // Bias towards lobby center
              if (Math.random() > 0.5) {
                  tx = LOBBY_X + Math.floor(Math.random() * LOBBY_WIDTH);
                  ty = LOBBY_Y + Math.floor(Math.random() * LOBBY_HEIGHT);
              }
          }

          if (isValid(tx, ty)) {
              target = { x: tx, y: ty };
              found = true;
          }
          attempts++;
       }
       if (!found) target = position;
    }

    // --- MOVEMENT ---
    if (target) {
       const dx = Math.sign(target.x - position.x);
       const dy = Math.sign(target.y - position.y);
       
       const moves = [];
       // Manhatten-ish movement preference for robots (looks more mechanical)
       if (agent.role.includes('ROBOT')) {
           if (dx !== 0 && isValid(position.x + dx, position.y)) moves.push({ x: position.x + dx, y: position.y });
           else if (dy !== 0 && isValid(position.x, position.y + dy)) moves.push({ x: position.x, y: position.y + dy });
       } else {
           // Guests move diagonally
           if (dx !== 0) moves.push({ x: position.x + dx, y: position.y });
           if (dy !== 0) moves.push({ x: position.x, y: position.y + dy });
           if (dx !== 0 && dy !== 0) moves.push({ x: position.x + dx, y: position.y + dy });
       }

       const validMoves = moves.filter(m => isValid(m.x, m.y));
       if (validMoves.length > 0) {
           position = validMoves[Math.floor(Math.random() * validMoves.length)];
       } else {
           target = null; // Stuck, pick new target next tick
       }
    }

    return { ...agent, position, previousPosition, target, state };
  });
};

/**
 * Create a seedcore action task for a concierge ticket
 */
export const createSeedcoreActionTask = async (
  ticketType: string,
  room: string,
  description?: string
): Promise<void> => {
  try {
    const taskDescription = description || `${ticketType} for Room ${room}`;
    
    await seedcoreService.createTask({
      type: "action",
      description: taskDescription,
      params: {
        ticket_type: ticketType,
        room: room,
        domain: "hotel",
        action: ticketType.toLowerCase().replace(/\s+/g, "_"),
      },
      run_immediately: true,
    });
  } catch (error) {
    console.error("Failed to create seedcore action task:", error);
    // Don't throw - allow ticket creation to continue even if seedcore fails
  }
};