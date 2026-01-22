import React, { useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { MapControls, Html, Edges, Float } from "@react-three/drei";
import * as THREE from "three";
import { Room, Agent, AgentRole } from "../types";
import { GRID_WIDTH, GRID_HEIGHT } from "../constants";

// Fix: Add explicit declaration for JSX Intrinsic Elements to support React Three Fiber components
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
      
      // Geometries
      boxGeometry: any;
      sphereGeometry: any;
      planeGeometry: any;
      cylinderGeometry: any;
      torusGeometry: any;
      ringGeometry: any;
      circleGeometry: any;
      octahedronGeometry: any;
      icosahedronGeometry: any;
      
      // Materials
      meshBasicMaterial: any;
      meshStandardMaterial: any;
      meshPhysicalMaterial: any;
      
      // Removed duplicate index signature [elemName: string]: any; to avoid conflict with VirtualRealityLayer
    }
  }
}

const CELL_SIZE = 1;
const WALL_HEIGHT = 1.2; // Lower profile for blueprint look

const COLORS = {
  background: "#020617",
  grid: "#083344", // Deep cyan grid
  gridBright: "#22d3ee", // Bright cyan for lines
  room: "#22d3ee",
  garden: "#10b981",
  lobby: "#0ea5e9",
  service: "#f59e0b",
  guest: "#fbbf24", // Amber for guests
};

function BlueprintGrid() {
  return (
    <group position={[GRID_WIDTH / 2, -0.01, GRID_HEIGHT / 2]}>
      {/* Primary Grid Lines */}
      <gridHelper
        args={[
          Math.max(GRID_WIDTH, GRID_HEIGHT) * 1.5,
          Math.max(GRID_WIDTH, GRID_HEIGHT) * 1.5,
          COLORS.grid,
          COLORS.grid,
        ]}
        rotation={[0, 0, 0]}
      />
      {/* Subtle Floor Plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[GRID_WIDTH * 2, GRID_HEIGHT * 2]} />
        <meshBasicMaterial color="#010409" transparent opacity={0.8} />
      </mesh>
    </group>
  );
}

function AgentMarker({ agent }: { agent: Agent }) {
  const isRobot = agent.role !== AgentRole.GUEST;
  const color = isRobot ? COLORS.room : COLORS.guest;
  
  return (
    <group position={[agent.position.x, 0.1, agent.position.y]}>
      {/* Floating Dot */}
      <mesh>
        <sphereGeometry args={[0.2, 16, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>
      {/* Point Light for Glow Effect */}
      <pointLight color={color} intensity={0.5} distance={2} decay={2} />
      {/* Hover Ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.25, 0.3, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.3} />
      </mesh>
    </group>
  );
}

const RoomWireframe: React.FC<{
  room: Room;
  isSelected: boolean;
  onClick: (r: Room) => void;
}> = ({ room, isSelected, onClick }) => {
  const widthCells = room.bottomRight.x - room.topLeft.x + 1;
  const depthCells = room.bottomRight.y - room.topLeft.y + 1;

  if (widthCells <= 0 || depthCells <= 0) return null;

  const width = widthCells * CELL_SIZE;
  const depth = depthCells * CELL_SIZE;
  
  // Center position logic
  const x = (room.topLeft.x + room.bottomRight.x + 1) / 2;
  const z = (room.topLeft.y + room.bottomRight.y + 1) / 2;

  const isGarden = room.type === "GARDEN";
  const color = isGarden ? COLORS.garden : isSelected ? "#fff" : COLORS.room;
  const height = isGarden ? 0.2 : WALL_HEIGHT;

  const [hovered, setHover] = useState(false);
  const active = hovered || isSelected;

  return (
    <group position={[x, height / 2, z]}>
      {/* Volume Body (Hollow Look) */}
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          onClick(room);
        }}
        onPointerOver={() => setHover(true)}
        onPointerOut={() => setHover(false)}
      >
        <boxGeometry args={[width, height, depth]} />
        <meshBasicMaterial 
          color={color} 
          transparent 
          opacity={active ? 0.15 : 0.05} 
          side={THREE.DoubleSide}
        />
        {/* Crisp Outlines */}
        <Edges color={color} threshold={15} />
      </mesh>

      {/* Floating Technical Label */}
      <Html
        position={[0, height / 2 + 0.5, 0]}
        center
        distanceFactor={15}
        style={{ pointerEvents: "none" }}
      >
        <div className="flex flex-col items-center">
            <div className={`px-2 py-0.5 border border-cyan-500/30 rounded bg-slate-950/80 backdrop-blur-sm transition-all duration-300 ${active ? 'scale-110 border-white' : 'scale-100'}`}>
                <span className={`text-[10px] font-mono whitespace-nowrap uppercase tracking-widest ${active ? 'text-white font-bold' : 'text-cyan-400'}`}>
                    {room.name}
                </span>
            </div>
            {/* Connection Line Visual */}
            <div className="w-px h-2 bg-gradient-to-t from-cyan-500/50 to-transparent" />
        </div>
      </Html>
    </group>
  );
};

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
  const safeRooms = useMemo(() => (Array.isArray(rooms) ? rooms : []), [rooms]);
  const safeAgents = useMemo(() => (Array.isArray(agents) ? agents : []), [agents]);

  return (
    <div className="absolute inset-0 bg-slate-950 z-0">
      <Canvas
        dpr={[1, 2]}
        camera={{
          position: [GRID_WIDTH / 2, 60, GRID_HEIGHT / 2 + 40],
          fov: 35,
        }}
        gl={{
          antialias: true,
          alpha: false,
        }}
      >
        <color attach="background" args={[COLORS.background]} />
        
        <MapControls
          screenSpacePanning
          minDistance={20}
          maxDistance={150}
          maxPolarAngle={Math.PI / 2.5}
          target={[GRID_WIDTH / 2, 0, GRID_HEIGHT / 2]}
          makeDefault
        />

        <ambientLight intensity={0.5} />
        
        <BlueprintGrid />

        <group>
          {safeRooms.map((room) => (
            <RoomWireframe
              key={room.id}
              room={room}
              isSelected={selectedRoomId === room.id}
              onClick={(r) => onRoomSelect(r)}
            />
          ))}
        </group>

        <group>
            {safeAgents.map((agent) => (
                <AgentMarker key={agent.id} agent={agent} />
            ))}
        </group>

        {/* Backdrop for click-to-deselect */}
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[GRID_WIDTH / 2, -0.05, GRID_HEIGHT / 2]}
          onClick={(e) => { 
            e.stopPropagation(); 
            onRoomSelect(null); 
          }}
        >
          <planeGeometry args={[200, 200]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      </Canvas>
    </div>
  );
};