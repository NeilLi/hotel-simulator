import React, {
  useMemo,
  useState,
  useRef,
  useEffect,
  Suspense,
  ErrorInfo,
  ReactNode,
} from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { MapControls, Html, Edges } from "@react-three/drei";
import { EffectComposer, Bloom, Noise, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import { Room, Agent, AgentRole } from "../types";
import { GRID_WIDTH, GRID_HEIGHT } from "../constants";

/**
 * If your project already has proper R3F JSX typings, you can delete this whole block.
 */
declare global {
  namespace JSX {
    interface IntrinsicElements {
      ambientLight: any;
      pointLight: any;
      spotLight: any;
      hemisphereLight: any;
      rectAreaLight: any;
      group: any;
      mesh: any;
      primitive: any;
      fog: any;
      gridHelper: any;
      boxGeometry: any;
      sphereGeometry: any;
      planeGeometry: any;
      ringGeometry: any;
      meshBasicMaterial: any;
      meshStandardMaterial: any;
    }
  }
}

const CELL_SIZE = 1;
const WALL_HEIGHT = 1.5;

type RoomStatus = "READY" | "OCCUPIED" | "RESERVED" | "PREPARE" | "CHECK_OUT";

type Bounds2D = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

interface EnhancedRoom {
  id: string;
  name: string;
  floor: number;
  type: "ROOM" | "LOBBY" | "CORRIDOR" | "GARDEN" | "SERVICE";
  status: RoomStatus;
  position: [number, number, number]; // [x, y, z] in WORLD units
  dimensions: [number, number, number]; // [w, h, d] in WORLD units
  doorDirection: "N" | "S" | "E" | "W";
  originalRoom: Room;
}

const STATUS_COLORS: Record<RoomStatus, string> = {
  READY: "#10b981",
  OCCUPIED: "#ef4444",
  RESERVED: "#3b82f6",
  PREPARE: "#f59e0b",
  CHECK_OUT: "#8b5cf6",
};

const THEME = {
  bg: "#000000", // Matte black - Stealth & singularity
  wall: "#2a3439", // Gunmetal base
  accent: "#22d3ee",
  grid: "#0a0a0a", // Near-black matte for grid base
  gridLine: "#1a1a1a", // Subtle matte gray for grid lines
  roomEdge: "#4a5a62", // Gunmetal for room edges/wireframes
  roomEdgeSelected: "#6a7a82", // Lighter gunmetal for selected rooms
};

const COLORS = {
  guest: "#fbbf24",
};

const WORLD = {
  width: GRID_WIDTH * CELL_SIZE,
  height: GRID_HEIGHT * CELL_SIZE,
  center: {
    x: (GRID_WIDTH * CELL_SIZE) / 2,
    z: (GRID_HEIGHT * CELL_SIZE) / 2,
  },
};

/**
 * ✅ One canonical transform for “grid cells” → world coordinates.
 * Assumes room topLeft/bottomRight are CELL INDICES (inclusive).
 */
function gridRectToWorld(room: Room) {
  const minX = room.topLeft.x;
  const maxX = room.bottomRight.x;
  const minY = room.topLeft.y;
  const maxY = room.bottomRight.y;

  const widthCells = maxX - minX + 1;
  const depthCells = maxY - minY + 1;

  const w = widthCells * CELL_SIZE;
  const d = depthCells * CELL_SIZE;

  // center of the inclusive cell-rect
  const cx = ((minX + maxX + 1) / 2) * CELL_SIZE;
  const cz = ((minY + maxY + 1) / 2) * CELL_SIZE;

  return { w, d, cx, cz };
}

function boundsFromEnhanced(r: EnhancedRoom): Bounds2D {
  const [x, , z] = r.position;
  const [w, , d] = r.dimensions;

  return {
    minX: x - w / 2,
    maxX: x + w / 2,
    minZ: z - d / 2,
    maxZ: z + d / 2,
  };
}

function intersects(a: Bounds2D, b: Bounds2D): boolean {
  return !(a.maxX <= b.minX || a.minX >= b.maxX || a.maxZ <= b.minZ || a.minZ >= b.maxZ);
}

function isSpineRoom(r: Room) {
  // SERVICE rooms are typically the long corridor/spine infrastructure
  return r.type === "SERVICE";
}

function clampFloor(f: number) {
  if (f < 1) return 1;
  if (f > 5) return 5;
  return f;
}

function resolveRoomFloor(room: Room): number {
  const anyRoom = room as any;

  // 1) Prefer explicit metadata if present
  const direct =
    anyRoom.floor ??
    anyRoom.level ??
    anyRoom.meta?.floor ??
    anyRoom.meta?.level ??
    anyRoom.metadata?.floor ??
    anyRoom.metadata?.level;

  if (typeof direct === "number" && Number.isFinite(direct)) return clampFloor(direct);

  // 2) Try ID patterns: "floor3", "f3", "lvl3", etc.
  const id = String(room.id ?? "");
  const idMatch = id.match(/(?:floor|lvl|level|f)\s*([1-5])/i);
  if (idMatch) return clampFloor(parseInt(idMatch[1], 10));

  // 3) Try NAME patterns (covers "F3-01", "3F", "Floor 3", "Level 3", "L3")
  const name = String(room.name ?? "");
  const nameMatch =
    name.match(/(?:floor|level|lvl)\s*([1-5])/i) ||
    name.match(/\bF\s*([1-5])\b/i) ||
    name.match(/\b([1-5])\s*F\b/i) ||
    name.match(/\bL\s*([1-5])\b/i) ||
    name.match(/\b([1-5])(?:st|nd|rd|th)\b/i);

  if (nameMatch) return clampFloor(parseInt(nameMatch[1], 10));

  // 4) For consistent grid: ALL rooms default to floor 1 unless explicitly specified
  // This ensures all rooms render consistently on the same floor
  // Common areas always floor 1
  if (room.type === "LOBBY" || room.type === "GARDEN" || room.type === "SERVICE") return 1;
  
  // All other rooms default to floor 1 for consistent rendering
  return 1;
}

function mapRoomType(room: Room): EnhancedRoom["type"] {
  if (room.type === "LOBBY") return "LOBBY";
  if (room.type === "GARDEN") return "GARDEN";
  if (room.type === "SERVICE") return "SERVICE";
  return "ROOM";
}

function getSuiteSide(room: Room): "A" | "B" {
  const rawName = String(room.name ?? "");
  const rawId = String(room.id ?? "");

  const isB =
    /\bB\b/i.test(rawName) ||
    /B$/.test(rawName) ||
    /-B\b/i.test(rawId) ||
    /B$/.test(rawId);

  return isB ? "B" : "A";
}

function withZ(room: EnhancedRoom, z: number): EnhancedRoom {
  const [x, y] = room.position;
  return { ...room, position: [x, y, z] };
}

function resolveOverlapsForFloor(rooms: EnhancedRoom[], padding: number): EnhancedRoom[] {
  // Keep infrastructure fixed; only move ROOM modules (suites).
  const fixed = rooms.filter((r) => r.type !== "ROOM");
  const movable = rooms
    .filter((r) => r.type === "ROOM")
    .slice()
    .sort((a, b) => {
      const ba = boundsFromEnhanced(a);
      const bb = boundsFromEnhanced(b);
      // north-to-south, then west-to-east, then stable by id
      if (ba.minZ !== bb.minZ) return ba.minZ - bb.minZ;
      if (ba.minX !== bb.minX) return ba.minX - bb.minX;
      return a.id.localeCompare(b.id);
    });

  const placed: Array<{ room: EnhancedRoom; bounds: Bounds2D }> = fixed.map((r) => ({
    room: r,
    bounds: boundsFromEnhanced(r),
  }));

  const moved: EnhancedRoom[] = [];

  for (const r0 of movable) {
    let r = r0;
    for (let iter = 0; iter < 50; iter++) {
      const b = boundsFromEnhanced(r);
      const colliders = placed.filter((p) => intersects(b, p.bounds));
      if (colliders.length === 0) break;

      const requiredShift = Math.max(
        ...colliders.map((p) => Math.max(0, p.bounds.maxZ - b.minZ + padding))
      );

      if (requiredShift <= 0) break;
      r = withZ(r, r.position[2] + requiredShift);
    }

    moved.push(r);
    placed.push({ room: r, bounds: boundsFromEnhanced(r) });
  }

  return [...fixed, ...moved];
}

function applySuiteNumberingForFloor(rooms: EnhancedRoom[], floor: number): EnhancedRoom[] {
  const suites = rooms.filter((r) => r.originalRoom.type === "SUITE");

  const bySide: Record<"A" | "B", EnhancedRoom[]> = { A: [], B: [] };
  for (const r of suites) bySide[getSuiteSide(r.originalRoom)].push(r);

  const nameById = new Map<string, string>();
  (["A", "B"] as const).forEach((side) => {
    const sorted = bySide[side].slice().sort((a, b) => {
      // order by final placement (north-to-south, then west-to-east), stable by id
      if (a.position[2] !== b.position[2]) return a.position[2] - b.position[2];
      if (a.position[0] !== b.position[0]) return a.position[0] - b.position[0];
      return a.id.localeCompare(b.id);
    });

    sorted.forEach((r, idx) => {
      const suiteNumber = floor * 100 + (idx + 1);
      nameById.set(r.id, `Suite ${suiteNumber}${side}`);
    });
  });

  return rooms.map((r) => {
    if (r.originalRoom.type !== "SUITE") return r;
    const name = nameById.get(r.id) ?? r.name;
    return { ...r, name };
  });
}

function defaultStatus(roomType: EnhancedRoom["type"]): RoomStatus {
  if (roomType === "SERVICE") return "PREPARE";
  return "READY";
}

function computeDoorDirection(
  roomCenter: { x: number; z: number },
  lobbyCenter: { x: number; z: number }
): "N" | "S" | "E" | "W" {
  const dx = roomCenter.x - lobbyCenter.x;
  const dz = roomCenter.z - lobbyCenter.z;

  // Door faces toward lobby (so direction is opposite of vector to lobby)
  if (Math.abs(dx) > Math.abs(dz)) {
    return dx > 0 ? "W" : "E";
  }
  return dz > 0 ? "N" : "S";
}

function mapRoomToEnhanced(
  room: Room,
  lobbyCenterWorld: { x: number; z: number },
  spineBounds?: Bounds2D
): EnhancedRoom | null {
  const t = mapRoomType(room);
  const { w, d, cx, cz } = gridRectToWorld(room);

  const h = t === "GARDEN" ? 0.2 : WALL_HEIGHT;
  const y = t === "GARDEN" ? 0.1 : h / 2;

  if (w <= 0 || d <= 0 || h <= 0) return null;

  // default Z
  let adjustedZ = cz;

  // Only shift normal rooms (not the spine itself)
  const shouldAvoidSpine = t === "ROOM" || t === "LOBBY";

  if (spineBounds && shouldAvoidSpine) {
    // create bounds for this room at its default position
    const roomBounds: Bounds2D = {
      minX: cx - w / 2,
      maxX: cx + w / 2,
      minZ: cz - d / 2,
      maxZ: cz + d / 2,
    };

    // If overlapping spine, push it SOUTH (positive Z) just enough
    if (intersects(roomBounds, spineBounds)) {
      const padding = CELL_SIZE * 1; // keep one cell gap

      // spine maxZ is the "lowest edge" of spine
      const requiredShift = spineBounds.maxZ - roomBounds.minZ + padding;

      adjustedZ = cz + requiredShift;
    }
  }

  const floor = resolveRoomFloor(room);
  const doorDirection = computeDoorDirection({ x: cx, z: adjustedZ }, lobbyCenterWorld);

  return {
    id: room.id,
    name: room.name,
    floor,
    type: t,
    status: defaultStatus(t),
    position: [cx, y, adjustedZ],
    dimensions: [w, h, d],
    doorDirection,
    originalRoom: room,
  };
}


function FloorGrid() {
  return (
    <group rotation={[-Math.PI / 2, 0, 0]} position={[WORLD.center.x, -0.01, WORLD.center.z]}>
      <mesh receiveShadow>
        <planeGeometry args={[WORLD.width, WORLD.height]} />
        <meshStandardMaterial 
          color={THEME.grid} 
          metalness={0.95} 
          roughness={0.15}
          envMapIntensity={0.5}
        />
      </mesh>

      <gridHelper
        args={[
          Math.max(WORLD.width, WORLD.height),
          Math.max(GRID_WIDTH, GRID_HEIGHT),
          THEME.gridLine,
          THEME.grid,
        ]}
        rotation={[Math.PI / 2, 0, 0]}
      />
    </group>
  );
}

/** Error boundary for post fx */
interface PostFxBoundaryProps {
  children: ReactNode;
}
interface PostFxBoundaryState {
  hasError: boolean;
}
class PostFxBoundary extends React.Component<PostFxBoundaryProps, PostFxBoundaryState> {
  state: PostFxBoundaryState = { hasError: false };
  static getDerivedStateFromError(): PostFxBoundaryState {
    return { hasError: true };
  }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn("Post-processing effects failed to initialize:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) return null;
    // TypeScript workaround for React.Component props access
    const props = (this as any).props as PostFxBoundaryProps;
    return props.children;
  }
}

interface AgentMarkerProps {
  agent: Agent;
}
const AgentMarker: React.FC<AgentMarkerProps> = ({ agent }) => {
  const isRobot = agent.role !== AgentRole.GUEST;
  const color = isRobot ? THEME.accent : COLORS.guest;

  // Keep consistent axis mapping: agent.position.x -> world X, agent.position.y -> world Z
  return (
    <group position={[agent.position.x * CELL_SIZE, 0.1, agent.position.y * CELL_SIZE]}>
      <mesh>
        <sphereGeometry args={[0.2, 16, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <pointLight color={color} intensity={0.5} distance={2} decay={2} />
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.25, 0.3, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.3} />
      </mesh>
    </group>
  );
};

interface RoomLabelProps {
  room: EnhancedRoom;
  isSelected: boolean;
  isHovered: boolean;
  labelPosition: [number, number, number];
  roomCenter: [number, number, number];
}

/**
 * Optimized screen-space room label with distance-based LOD
 */
const RoomLabel: React.FC<RoomLabelProps> = ({ 
  room, 
  isSelected, 
  isHovered,
  labelPosition,
  roomCenter 
}) => {
  const { camera } = useThree();
  const [distance, setDistance] = useState(0);
  const camPos = useRef(new THREE.Vector3());
  const roomPos = useRef(new THREE.Vector3(...roomCenter));
  
  // Update distance every frame for smooth LOD transitions
  useFrame(() => {
    camera.getWorldPosition(camPos.current);
    roomPos.current.set(...roomCenter);
    const dist = camPos.current.distanceTo(roomPos.current);
    setDistance(dist);
  });

  // Distance-based LOD: full name < 15, short < 30, hidden > 50
  const labelContent = useMemo(() => {
    if (isSelected || isHovered) return room.name; // Always show full name when focused
    
    // Special room types (LOBBY, GARDEN) always show full name when visible
    if (room.type === "LOBBY" || room.type === "GARDEN") {
      if (distance < 50) return room.name;
      return null; // Hidden when far
    }
    
    // Regular rooms with distance-based LOD
    if (distance < 15) return room.name;
    if (distance < 30) {
      // Extract short identifier (e.g., "Suite 201A" -> "201A", "Room 101" -> "101")
      const match = room.name.match(/(\d+[A-Z]?)$/i) || room.name.match(/([A-Z]\d+)/i);
      return match ? match[1] : room.name.split(' ').pop() || room.name;
    }
    if (distance < 50) {
      // Very short (just number)
      const match = room.name.match(/(\d+)/);
      return match ? match[1] : room.name.split(' ').pop() || room.name; // Fallback to last word if no number
    }
    return null; // Hidden when far
  }, [distance, room.name, room.type, isSelected, isHovered]);

  const shouldShow = labelContent !== null;
  const isFocused = isSelected || isHovered;
  
  // Scale based on distance and focus state
  const scale = useMemo(() => {
    if (isFocused) return 1.2;
    if (distance < 15) return 1.0;
    if (distance < 30) return 0.9;
    return 0.8;
  }, [distance, isFocused]);

  // Opacity based on distance
  const opacity = useMemo(() => {
    if (isFocused) return 1.0;
    if (distance < 15) return 0.95;
    if (distance < 30) return 0.85;
    if (distance < 50) return 0.7;
    return 0;
  }, [distance, isFocused]);

  if (!shouldShow) return null;

  return (
    <>
      {/* Screen-space label with golden styling */}
      <Html
        position={labelPosition}
        center
        sprite
        distanceFactor={50}
        style={{
          pointerEvents: 'none',
          userSelect: 'none',
          transform: `scale(${scale})`,
          opacity,
          transition: 'all 0.2s ease-out',
        }}
      >
        <div
          className="room-tag"
          style={{
            padding: isFocused ? '8px 14px' : '6px 12px',
            borderRadius: '999px',
            background: isFocused 
              ? 'rgba(251, 191, 36, 0.15)' 
              : 'rgba(10, 15, 20, 0.75)',
            border: `1px solid ${isFocused ? 'rgba(251, 191, 36, 0.6)' : 'rgba(251, 191, 36, 0.35)'}`,
            color: isFocused ? '#fbbf24' : '#fbbf24',
            fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
            fontWeight: 700,
            fontSize: isFocused ? '14px' : '13px',
            lineHeight: '1.1',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            boxShadow: isFocused
              ? '0 8px 24px rgba(0,0,0,0.6), 0 0 0 1px rgba(251,191,36,0.2), 0 0 24px rgba(251,191,36,0.4)'
              : '0 8px 24px rgba(0,0,0,0.45), 0 0 0 1px rgba(251,191,36,0.1), 0 0 18px rgba(251,191,36,0.2)',
            backdropFilter: 'blur(6px)',
            whiteSpace: 'nowrap',
            textShadow: '0 1px 2px rgba(0,0,0,0.8)',
          }}
        >
          {labelContent}
        </div>
      </Html>
    </>
  );
};

interface RoomModuleProps {
  room: EnhancedRoom;
  isSelected: boolean;
  onClick: () => void;
}

const RoomModule: React.FC<RoomModuleProps> = ({ room, isSelected, onClick }) => {
  const [hovered, setHovered] = useState(false);

  const baseColor = STATUS_COLORS[room.status];
  const roomColor = room.type === "LOBBY" ? THEME.accent : baseColor;
  // Use gunmetal as base for hard sci-fi aesthetic, status colors show through opacity
  const roomBaseColor = THEME.wall;
  // SERVICE rooms are infrastructure - make them more transparent to avoid visual overlap
  const opacity = room.type === "SERVICE"
    ? (isSelected ? 0.25 : hovered ? 0.12 : 0.06)
    : (isSelected ? 0.45 : hovered ? 0.25 : 0.12);

  const [w, h, d] = room.dimensions;
  const [x, y, z] = room.position;

  const doorPos = useMemo<[number, number, number]>(() => {
    // Door sits slightly outside the face
    const doorY = -h / 2 + 0.6;
    switch (room.doorDirection) {
      case "N":
        return [0, doorY, -d / 2 - 0.01];
      case "S":
        return [0, doorY, d / 2 + 0.01];
      case "E":
        return [w / 2 + 0.01, doorY, 0];
      case "W":
      default:
        return [-w / 2 - 0.01, doorY, 0];
    }
  }, [room.doorDirection, w, h, d]);

  const doorRot = useMemo<[number, number, number]>(() => {
    const needsYaw = room.doorDirection === "E" || room.doorDirection === "W";
    return [0, needsYaw ? Math.PI / 2 : 0, 0];
  }, [room.doorDirection]);

  // Label position: above the room center, slightly offset based on door direction
  const labelPosition = useMemo<[number, number, number]>(() => {
    const labelY = h / 2 + 0.3; // Above the room
    const offset = 0.15; // Small offset from center
    
    switch (room.doorDirection) {
      case "N":
        return [0, labelY, -offset];
      case "S":
        return [0, labelY, offset];
      case "E":
        return [offset, labelY, 0];
      case "W":
      default:
        return [-offset, labelY, 0];
    }
  }, [room.doorDirection, h]);

  // Room center in world space
  const roomCenter = useMemo<[number, number, number]>(() => {
    return [x, y + h / 2, z];
  }, [x, y, z, h]);

  return (
    <group
      position={room.position}
      onClick={(e: any) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <mesh
        onPointerOver={(e: any) => {
          e.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
      >
        <boxGeometry args={room.dimensions} />
        <meshStandardMaterial
          color={roomBaseColor}
          transparent
          opacity={opacity * 0.6}
          metalness={0.95}
          roughness={0.15}
          envMapIntensity={0.4}
          side={THREE.DoubleSide}
          emissive={roomColor}
          emissiveIntensity={isSelected ? 0.3 : hovered ? 0.15 : 0.1}
        />
        <Edges 
          color={isSelected ? THEME.roomEdgeSelected : THEME.roomEdge} 
          threshold={0.1} 
        />
      </mesh>

      {/* Door - skip for GARDEN and SERVICE */}
      {room.type !== "GARDEN" && room.type !== "SERVICE" && (
        <group position={doorPos} rotation={doorRot}>
          <mesh>
            <planeGeometry args={[0.8, 1.2]} />
            <meshBasicMaterial color={roomColor} transparent opacity={0.65} side={THREE.DoubleSide} />
          </mesh>
        </group>
      )}

      {/* Optimized screen-space labels */}
      {room.type !== "GARDEN" && (
        <RoomLabel
          room={room}
          isSelected={isSelected}
          isHovered={hovered}
          labelPosition={labelPosition}
          roomCenter={roomCenter}
        />
      )}

      {/* Enhanced spotlight when focused - same for all room types */}
      {(hovered || isSelected) && (
        <>
          {/* Main overhead spotlight - brighter for selected */}
          <pointLight 
            position={[0, h + 2, 0]} 
            color={roomColor} 
            intensity={isSelected ? 3.5 : 2.5} 
            distance={isSelected ? 12 : 10}
            decay={2}
            castShadow
          />
          {/* Ambient fill light from room center */}
          <pointLight 
            position={[0, h / 2, 0]} 
            color={roomColor} 
            intensity={isSelected ? 2.0 : 1.2} 
            distance={isSelected ? 8 : 6}
            decay={2.5}
          />
          {/* Edge accent lights - 4 corners for dramatic effect */}
          {isSelected && (
            <>
              <pointLight 
                position={[-w/2 + 0.5, h/2, -d/2 + 0.5]} 
                color={roomColor} 
                intensity={1.5} 
                distance={5}
                decay={3}
              />
              <pointLight 
                position={[w/2 - 0.5, h/2, -d/2 + 0.5]} 
                color={roomColor} 
                intensity={1.5} 
                distance={5}
                decay={3}
              />
              <pointLight 
                position={[-w/2 + 0.5, h/2, d/2 - 0.5]} 
                color={roomColor} 
                intensity={1.5} 
                distance={5}
                decay={3}
              />
              <pointLight 
                position={[w/2 - 0.5, h/2, d/2 - 0.5]} 
                color={roomColor} 
                intensity={1.5} 
                distance={5}
                decay={3}
              />
            </>
          )}
        </>
      )}
    </group>
  );
};

/**
 * ✅ Scene wrapper that can safely re-center camera/controls per floor.
 */
function Scene({
  rooms,
  agents,
  selectedRoomId,
  onRoomSelect,
  activeFloorKey,
}: {
  rooms: EnhancedRoom[];
  agents: Agent[];
  selectedRoomId?: string;
  onRoomSelect: (r: Room | null) => void;
  activeFloorKey: string; // changes when floor changes (or room set changes)
}) {
  const controlsRef = useRef<any>(null);
  const { camera, gl, scene } = useThree();
  const [isReady, setIsReady] = useState(false);
  
  // Wait for WebGL context and scene to be ready before enabling post-processing
  useEffect(() => {
    if (!gl || !gl.domElement || !scene || rooms.length === 0) {
      setIsReady(false);
      return;
    }
    
    // Wait for render targets to be initialized
    const timer = setTimeout(() => {
      try {
        const context = gl.getContext();
        if (context && !context.isContextLost()) {
          setIsReady(true);
        }
      } catch (e) {
        // Silently fail - post-processing is optional
        setIsReady(false);
      }
    }, 300);
    
    return () => clearTimeout(timer);
  }, [gl, scene, rooms.length]);

  // Fit camera + target based on current visible rooms bounds
  useEffect(() => {
    if (!rooms.length) return;

    let minX = Infinity,
      maxX = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity;

    for (const r of rooms) {
      const [x, , z] = r.position;
      const [w, , d] = r.dimensions;
      minX = Math.min(minX, x - w / 2);
      maxX = Math.max(maxX, x + w / 2);
      minZ = Math.min(minZ, z - d / 2);
      maxZ = Math.max(maxZ, z + d / 2);
    }

    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const spanX = Math.max(4, maxX - minX);
    const spanZ = Math.max(4, maxZ - minZ);
    const span = Math.max(spanX, spanZ);

    // Target center
    if (controlsRef.current) {
      controlsRef.current.target.set(cx, 0, cz);
      controlsRef.current.update();
    }

    // Camera position: consistent isometric-ish view
    const y = Math.min(45, Math.max(18, span * 1.1));
    camera.position.set(cx, y, cz + y * 0.9);
    camera.lookAt(cx, 0, cz);
    camera.updateProjectionMatrix();
  }, [activeFloorKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <MapControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.06}
        maxPolarAngle={Math.PI / 2.2}
        minDistance={8}
        maxDistance={70}
        target={[WORLD.center.x, 0, WORLD.center.z]}
        makeDefault
      />

      <ambientLight intensity={0.22} />
      <pointLight
        position={[WORLD.center.x + 10, 10, WORLD.center.z + 10]}
        intensity={1.5}
        color={THEME.accent}
      />
      <spotLight
        position={[WORLD.center.x, 20, WORLD.center.z]}
        angle={0.3}
        penumbra={1}
        intensity={2}
        castShadow
      />

      <Suspense fallback={null}>
        <group>
          {rooms.map((room) => (
            <RoomModule
              key={room.id}
              room={room}
              isSelected={selectedRoomId === room.id}
              onClick={() => {
                // Allow selection for ROOM, LOBBY, and GARDEN types
                // Skip SERVICE (spine) as it's infrastructure
                if (room.type === "ROOM" || room.type === "LOBBY" || room.type === "GARDEN") {
                  // Pass formatted name upstream so the App-level popup shows the same label.
                  onRoomSelect({ ...room.originalRoom, name: room.name });
                }
              }}
            />
          ))}
        </group>

        <FloorGrid />

        <group>
          {agents.map((agent) => (
            <AgentMarker key={agent.id} agent={agent} />
          ))}
        </group>
      </Suspense>

      {/* Post-processing - only render when scene is ready */}
      {isReady && rooms.length > 0 && (
        <PostFxBoundary>
          <Suspense fallback={null}>
            <EffectComposer multisampling={0} enableNormalPass={false}>
              <Bloom luminanceThreshold={0.2} mipmapBlur intensity={1.2} radius={0.4} />
              <Noise opacity={0.05} />
              <Vignette eskil={false} offset={0.1} darkness={1.1} />
            </EffectComposer>
          </Suspense>
        </PostFxBoundary>
      )}

      {/* Backdrop for click-to-deselect */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[WORLD.center.x, -0.05, WORLD.center.z]}
        onClick={(e: any) => {
          e.stopPropagation();
          onRoomSelect(null);
        }}
      >
        <planeGeometry args={[WORLD.width * 3, WORLD.height * 3]} />
        <meshBasicMaterial visible={false} />
      </mesh>
    </>
  );
}

export const DirectorMapLayer = ({
  rooms = [],
  agents = [],
  onRoomSelect,
  selectedRoomId,
}: {
  rooms?: Room[];
  agents?: Agent[];
  onRoomSelect: (r: Room | null) => void;
  selectedRoomId?: string;
}) => {
  const [selectedFloor, setSelectedFloor] = useState(1);

  const safeRooms = useMemo(() => (Array.isArray(rooms) ? rooms : []), [rooms]);
  const safeAgents = useMemo(() => (Array.isArray(agents) ? agents : []), [agents]);

  // Lobby center (WORLD) — used for door orientation
  const lobbyCenterWorld = useMemo(() => {
    const lobby = safeRooms.find((r) => r.type === "LOBBY");
    if (!lobby) return { x: WORLD.center.x, z: WORLD.center.z };
    const { cx, cz } = gridRectToWorld(lobby);
    return { x: cx, z: cz };
  }, [safeRooms]);

  // Compute spine bounds once
  const spineBounds = useMemo(() => {
    const spine = safeRooms.find((r) => isSpineRoom(r));
    if (!spine) return undefined;

    const t = mapRoomType(spine);
    const { w, d, cx, cz } = gridRectToWorld(spine);

    const h = t === "GARDEN" ? 0.2 : WALL_HEIGHT;
    const y = t === "GARDEN" ? 0.1 : h / 2;

    const spineEnhanced: EnhancedRoom = {
      id: spine.id,
      name: spine.name,
      floor: resolveRoomFloor(spine),
      type: t,
      status: defaultStatus(t),
      position: [cx, y, cz],
      dimensions: [w, h, d],
      doorDirection: "S",
      originalRoom: spine,
    };

    return boundsFromEnhanced(spineEnhanced);
  }, [safeRooms]);

  // Convert all rooms once (null-safe)
  const enhancedAll = useMemo(() => {
    const base = safeRooms
      .map((r) => mapRoomToEnhanced(r, lobbyCenterWorld, spineBounds))
      .filter(Boolean) as EnhancedRoom[];

    // 1) Resolve overlaps per-floor (collision-aware south shifts).
    // 2) Assign deterministic, unique suite labels in spatial order.
    const byFloor = new Map<number, EnhancedRoom[]>();
    for (const r of base) {
      const list = byFloor.get(r.floor) ?? [];
      list.push(r);
      byFloor.set(r.floor, list);
    }

    const padding = CELL_SIZE * 1; // keep at least one cell gap
    const floors = Array.from(byFloor.keys()).sort((a, b) => a - b);

    const out: EnhancedRoom[] = [];
    for (const f of floors) {
      const rooms = byFloor.get(f) ?? [];
      const resolved = resolveOverlapsForFloor(rooms, padding);
      const numbered = applySuiteNumberingForFloor(resolved, f);

      // Recompute door direction after any layout adjustments.
      const finalized = numbered.map((r) => ({
        ...r,
        doorDirection: computeDoorDirection({ x: r.position[0], z: r.position[2] }, lobbyCenterWorld),
      }));

      out.push(...finalized);
    }

    return out;
  }, [safeRooms, lobbyCenterWorld, spineBounds]);

  /**
   * ✅ Floor visibility rules:
   * - By default, ONLY show floor-matching rooms.
   * - Common areas: show on floor 1 only (prevents overlap “ghost rooms” on other floors).
   *
   * If your design wants lobby/garden/service visible on all floors,
   * change `COMMON_ON_ALL_FLOORS` to true.
   */
  const COMMON_ON_ALL_FLOORS = false;


  // Build floor index (counts per floor)
  const floorIndex = useMemo(() => {
    const counts = new Map<number, number>();
    for (const r of enhancedAll) {
      counts.set(r.floor, (counts.get(r.floor) ?? 0) + 1);
    }
    return counts;
  }, [enhancedAll]);

  // Still show 1..5, but we can disable empty floors
  const availableFloors = useMemo(() => [1, 2, 3, 4, 5], []);

  // Filter by selected floor ONLY (no "common areas on all floors" pollution)
  const enhancedRoomsFiltered = useMemo(() => {
    const filtered = enhancedAll.filter((r) => r.floor === selectedFloor);
    return filtered;
  }, [enhancedAll, selectedFloor]);

  const hasRoomsOnSelectedFloor = enhancedRoomsFiltered.length > 0;

  // Selected room in current floor set (for selection consistency only)
  const selectedRoomInView = useMemo(() => {
    if (!selectedRoomId) return null;
    return enhancedRoomsFiltered.find((r) => r.id === selectedRoomId) || null;
  }, [selectedRoomId, enhancedRoomsFiltered]);

  // ✅ If floor changes and selected room no longer exists, clear selection (consistency)
  useEffect(() => {
    if (selectedRoomId && !selectedRoomInView) onRoomSelect(null);
    // intentionally depends on selectedRoomInView computed above
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFloor]);

  // A stable key that changes when floor/layout changes (for camera fitting)
  const activeFloorKey = useMemo(() => {
    const ids = enhancedRoomsFiltered.map((r) => r.id).sort().join("|");
    return `${selectedFloor}:${ids}`;
  }, [selectedFloor, enhancedRoomsFiltered]);

  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      {/* Floor Selector */}
      <div className="absolute bottom-8 right-8 z-10 flex flex-col gap-2">
        {availableFloors.slice().reverse().map((f) => {
          const count = floorIndex.get(f) ?? 0;
          const disabled = count === 0;

          return (
            <button
              key={f}
              disabled={disabled}
              onClick={() => setSelectedFloor(f)}
              className={`w-12 h-12 rounded-lg border font-mono transition-all relative ${
                disabled
                  ? "bg-black/60 border-gray-800 text-gray-700 cursor-not-allowed"
                  : selectedFloor === f
                  ? "bg-cyan-500 border-cyan-400 text-white shadow-[0_0_15px_rgba(34,211,238,0.4)]"
                  : "bg-black/80 border-gray-700 text-gray-500 hover:border-cyan-500"
              }`}
              title={disabled ? "No rooms mapped to this floor" : `Rooms: ${count}`}
            >
              {f.toString().padStart(2, "0")}
              {!disabled && (
                <span className="absolute -top-2 -right-2 text-[10px] px-1.5 py-0.5 rounded bg-black/90 border border-gray-700 text-gray-300">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Status Legend */}
      <div className="absolute bottom-8 left-8 z-10 p-4 bg-black/80 backdrop-blur-md border border-gray-700 rounded-xl">
        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
          {Object.entries(STATUS_COLORS).map(([status, color]) => (
            <div key={status} className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-[10px] text-gray-400 font-mono uppercase tracking-wider">
                {status}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Canvas */}
      <div className="absolute inset-0">
        <Canvas
          shadows
          camera={{
            position: [WORLD.center.x, 35, WORLD.center.z + 25],
            fov: 50,
          }}
          gl={{
            antialias: true,
            alpha: false,
            depth: true,
            stencil: false,
          }}
          onCreated={({ gl }) => {
            gl.outputColorSpace = THREE.SRGBColorSpace;
          }}
        >
          <color attach="background" args={[THEME.bg]} />
          <fog attach="fog" args={[THEME.bg, 30, 120]} />

          <Scene
            rooms={enhancedRoomsFiltered}
            agents={safeAgents}
            selectedRoomId={selectedRoomId}
            onRoomSelect={onRoomSelect}
            activeFloorKey={activeFloorKey}
          />
        </Canvas>
      </div>

      {/* Empty Floor Overlay */}
      {!hasRoomsOnSelectedFloor && (
        <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center">
          <div className="px-5 py-4 rounded-2xl bg-black/80 border border-gray-700 backdrop-blur-md text-center max-w-md">
            <div className="text-cyan-400 font-mono text-xs tracking-widest uppercase mb-2">
              No rooms on Floor {selectedFloor.toString().padStart(2, "0")}
            </div>
            <div className="text-gray-300 text-sm">
              This usually means your room data doesn't include a usable floor field, or naming/IDs don't match the floor parser.
            </div>
            <div className="text-gray-500 text-xs mt-2 font-mono">
              Tip: include <span className="text-gray-300">room.floor</span> or <span className="text-gray-300">meta.floor</span>.
            </div>
          </div>
        </div>
      )}

      {/* Selection UI lives in App.tsx (single popup). */}
    </div>
  );
};
