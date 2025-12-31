import React, { useRef, useMemo, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { 
  MeshReflectorMaterial, 
  Text,
  PerspectiveCamera,
  Environment,
  Float,
  Billboard,
  Html
} from '@react-three/drei';
import * as THREE from 'three';
import { Room, Agent, AgentRole } from '../types';

// Fix: Consolidated explicit type declarations for React Three Fiber intrinsic elements
// Removed conflicting 'declare module react' block
declare global {
  namespace JSX {
    interface IntrinsicElements {
      group: any;
      mesh: any;
      planeGeometry: any;
      meshStandardMaterial: any;
      sphereGeometry: any;
      icosahedronGeometry: any;
      fog: any;
      ambientLight: any;
      pointLight: any;
      cylinderGeometry: any;
      ringGeometry: any;
      hemisphereLight: any;
      meshBasicMaterial: any; // Added missing type
    }
  }
}

// RESTORED SCALE: 1.0 feels more natural with this close-up camera
const GRID_SCALE = 1.0; 
// Center the coordinate system on the Lobby Atrium (approx X=40, Y=34 in grid coords)
const OFFSET_X = 40; 
const OFFSET_Y = 34;

// --- Sub-Component: Tactical Room Zone ---
function RoomZone({ room, themeColor }: { room: Room, themeColor: string }) {
  if (!room || !room.topLeft || !room.bottomRight) return null;

  const width = room.bottomRight.x - room.topLeft.x + 1;
  const height = room.bottomRight.y - room.topLeft.y + 1;

  // Calculate center relative to our new origin
  const roomCenterX = room.topLeft.x + width / 2;
  const roomCenterY = room.topLeft.y + height / 2;

  const x = (roomCenterX - OFFSET_X) * GRID_SCALE;
  const z = (roomCenterY - OFFSET_Y) * GRID_SCALE;

  return (
    <group position={[x, 0, z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <planeGeometry args={[width * GRID_SCALE, height * GRID_SCALE]} />
        <meshStandardMaterial 
            color={themeColor} 
            transparent 
            opacity={0.1} 
            emissive={themeColor} 
            emissiveIntensity={1} 
            toneMapped={false} 
        />
      </mesh>
    </group>
  );
}

// --- Sub-Component: Animated Robot Marker ---
function RobotMarker({ agent, themeColor, onAgentClick }: { agent: Agent, themeColor: string, onAgentClick?: (agentId: string) => void }) {
  const groupRef = useRef<THREE.Group>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  
  // Random offset for animation so they don't all bob in perfect sync
  const animOffset = useMemo(() => Math.random() * 100, []);
  
  const isRobot = agent.role !== AgentRole.GUEST;
  // Robots get Cyan, Guests get Amber
  const baseColor = isRobot ? "#22d3ee" : "#fbbf24";
  // Special color for conversing state
  const conversingColor = "#a78bfa"; // Purple for conversation
  const color = agent.state === 'CONVERSING' ? conversingColor : (hovered ? "#ffffff" : baseColor);
  const label = isRobot ? agent.role.replace('ROBOT_', '') : 'GUEST';

  useFrame((state) => {
    // FIX: Removed 'ringRef.current' from the safety check. 
    // Guests do not have a ringRef, so the previous code forced an early return, freezing them.
    if (!groupRef.current || !coreRef.current) return;
    
    const t = state.clock.elapsedTime + animOffset;

    // Hover Animation (Sine wave) - RESTORED: Lower hover height (0.5 base)
    groupRef.current.position.y = 0.5 + Math.sin(t * 2) * 0.08;
    
    // Core Rotation
    coreRef.current.rotation.x = t * 0.5;
    coreRef.current.rotation.y = t * 0.8;

    // Ring Rotation (Opposite direction) - Only if ring exists (Robots)
    if (ringRef.current) {
        ringRef.current.rotation.z = -t * 1.5;
    }

    // Pulse Scale
    const scale = hovered ? 1.4 : (1 + Math.sin(t * 4) * 0.05);
    coreRef.current.scale.setScalar(scale);
  });

  const x = (agent.position?.x - OFFSET_X) * GRID_SCALE;
  const z = (agent.position?.y - OFFSET_Y) * GRID_SCALE;

  return (
    <group position={[x, 0, z]}>
      {/* Invisible Hit Box for easy mouse interaction */}
      <mesh 
        visible={false} 
        position={[0, 1, 0]} 
        onPointerOver={(e) => { 
          e.stopPropagation(); 
          setHovered(true);
          if (e.intersections && e.intersections.length > 0) {
            document.body.style.cursor = 'pointer';
          }
        }} 
        onPointerOut={(e) => {
          e.stopPropagation();
          setHovered(false);
          document.body.style.cursor = 'default';
        }}
        onPointerMove={(e) => {
          e.stopPropagation();
        }}
        onClick={(e) => {
          e.stopPropagation();
          console.log(`[Agent ${agent.id}] Clicked - Role: ${agent.role}, State: ${agent.state}, Mood: ${agent.mood}`);
          if (onAgentClick) {
            onAgentClick(agent.id);
          }
        }}
      >
         <sphereGeometry args={[1.5, 16, 16]} />
      </mesh>

      {/* Floating Animation Group */}
      <group ref={groupRef}>
        
        {/* The Core Body - RESTORED: Bright, visible materials */}
        <mesh ref={coreRef}>
          {isRobot ? (
            <icosahedronGeometry args={[0.4, 0]} /> 
          ) : (
            // REDUCED GUEST SIZE: 0.35 -> 0.25
            <sphereGeometry args={[0.25, 16, 16]} />
          )}
          {/* Using basic material or standard with high emissive ensures color pop */}
          <meshStandardMaterial 
            color={color}
            emissive={agent.state === 'CONVERSING' ? conversingColor : baseColor} 
            emissiveIntensity={agent.state === 'CONVERSING' ? 6 : 4} 
            toneMapped={false}
            roughness={0.2}
            metalness={0.8}
          />
        </mesh>
        
        {/* Outer Tech Shell (Robots Only) */}
        {isRobot && (
           <mesh scale={[1.4, 1.4, 1.4]}>
              <icosahedronGeometry args={[0.4, 0]} />
              <meshBasicMaterial color={baseColor} wireframe transparent opacity={0.3} />
           </mesh>
        )}
        
        {/* Rotating Data Ring (Robots only) */}
        {isRobot && (
          <group rotation={[Math.PI / 2, 0, 0]}>
             <mesh ref={ringRef}>
               <ringGeometry args={[0.5, 0.6, 6]} />
               <meshStandardMaterial color={baseColor} emissive={baseColor} emissiveIntensity={3} toneMapped={false} side={THREE.DoubleSide} transparent opacity={0.6} />
             </mesh>
          </group>
        )}

        {/* Local Light Source */}
        <pointLight color={agent.state === 'CONVERSING' ? conversingColor : baseColor} intensity={agent.state === 'CONVERSING' ? 3 : 2} distance={3} decay={2} />

        {/* HTML Hotspot Label */}
        <Html position={[0, 0.8, 0]} center distanceFactor={10} style={{ pointerEvents: 'none' }}>
           <div className={`
             flex items-center gap-3 px-3 py-2 rounded-lg backdrop-blur-md border transition-all duration-300 origin-bottom
             ${hovered ? 'bg-slate-900/90 border-cyan-500/50 scale-110 shadow-[0_0_30px_rgba(34,211,238,0.4)]' : 'bg-slate-900/30 border-white/10 opacity-70'}
           `}>
             <div className={`w-2 h-2 rounded-sm ${isRobot ? 'bg-cyan-400' : 'bg-amber-400'} ${hovered ? 'animate-spin' : ''}`} />
             <div className="flex flex-col text-left">
                <span className={`text-[10px] font-bold uppercase tracking-widest whitespace-nowrap ${isRobot ? 'text-cyan-100' : 'text-amber-100'}`}>
                  {label}
                </span>
                {hovered && (
                  <div className="flex flex-col mt-1 space-y-0.5 border-t border-white/10 pt-1">
                    <span className={`text-[8px] font-mono uppercase ${
                      agent.state === 'CONVERSING' ? 'text-cyan-400 font-bold' : 'text-white/60'
                    }`}>
                      STATUS: {agent.state}
                      {agent.state === 'CONVERSING' && ' 💬'}
                      {agent.isGeneratingDialogue && ' ⏳'}
                    </span>
                    <span className="text-[8px] font-mono text-white/60 uppercase">MOOD: {agent.mood}</span>
                    {agent.isGeneratingDialogue && (
                      <span className="text-[7px] font-mono text-cyan-400/70 italic mt-1 animate-pulse">
                        Generating dialogue...
                      </span>
                    )}
                    {agent.dialogue && !agent.isGeneratingDialogue && (
                      <span className="text-[7px] font-mono text-white/50 italic mt-1 pt-1 border-t border-white/5">
                        "{agent.dialogue.substring(0, 40)}{agent.dialogue.length > 40 ? '...' : ''}"
                      </span>
                    )}
                  </div>
                )}
             </div>
           </div>
        </Html>
      </group>

      {/* Ground Connection Beam */}
      <mesh position={[0, 0.25, 0]}>
         <cylinderGeometry args={[0.01, 0.01, 0.5, 4]} />
         <meshStandardMaterial color={baseColor} transparent opacity={0.3} emissive={baseColor} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      
      {/* Floor Ripple Effect */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
         <ringGeometry args={[0.2, 0.3, 16]} />
         <meshStandardMaterial 
            color={baseColor} 
            transparent 
            opacity={0.4} 
            emissive={baseColor} 
            emissiveIntensity={2} 
            toneMapped={false}
         />
      </mesh>
    </group>
  );
}

export function VirtualRealityLayer({ 
  atmosphere, 
  enabled, 
  rooms, 
  agents,
  backgroundImage,
  onAgentClick
}: { 
  atmosphere: string, enabled: boolean, rooms: Room[], agents: Agent[], backgroundImage?: string, onAgentClick?: (agentId: string) => void
}) {
  const isGolden = atmosphere === 'GOLDEN_HOUR';
  const themeColor = isGolden ? "#fbbf24" : "#22d3ee";

  const particles = useMemo(() => [...Array(20)].map(() => ({
    pos: [(Math.random() - 0.5) * 30, Math.random() * 8, (Math.random() - 0.5) * 20] as [number, number, number],
  })), []);

  return (
    <div 
      className="absolute inset-0 z-10 transition-opacity duration-1000 pointer-events-auto" 
      style={{ 
        visibility: enabled ? 'visible' : 'hidden', 
        opacity: enabled ? 1 : 0 
      }}
    >
      {/* HTML Background Layer */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        {backgroundImage ? (
          <img 
            src={backgroundImage} 
            className="w-full h-full object-cover opacity-90 brightness-110 grayscale-[0.1]" 
            alt="Atmosphere"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <div className={`w-full h-full ${isGolden ? 'bg-orange-900/40' : 'bg-slate-900/50'}`} />
        )}
        {/* Soft Vignette to focus center */}
        <div className="absolute inset-0 shadow-[inset_0_0_120px_rgba(0,0,0,0.6)]" />
      </div>

      {/* WebGL Overlay */}
      <div className="absolute inset-0 pointer-events-auto">
        <Canvas
          gl={{ preserveDrawingBuffer: true, antialias: true, alpha: true }}
          dpr={[1, 2]}
          frameloop='always'
          onCreated={({ gl }) => gl.setClearColor(new THREE.Color('#000000'), 0)}
          style={{ width: '100%', height: '100%' }}
        >
        {/* 
          RESTORED CAMERA:
          Position: [0, 5, 16] - Low and close for desk-level immersion.
          LookAt: [0, 0.5, 0] - Pushes scene down slightly for better composition.
        */}
        <PerspectiveCamera 
          makeDefault 
          position={[0, 5, 16]} 
          fov={45} 
          onUpdate={(c) => c.lookAt(0, 0.5, 0)} 
        />
        
        {/* Lightweight Fog to blend distance */}
        <fog attach="fog" args={['#000000', 10, 40]} />

        <group>
          {/* Reflective Floor - subtle grid */}
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[120, 120]} />
            <MeshReflectorMaterial
              blur={[300, 100]}
              resolution={512}
              mixBlur={1}
              mixStrength={10}
              roughness={0.7}
              color="#050505"
              metalness={0.5}
              transparent={true}
              opacity={0.15}
            />
          </mesh>

          {rooms?.map((room) => <RoomZone key={room.id} room={room} themeColor={themeColor} />)}

          {/* Render Agents as Interactive Hotspots */}
          {agents?.map((agent) => (
             <RobotMarker key={agent.id} agent={agent} themeColor={themeColor} onAgentClick={onAgentClick} />
          ))}

          {/* Ambient Floating Dust */}
          {particles.map((p, i) => (
            <Float key={i} speed={1} floatIntensity={2} rotationIntensity={1}>
              <mesh position={p.pos}>
                <sphereGeometry args={[0.02, 4, 4]} />
                <meshStandardMaterial emissive={themeColor} emissiveIntensity={5} toneMapped={false} transparent opacity={0.3} />
              </mesh>
            </Float>
          ))}
        </group>

        <Environment preset="city" />
        <ambientLight intensity={1.5} />
        <pointLight position={[10, 10, 10]} intensity={1} />
        <pointLight position={[-10, 5, -10]} intensity={0.5} color={themeColor} />
      </Canvas>
      </div>
    </div>
  );
}