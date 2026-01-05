import React, { useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { MapControls, Html, SoftShadows } from "@react-three/drei";
import * as THREE from "three";
import { Room, Agent } from "../types";
import { GRID_WIDTH, GRID_HEIGHT } from "../constants";

// Fix for missing R3F types in JSX
declare global {
  namespace JSX {
    interface IntrinsicElements {
      group: any;
      mesh: any;
      primitive: any;
      ambientLight: any;
      pointLight: any;
      spotLight: any;
      hemisphereLight: any;
      directionalLight: any;
      fogExp2: any;
      gridHelper: any;
      boxGeometry: any;
      sphereGeometry: any;
      planeGeometry: any;
      cylinderGeometry: any;
      coneGeometry: any;
      circleGeometry: any;
      ringGeometry: any;
      torusGeometry: any;
      icosahedronGeometry: any;
      octahedronGeometry: any;
      meshStandardMaterial: any;
      meshBasicMaterial: any;
      meshPhysicalMaterial: any;
      color: any;
    }
  }
}

const CELL_SIZE = 1;
const WALL_HEIGHT = 2.5;

const COLORS = {
  background: "#020617",
  grid: "#1e293b",
  room: "#0891b2",
  garden: "#059669",
  lobby: "#0ea5e9",
  service: "#f59e0b", // Amber for Service
  debug: "#ef4444",
};

function GridFloor() {
  return (
    <group position={[GRID_WIDTH / 2, -0.05, GRID_HEIGHT / 2]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh receiveShadow>
        <planeGeometry args={[GRID_WIDTH * 1.5, GRID_HEIGHT * 1.5]} />
        <meshStandardMaterial color={COLORS.background} roughness={0.8} metalness={0.2} />
      </mesh>
      <gridHelper
        args={[
          Math.max(GRID_WIDTH, GRID_HEIGHT) * 1.5,
          Math.max(GRID_WIDTH, GRID_HEIGHT) * 1.5,
          COLORS.grid,
          COLORS.grid,
        ]}
        position={[0, 0, 0.1]}
        rotation={[Math.PI / 2, 0, 0]}
      />
    </group>
  );
}

function toWorldXZ(
  topLeft: { x: number; y: number },
  bottomRight: { x: number; y: number },
  mode: "grid" | "centered"
) {
  const cx = (topLeft.x + bottomRight.x + 1) / 2;
  const cy = (topLeft.y + bottomRight.y + 1) / 2;

  if (mode === "centered") {
    return {
      x: (GRID_WIDTH / 2 + cx) * CELL_SIZE,
      z: (GRID_HEIGHT / 2 + cy) * CELL_SIZE,
    };
  }
  return {
    x: cx * CELL_SIZE,
    z: cy * CELL_SIZE,
  };
}

function roomSymbol(room: Room) {
  const t = String(room.type || "").toUpperCase();
  if (t.includes("LOBBY")) return "🏛️";
  if (t.includes("GARDEN")) return "🌿";
  if (t.includes("SERVICE")) return "🛠️";
  if (t.includes("KITCHEN")) return "🍳";
  if (t.includes("DINING") || t.includes("RESTAURANT")) return "🍽️";
  if (t.includes("BAR")) return "🍸";
  if (t.includes("GYM")) return "🏋️";
  if (t.includes("POOL")) return "🏊";
  if (t.includes("SECURITY")) return "🛡️";
  // default guest room / unknown
  return "🛏️";
}

const RoomBlock: React.FC<{
  room: Room;
  isSelected: boolean;
  onClick: (r: Room) => void;
  coordMode: "grid" | "centered";
}> = ({
  room,
  isSelected,
  onClick,
  coordMode,
}) => {
  const widthCells = room.bottomRight.x - room.topLeft.x + 1;
  const depthCells = room.bottomRight.y - room.topLeft.y + 1;

  if (widthCells <= 0 || depthCells <= 0) return null;

  const width = widthCells * CELL_SIZE;
  const depth = depthCells * CELL_SIZE;
  const { x, z } = toWorldXZ(room.topLeft, room.bottomRight, coordMode);

  const isGarden = room.type === "GARDEN";
  const isLobby = room.type === "LOBBY";
  const isService = room.type === "SERVICE";

  const baseColor = isGarden ? COLORS.garden : isLobby ? COLORS.lobby : isService ? COLORS.service : COLORS.room;
  
  // ✅ Smaller + lower profile height (Updated)
  const heightBase = isLobby ? WALL_HEIGHT * 0.6 : isService ? WALL_HEIGHT * 0.4 : WALL_HEIGHT * 0.5;

  // Footprint shrink (makes blocks look “smaller” and leaves breathing room) (Updated to 0.6)
  const shrinkXY = 0.6; 
  const boxW = Math.max(0.1, width - shrinkXY);
  const boxD = Math.max(0.1, depth - shrinkXY);

  const [hovered, setHover] = useState(false);
  const active = hovered || isSelected;

  const symbol = useMemo(() => roomSymbol(room), [room.type]);

  return (
    <group position={[x, heightBase / 2, z]}>
      {/* Core Volume */}
      <mesh
        castShadow
        receiveShadow
        onClick={(e) => {
          e.stopPropagation();
          onClick(room);
        }}
        onPointerOver={() => setHover(true)}
        onPointerOut={() => setHover(false)}
      >
        <boxGeometry args={[boxW, heightBase, boxD]} />
        <meshStandardMaterial
          color={active ? "#ffffff" : baseColor}
          emissive={baseColor}
          emissiveIntensity={active ? 0.55 : 0.12}
          roughness={0.35}
          metalness={0.08}
          toneMapped={false}
        />
      </mesh>

      {/* Top Plate (adds “room symbol” feel without postprocessing) */}
      <mesh position={[0, heightBase / 2 + 0.03, 0]}>
        <boxGeometry args={[boxW * 0.98, 0.06, boxD * 0.98]} />
        <meshStandardMaterial
          color={"#0b1220"}
          emissive={baseColor}
          emissiveIntensity={active ? 0.22 : 0.10}
          roughness={0.6}
          metalness={0.0}
          toneMapped={false}
        />
      </mesh>

      {/* Symbol Badge (always visible; lightweight HTML overlay) */}
      <Html
        position={[0, heightBase / 2 + 0.22, 0]}
        center
        style={{
          pointerEvents: "none",
          transform: "translate3d(0,0,0)",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 8px",
            borderRadius: 999,
            background: active ? "rgba(0,0,0,0.75)" : "rgba(0,0,0,0.55)",
            border: `1px solid ${active ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.12)"}`,
            boxShadow: active ? "0 8px 20px rgba(0,0,0,0.35)" : "none",
            color: "white",
            fontSize: 12,
            lineHeight: 1,
            whiteSpace: "nowrap",
            backdropFilter: "blur(6px)",
          }}
        >
          <span style={{ filter: active ? "drop-shadow(0 0 8px rgba(255,255,255,0.15))" : "none" }}>{symbol}</span>
          <span style={{ fontSize: 10, opacity: active ? 0.95 : 0.75, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
            {String(room.type || "ROOM").toUpperCase()}
          </span>
        </div>
      </Html>

      {/* Name label only when active (keeps map clean) */}
      {active && (
        <Html position={[0, heightBase / 2 + 0.62, 0]} center style={{ pointerEvents: "none" }}>
          <div
            style={{
              fontSize: 9,
              padding: "2px 6px",
              borderRadius: 6,
              background: "rgba(0,0,0,0.82)",
              color: "white",
              whiteSpace: "nowrap",
              border: "1px solid rgba(255,255,255,0.18)",
              letterSpacing: 0.4,
            }}
          >
            {room.name}
          </div>
        </Html>
      )}
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
  const coordMode: "grid" | "centered" = "grid";
  const safeRooms = useMemo(() => (Array.isArray(rooms) ? rooms : []), [rooms]);

  return (
    <div className="absolute inset-0 bg-slate-950 z-0">
      <Canvas
        shadows
        dpr={1}
        frameloop="always"
        gl={{
          antialias: true, // Re-enable AA for cleaner lines on complex geometry
          alpha: false,
          powerPreference: "high-performance",
        }}
        camera={{
          // UPDATED: Move camera back and up to frame the entire 80x44 grid
          position: [GRID_WIDTH / 2, 85, GRID_HEIGHT / 2 + 65],
          fov: 40,
          near: 0.1,
          far: 2000,
        }}
        onCreated={({ gl }) => { gl.debug.checkShaderErrors = false; }}
      >
        <color attach="background" args={[COLORS.background]} />
        
        {/* Soft Shadows for nicer architectural feel */}
        <SoftShadows size={25} focus={0} samples={12} />

        <MapControls
          screenSpacePanning
          // UPDATED: Use minDistance/maxDistance for perspective camera zooming limits
          minDistance={30}
          maxDistance={250}
          maxPolarAngle={Math.PI / 2.2}
          // UPDATED: Target the exact center of the grid to center the view
          target={[GRID_WIDTH / 2, 0, GRID_HEIGHT / 2]}
          makeDefault
        />

        {/* Lighting Setup for Depth */}
        <ambientLight intensity={0.4} />
        <directionalLight 
          position={[50, 80, 50]} 
          intensity={1.5} 
          castShadow 
          shadow-mapSize={[1024, 1024]} 
          shadow-bias={-0.0001}
        />
        <pointLight position={[GRID_WIDTH/2, 20, GRID_HEIGHT/2]} intensity={0.5} color={COLORS.lobby} />

        <GridFloor />

        <group>
          {safeRooms.map((room) => (
            <RoomBlock
              key={room.id}
              room={room}
              isSelected={selectedRoomId === room.id}
              onClick={(r) => onRoomSelect(r)}
              coordMode={coordMode}
            />
          ))}
        </group>

        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[GRID_WIDTH / 2, -0.01, GRID_HEIGHT / 2]}
          onClick={(e) => { e.stopPropagation(); onRoomSelect(null); }}
        >
          <planeGeometry args={[1000, 1000]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      </Canvas>
    </div>
  );
};