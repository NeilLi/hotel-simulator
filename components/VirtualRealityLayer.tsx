import React, { useMemo, useRef, useState, useEffect, Suspense } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Environment,
  Float,
  RoundedBox,
  Sparkles,
  Grid,
  MeshReflectorMaterial,
  MeshTransmissionMaterial,
  MeshDistortMaterial,
} from "@react-three/drei";
import { EffectComposer, Bloom, Noise, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import type { Room, Agent } from "../types";
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

// --- CONFIGURATION ---
const WORLD_SCALE = 0.8;
const CENTER_X = GRID_WIDTH / 2;
const CENTER_Y = GRID_HEIGHT / 2;

type Quality = "safe" | "medium" | "high";

function clampQuality(q: Quality): Quality {
  return q === "high" ? "high" : q === "medium" ? "medium" : "safe";
}

// --- 1. CINEMATIC CAMERA ---
function CinematicCamera() {
  const { camera, pointer } = useThree();
  const vec = new THREE.Vector3();

  useFrame((state) => {
    const time = state.clock.getElapsedTime();

    const baseX = 0;
    const baseY = 3.5;
    const baseZ = 22;

    const mouseX = pointer.x * 2;
    const mouseY = pointer.y * 1;

    const driftX = Math.sin(time * 0.05) * 2;

    camera.position.lerp(vec.set(baseX + mouseX + driftX, baseY + mouseY, baseZ), 0.02);
    camera.lookAt(0, 2, 0);
  });

  return null;
}

// --- 2. VIBRANT GRADIENT BACKDROP ---
function GradientBackdrop({ isGolden }: { isGolden: boolean }) {
  const colors = useMemo(() => {
    return {
      top: new THREE.Color(isGolden ? "#d97706" : "#0891b2"),
      mid: new THREE.Color(isGolden ? "#78350f" : "#1e1b4b"),
      bot: new THREE.Color(isGolden ? "#2a1505" : "#020617"),
    };
  }, [isGolden]);

  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        uTop: { value: colors.top },
        uMid: { value: colors.mid },
        uBot: { value: colors.bot },
      },
      vertexShader: `
        varying vec3 vPos;
        void main() {
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vPos;
        uniform vec3 uTop;
        uniform vec3 uMid;
        uniform vec3 uBot;

        void main() {
          float h = normalize(vPos).y * 0.5 + 0.5;
          vec3 col = mix(uBot, uMid, smoothstep(0.0, 0.4, h));
          col = mix(col, uTop, smoothstep(0.4, 1.0, h));
          float horizon = 1.0 - abs(h - 0.45);
          col += uTop * pow(horizon, 20.0) * 0.2;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
  }, [colors]);

  return (
    <mesh position={[0, 0, -20]} scale={150}>
      <sphereGeometry args={[1, 32, 32]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

// --- 3. DYNAMIC DATA WALL ---
function DataStreamBackground({ themeColor }: { themeColor: string }) {
  const ref = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (ref.current) ref.current.position.y = Math.sin(state.clock.elapsedTime * 0.5) * 1.5;
  });

  return (
    <group position={[0, 0, -2]}>
      <Grid
        args={[60, 30]}
        cellSize={2}
        cellThickness={1.5}
        cellColor={themeColor}
        sectionSize={10}
        sectionThickness={3}
        sectionColor="#ffffff"
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        fadeDistance={25}
      />

      <group ref={ref}>
        {[-25, -15, -5, 5, 15, 25].map((x, i) => (
          <group key={i} position={[x, 0, 0.5]}>
            <mesh position={[0, 0, 0]}>
              <planeGeometry args={[0.5, 8]} />
              <meshBasicMaterial color={themeColor} transparent opacity={0.2} />
            </mesh>
            <mesh position={[2, -2, 0]}>
              <planeGeometry args={[0.2, 4]} />
              <meshBasicMaterial color={themeColor} transparent opacity={0.1} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

// --- 4. LOBBY ---
function LobbyEnvironment({
  themeColor,
  neonMat,
  neonWhiteMat,
  isGolden,
  quality,
}: {
  themeColor: string;
  neonMat: THREE.Material;
  neonWhiteMat: THREE.Material;
  isGolden: boolean;
  quality: Quality;
}) {
  // Transmission is one of the biggest context-loss triggers.
  // Only enable it on HIGH.
  const enableTransmission = quality === "high";

  return (
    <group>
      {/* RECEPTION */}
      <group position={[0, 0, -2]}>
        <RoundedBox args={[10, 1.1, 3]} radius={0.2} smoothness={8} position={[0, 0.55, 0]}>
          <meshStandardMaterial 
            color="#1a1a1a" // Lifted from #050505 to catch light
            roughness={0.2} 
            metalness={0.8} 
            envMapIntensity={1.0} 
          />
        </RoundedBox>

        <mesh position={[0, 0.5, 1.51]}>
          <boxGeometry args={[9.8, 0.05, 0.02]} />
          <primitive object={neonMat} attach="material" />
        </mesh>

        <Float speed={2} rotationIntensity={0.05} floatIntensity={0.1}>
          <group position={[0, 1.8, 0.5]}>
            <mesh>
              <planeGeometry args={[5, 1.5]} />
              <meshBasicMaterial color={themeColor} transparent opacity={0.1} side={THREE.DoubleSide} toneMapped={false} />
            </mesh>

            <mesh position={[0, 0.75, 0]}>
              <boxGeometry args={[5, 0.02, 0.01]} />
              <meshBasicMaterial color={themeColor} opacity={0.8} transparent toneMapped={false} />
            </mesh>
            <mesh position={[0, -0.75, 0]}>
              <boxGeometry args={[5, 0.02, 0.01]} />
              <meshBasicMaterial color={themeColor} opacity={0.8} transparent toneMapped={false} />
            </mesh>

            <group position={[-1.5, 0, 0.02]}>
              <mesh position={[0, 0.2, 0]}>
                <planeGeometry args={[1.5, 0.05]} />
                <meshBasicMaterial color={themeColor} opacity={0.6} transparent toneMapped={false} />
              </mesh>
              <mesh position={[0, 0, 0]}>
                <planeGeometry args={[1.0, 0.05]} />
                <meshBasicMaterial color={themeColor} opacity={0.4} transparent toneMapped={false} />
              </mesh>
              <mesh position={[0, -0.2, 0]}>
                <planeGeometry args={[1.2, 0.05]} />
                <meshBasicMaterial color={themeColor} opacity={0.5} transparent toneMapped={false} />
              </mesh>
            </group>
          </group>
        </Float>
      </group>

      {/* COLUMNS */}
      {[-14, 14].map((sideX) => (
        <group key={sideX}>
          {[-5, 10].map((zPos) => (
            <group key={zPos} position={[sideX, 6, zPos]}>
              <mesh castShadow receiveShadow>
                <cylinderGeometry args={[2, 2, 12, 32]} />
                <meshStandardMaterial
                  color={isGolden ? "#3b2a1f" : "#2b2f36"}   // normal dark gray / warm dark
                  roughness={0.6}
                  metalness={0.05}                           // <- almost non-metal (key)
                  emissive={isGolden ? "#3b2a1f" : "#0b1220"} // subtle lift
                  emissiveIntensity={0.18}                   // prevents “black crush”
                  envMapIntensity={0.6}
                />
              </mesh>

              <mesh position={[sideX > 0 ? -1.9 : 1.9, 0, 0]}>
                <boxGeometry args={[0.1, 12, 0.2]} />
                <primitive object={neonMat} attach="material" />
              </mesh>

              <mesh position={[0, 3, 0.001]}>
                <torusGeometry args={[2.05, 0.05, 16, 64]} />
                <primitive object={neonWhiteMat} attach="material" />
              </mesh>
            </group>
          ))}
        </group>
      ))}

      {/* CEILING */}
      <group position={[0, 11, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[60, 60]} />
          <meshStandardMaterial 
            color="#141414" // Lighter than #050505
            roughness={0.85} 
            metalness={0.1} 
          />
        </mesh>

        {[-6, -2, 2, 6].map((x) => (
          <mesh key={x} position={[x, -0.1, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.1, 40]} />
            <primitive object={neonMat} attach="material" />
          </mesh>
        ))}

        {[-10, 0, 10].map((z) => (
          <mesh key={z} position={[0, -0.2, z]}>
            <boxGeometry args={[40, 0.5, 0.5]} />
            <meshStandardMaterial color="#1a1a1a" envMapIntensity={0.2} />
          </mesh>
        ))}
      </group>

      {/* BACK WALL */}
      <group position={[0, 6, -15]}>
        <DataStreamBackground themeColor={themeColor} />

        <mesh receiveShadow>
          <boxGeometry args={[60, 20, 0.5]} />
          {enableTransmission ? (
            <MeshTransmissionMaterial
              backside
              samples={2}
              thickness={1.5}
              roughness={0.25}
              anisotropy={0.2}
              chromaticAberration={0.03}
              distortion={0.12}
              distortionScale={0.2}
              temporalDistortion={0.06}
              color={isGolden ? "#ffccaa" : "#cceeff"}
              resolution={256}
            />
          ) : (
            // SAFE/MEDIUM fallback: cheap transparent material
            <meshPhysicalMaterial
              color={isGolden ? "#ffccaa" : "#cceeff"}
              transparent
              opacity={0.14}
              roughness={0.7}
              metalness={0.0}
              transmission={0.0}
            />
          )}
        </mesh>

        <mesh position={[0, 0, 0.3]}>
          <ringGeometry args={[5, 5.1, 128]} />
          <primitive object={neonMat} attach="material" />
        </mesh>
        <mesh position={[0, 0, 0.32]}>
          <ringGeometry args={[7, 7.02, 128]} />
          <primitive object={neonMat} attach="material" />
        </mesh>
      </group>
    </group>
  );
}

// --- 5. AGENT (Enhanced) ---
const DroneAgent: React.FC<{ 
  agent: Agent; 
  themeColor: string; 
  onHover?: (id: string | null) => void;
}> = ({ 
  agent, 
  themeColor, 
  onHover 
}) => {
  if (!agent || !agent.position) return null;

  // Sandbox-safe role detection
  const role = String((agent as any)?.role ?? "").toUpperCase();
  const isRobot = role !== "GUEST";
  const isWaiter = role.includes("WAITER");
  const isInteracting = agent.state === 'SOCIALIZING';

  // Guest is now a blue "electronic cloud"
  const guestBlue = "#0ea5e9";
  const baseColor = isRobot ? themeColor : guestBlue;
  
  // Waiters have a warmer, more welcoming presence (soft amber/white) even in cold themes
  const waiterWarmth = "#ffebd4"; 
  const displayColor = isWaiter ? waiterWarmth : baseColor;
  
  const sizeScale = isWaiter ? 1.9 : 1; 

  // Map grid -> world
  const targetX = (agent.position.x - CENTER_X) * WORLD_SCALE;
  const targetZ = (agent.position.y - CENTER_Y) * WORLD_SCALE;

  if (!Number.isFinite(targetX) || !Number.isFinite(targetZ)) return null;
  if (Math.abs(targetX) > 20 || Math.abs(targetZ) > 20) return null;

  // Refs for precise animation
  const groupRef = useRef<THREE.Group>(null);
  const haloRef = useRef<THREE.Mesh>(null);
  const gyroRef = useRef<THREE.Group>(null);
  const trayRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);

  // Stable per-agent randomization
  const seed = useMemo(() => {
    const id = String((agent as any)?.id ?? "");
    let h = 2166136261;
    for (let i = 0; i < id.length; i++) h = (h ^ id.charCodeAt(i)) * 16777619;
    return (h >>> 0) / 4294967295; // 0..1
  }, [(agent as any)?.id]);

  useFrame((state, dt) => {
    const g = groupRef.current;
    if (!g) return;

    const t = state.clock.elapsedTime;
    const camera = state.camera;

    // --- MOVEMENT INTERPOLATION ---
    const lerp = 1 - Math.pow(0.001, dt);
    g.position.x = THREE.MathUtils.lerp(g.position.x, targetX, lerp);
    g.position.z = THREE.MathUtils.lerp(g.position.z, targetZ, lerp);

    // --- INTERACTION LOGIC ---
    if (isInteracting) {
        // If tasking/interacting, rotate to face camera smoothly
        const dx = camera.position.x - g.position.x;
        const dz = camera.position.z - g.position.z;
        const angleToCam = Math.atan2(dx, dz);
        g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, angleToCam, 0.1);
        
        // Stabilize tilt
        g.rotation.z = THREE.MathUtils.lerp(g.rotation.z, 0, 0.1);
        g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, 0, 0.1);
    } else {
        // Normal Heading logic
        const dx = targetX - g.position.x;
        const dz = targetZ - g.position.z;
        const desiredYaw = Math.atan2(dx, dz);
        g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, desiredYaw, 0.08);

        const tiltAmount = isWaiter ? 0.01 : (isRobot ? 0.06 : 0.03);
        const tiltX = Math.sin(t * 1.2 + seed * 7) * tiltAmount;
        const tiltZ = Math.sin(t * 1.4 + seed * 5) * tiltAmount;
        
        g.rotation.z = tiltZ;
        g.rotation.x = tiltX;
    }

    // --- BASE HOVER ---
    const hoverBase = isRobot ? 1.45 : 1.35;
    
    // "Accurate" means less bobbing, more gliding for Waiters
    // Stop bobbing if interacting to show attention
    const bobSpeed = isInteracting ? 0.2 : (isWaiter ? 0.6 : (isRobot ? 2.2 : 1.6));
    const bobAmp = isInteracting ? 0.01 : (isWaiter ? 0.03 : (isRobot ? 0.06 : 0.04));
    
    const bob = Math.sin(t * bobSpeed + seed * 10) * bobAmp;
    g.position.y = hoverBase + bob;

    // --- ROBOT SPECIFIC ANIMATIONS ---
    if (isRobot) {
        // Gyro for generic robots
        if (gyroRef.current && !isWaiter) {
            gyroRef.current.rotation.y += dt * 3.5; 
            gyroRef.current.rotation.x = Math.PI / 2 + Math.sin(t * 0.5 + seed) * 0.15;
        }

        // Waiter Specifics: Head & Tray
        if (isWaiter) {
            if (headRef.current) {
                // If interacting, look directly at camera, otherwise scan
                if (isInteracting) {
                    headRef.current.rotation.y = THREE.MathUtils.lerp(headRef.current.rotation.y, 0, 0.1);
                    // Polite nod
                    const nod = Math.sin(t * 2) * 0.05 + 0.1; 
                    headRef.current.rotation.x = THREE.MathUtils.lerp(headRef.current.rotation.x, nod, 0.1);
                } else {
                    const scan = Math.sin(t * 0.4 + seed * 20) * 0.25;
                    headRef.current.rotation.y = THREE.MathUtils.lerp(headRef.current.rotation.y, scan, 0.05);
                    headRef.current.rotation.x = THREE.MathUtils.lerp(headRef.current.rotation.x, 0, 0.1);
                }
            }

            if (trayRef.current) {
                // GYROSCOPIC STABILIZATION:
                // Counter-rotate the tray so it stays flat regardless of body tilt
                trayRef.current.rotation.x = -g.rotation.x;
                trayRef.current.rotation.z = -g.rotation.z;

                // Mag-lev float effect: independent micro-float
                trayRef.current.position.y = 0.25 + Math.sin(t * 3 + seed * 50) * 0.01;
            }
        }
    }

    // --- HALO PULSE (Intensify on Interaction) ---
    if (haloRef.current) {
      const pulseSpeed = isInteracting ? 8 : 3;
      const pulse = 0.55 + 0.25 * Math.sin(t * pulseSpeed + seed * 10);
      haloRef.current.scale.setScalar(1 + pulse * 0.12);
      
      const opacityBase = isRobot ? 0.35 : 0.18;
      (haloRef.current.material as THREE.MeshBasicMaterial).opacity = isInteracting ? 0.6 : opacityBase * pulse;
    }
  });

  // Materials (memoized)
  const coreMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#1c1917",
        roughness: 0.2,
        metalness: 0.6,
        envMapIntensity: 1.0,
      }),
    []
  );

  const shellMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: isRobot ? (isWaiter ? "#f5f5f4" : "#14151a") : "#f3f4f6", // Waiters are clean ceramic white
        roughness: isWaiter ? 0.15 : (isRobot ? 0.35 : 0.2), // Waiters are polished
        metalness: isWaiter ? 0.1 : (isRobot ? 0.65 : 0.1),  // Waiters are ceramic/plastic (approachable), not heavy metal
        envMapIntensity: 0.9,
      }),
    [isRobot, isWaiter]
  );

  const glowMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: displayColor,
        transparent: true,
        opacity: isRobot ? (isWaiter ? 0.6 : 0.25) : 0.14,
        toneMapped: false,
        depthWrite: false,
      }),
    [displayColor, isRobot, isWaiter]
  );

  const ringMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: displayColor,
        transparent: true,
        opacity: isRobot ? 0.55 : 0.35,
        side: THREE.DoubleSide,
        toneMapped: false,
        depthWrite: false,
      }),
    [displayColor, isRobot]
  );

  const gyroMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: displayColor,
        transparent: true,
        opacity: 0.6,
        toneMapped: false,
      }),
    [displayColor]
  );

  return (
    <group 
        ref={groupRef} 
        position={[targetX, 1.45, targetZ]}
        onPointerOver={(e) => {
            e.stopPropagation();
            if (onHover) onHover(agent.id);
            document.body.style.cursor = 'pointer';
        }}
        onPointerOut={(e) => {
            e.stopPropagation();
            if (onHover) onHover(null);
            document.body.style.cursor = 'auto';
        }}
    >
      <Float speed={isRobot ? 2 : 1.2} rotationIntensity={isRobot ? 0.12 : 0.5} floatIntensity={0.12} scale={sizeScale}>
        
        {/* === WAITER ROBOT (REFINED & WELCOMING) === */}
        {isWaiter ? (
             <group>
                {/* 1. TAPERED CERAMIC BODY (Delicate Shape) */}
                <mesh castShadow position={[0, 0, 0]}>
                   {/* Top radius larger than bottom for a sleek "V" or vest shape */}
                   <cylinderGeometry args={[0.16, 0.09, 0.75, 32]} /> 
                   <primitive object={shellMat} attach="material" />
                </mesh>

                {/* HEART LIGHT (Empathy Node) */}
                <mesh position={[0, 0.15, 0.14]}>
                    <sphereGeometry args={[0.03, 16, 16]} />
                    <primitive object={glowMat} attach="material" />
                </mesh>

                {/* 2. FRIENDLY HEAD */}
                <group ref={headRef} position={[0, 0.52, 0]}>
                    <mesh castShadow>
                        <sphereGeometry args={[0.12, 32, 32]} />
                        <primitive object={shellMat} attach="material" />
                    </mesh>
                    
                    {/* The Visor: Curved Lozenge (Welcome/Smile implication) */}
                    <mesh position={[0, 0.01, 0.105]}>
                        <RoundedBox args={[0.14, 0.04, 0.02]} radius={0.015} smoothness={4}>
                             <meshBasicMaterial color={waiterWarmth} toneMapped={false} opacity={0.9} transparent />
                        </RoundedBox>
                    </mesh>

                    {/* Neck Ring */}
                    <mesh position={[0, -0.14, 0]}>
                        <torusGeometry args={[0.06, 0.01, 8, 24]} />
                        <meshStandardMaterial color="#333" roughness={0.5} />
                    </mesh>
                </group>

                {/* 3. STABILIZED TRAY (Accuracy) */}
                <group ref={trayRef} position={[0, 0, 0.3]}>
                    {/* Magnetic Suspension Particles (Warm Gold) */}
                    <Sparkles count={8} scale={0.3} size={1.5} speed={0.2} opacity={0.6} color="#fbbf24" position={[0, -0.05, 0]} />
                    
                    {/* The Tray (Glass/Acrylic look for lightness) */}
                    <mesh castShadow receiveShadow>
                        <cylinderGeometry args={[0.32, 0.08, 0.02, 32]} />
                        <meshPhysicalMaterial 
                            color="#101010" 
                            metalness={0.9} 
                            roughness={0.1} 
                            clearcoat={1} 
                        />
                    </mesh>
                     {/* Rim Light */}
                    <mesh position={[0, 0.011, 0]} rotation={[Math.PI/2,0,0]}>
                        <ringGeometry args={[0.31, 0.32, 32]} />
                        <meshBasicMaterial color={waiterWarmth} opacity={0.4} transparent side={THREE.DoubleSide} />
                    </mesh>

                    {/* Holographic Payload (Subtle) */}
                    <mesh position={[0, 0.1, 0]}>
                       <coneGeometry args={[0.08, 0.2, 16, 1, true]} />
                       <meshBasicMaterial color={waiterWarmth} transparent opacity={0.08} side={THREE.DoubleSide} depthWrite={false} />
                    </mesh>
                </group>

                {/* 4. SHOULDERS/COLLAR (Structure) */}
                <mesh position={[0, 0.32, 0]}>
                    <cylinderGeometry args={[0.19, 0.17, 0.05, 16]} />
                    <primitive object={coreMat} attach="material" />
                </mesh>
             </group>
        ) : !isRobot ? (
            /* === GUEST: BLUE ELECTRONIC CLOUD === */
            <group>
                 {/* 1. Distorted Plasma Core */}
                 <mesh>
                    <sphereGeometry args={[0.22, 32, 32]} />
                    <MeshDistortMaterial 
                        color="#38bdf8"
                        emissive="#0284c7"
                        emissiveIntensity={1.8}
                        roughness={0.2}
                        metalness={0.5}
                        distort={0.55}
                        speed={3}
                        toneMapped={false}
                    />
                 </mesh>

                 {/* 2. Outer Digital Haze */}
                 <mesh scale={1.1}>
                    <sphereGeometry args={[0.24, 32, 32]} />
                    <meshBasicMaterial 
                        color="#7dd3fc"
                        transparent
                        opacity={0.15}
                        depthWrite={false}
                    />
                 </mesh>

                 {/* 3. Electronic Particles */}
                 <Sparkles 
                    count={20} 
                    scale={1.2} 
                    size={3} 
                    speed={1} 
                    opacity={0.7} 
                    color="#bae6fd"
                 />

                 {/* 4. Tiny orbiting bits for "data" feel */}
                 <group rotation={[Math.PI / 4, 0, 0]}>
                    <Sparkles count={8} scale={0.5} size={1} speed={2} color="#ffffff" />
                 </group>
            </group>
        ) : (
            /* === STANDARD ROBOT (Concierge etc) === */
            <group>
                <mesh castShadow>
                  <icosahedronGeometry args={[0.23, 1]} />
                  <primitive object={coreMat} attach="material" />
                </mesh>

                <mesh castShadow scale={1.25}>
                  <octahedronGeometry args={[0.22, 0]} />
                  <primitive object={shellMat} attach="material" />
                </mesh>

                <group ref={gyroRef}>
                    <mesh>
                        <torusGeometry args={[0.34, 0.006, 6, 32]} />
                        <primitive object={gyroMat} attach="material" />
                    </mesh>
                </group>
            </group>
        )}

        {/* --- COMMON ELEMENTS --- */}
        {/* Halo / Aura */}
        <mesh ref={haloRef} rotation={[Math.PI / 2, 0, 0]} position={[0, isWaiter ? -0.4 : 0, 0]}>
          <ringGeometry args={[isRobot ? 0.34 : 0.30, isRobot ? 0.42 : 0.36, 48]} />
          <primitive object={ringMat} attach="material" />
        </mesh>

        {/* Thruster Glow (Hidden/Subtle for Waiter) */}
        {!isWaiter && isRobot && (
          <mesh position={[0, -0.18, 0]}>
            <sphereGeometry args={[0.08, 16, 16]} />
            <primitive object={glowMat} attach="material" />
          </mesh>
        )}
        
        {/* Waiter Base Glow (Softer) */}
        {isWaiter && (
             <mesh position={[0, -0.45, 0]}>
                <cylinderGeometry args={[0.05, 0.02, 0.2]} />
                <meshBasicMaterial color={waiterWarmth} transparent opacity={0.3} />
            </mesh>
        )}

        {/* Ambient Light Source */}
        <pointLight color={displayColor} intensity={isRobot ? 0.45 : 0.25} distance={2.4} decay={2} />
      </Float>

      {/* --- Ground Shadow --- */}
      <group scale={[sizeScale, 1, sizeScale]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.38, 0]}>
            <ringGeometry args={[0.22, 0.34, 32]} />
            <meshBasicMaterial color={displayColor} transparent opacity={isRobot ? 0.18 : 0.12} toneMapped={false} depthWrite={false} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.39, 0]}>
            <circleGeometry args={[0.22, 24]} />
            <meshBasicMaterial color="#000000" transparent opacity={0.18} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
};

// --- 6. SEEDCORE ---
function SeedCoreMonolith({ color }: { color: string }) {
  return (
    <group position={[0, 5, -2]}>
      <Float speed={3} rotationIntensity={0.5} floatIntensity={0.2}>
        <mesh>
          <octahedronGeometry args={[0.6, 0]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={4} toneMapped={false} />
        </mesh>
        <Sparkles count={40} scale={2} size={4} speed={0.4} opacity={0.5} color={color} />
      </Float>
      <mesh position={[0, -2, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 4]} />
        <meshBasicMaterial color={color} transparent opacity={0.2} />
      </mesh>
    </group>
  );
}

/**
 * QualitySentinel:
 * - Watches FPS (roughly)
 * - Allows staged upgrades only if stable
 */
function useFpsEstimate(enabled: boolean) {
  const [fps, setFps] = useState<number>(60);
  const frames = useRef(0);
  const last = useRef(performance.now());

  useEffect(() => {
    if (!enabled) return;
    let raf = 0;

    const tick = () => {
      frames.current += 1;
      const now = performance.now();
      const dt = now - last.current;

      // Update about 2x per second
      if (dt >= 500) {
        const currentFps = (frames.current * 1000) / dt;
        setFps(currentFps);
        frames.current = 0;
        last.current = now;
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled]);

  return fps;
}

// --- MAIN COMPONENT ---
export function VirtualRealityLayer({
  atmosphere,
  enabled,
  rooms,
  agents,
  backgroundImage,
  onAgentHover
}: {
  atmosphere: string;
  enabled: boolean;
  rooms: Room[];
  agents: Agent[];
  backgroundImage?: string;
  onAgentHover?: (id: string | null) => void;
}) {
  const isGolden = atmosphere === "GOLDEN_HOUR";
  const themeColor = isGolden ? "#fbbf24" : "#06b6d4";

  const safeAgents = useMemo(() => (Array.isArray(agents) ? agents : []), [agents]);

  // QUALITY STATE
  const [quality, setQuality] = useState<Quality>("safe");
  const [lockedSafe, setLockedSafe] = useState(false);

  // Simple FPS estimate to decide upgrades (sandboxes often dip)
  const fps = useFpsEstimate(enabled && !lockedSafe);

  // Materials
  const neonMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: themeColor,
        emissive: themeColor,
        emissiveIntensity: 3,
        toneMapped: false,
      }),
    [themeColor]
  );

  const neonWhiteMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#ffffff",
        emissive: "#ffffff",
        emissiveIntensity: 2,
        toneMapped: false,
      }),
    []
  );

  // Stage upgrades gradually
  useEffect(() => {
    if (!enabled) return;
    if (lockedSafe) {
      setQuality("safe");
      return;
    }

    // Always start safe when enabled
    setQuality("safe");

    const t1 = window.setTimeout(() => {
      // Only upgrade if FPS seems okay
      if (lockedSafe) return;
      if (fps >= 40) setQuality("medium");
    }, 1200);

    const t2 = window.setTimeout(() => {
      // Upgrade to high only if strong
      if (lockedSafe) return;
      if (fps >= 52) setQuality("high");
    }, 2600);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [enabled, lockedSafe, fps]);

  // Quality-derived settings
  const dpr = 1; // Force 1.0 DPR for stability in sandbox
  const enablePost = !lockedSafe && quality === "high"; // STRICT: Only high quality gets post-processing to avoid crashes
  const enableBloom = enablePost; // Bloom follows post logic

  // Reflector tuning
  const reflectorResolution = quality === "high" ? 512 : 256;
  const reflectorBlur: [number, number] = quality === "high" ? [180, 60] : [120, 40];
  const reflectorStrength = quality === "high" ? 22 : 15;

  // Shadows tuning
  const shadowMapSize = quality === "high" ? 1024 : 512;
  const keyLightIntensity = quality === "high" ? 90 : quality === "medium" ? 70 : 55;

  if (!enabled) return null;

  return (
    <div className="absolute inset-0 z-10 transition-opacity duration-1000 animate-in fade-in" style={{ opacity: 1 }}>
      <Canvas
        shadows
        dpr={dpr}
        camera={{ fov: 50, position: [0, 4, 20], near: 0.1, far: 200 }}
        gl={{ antialias: true, alpha: false, depth: true, stencil: false, powerPreference: "high-performance" }}
        onCreated={({ gl }) => {
          // Base renderer config
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.6;

          gl.shadowMap.enabled = true;
          gl.shadowMap.type = THREE.PCFSoftShadowMap;

          const canvas = gl.domElement;
          const onLost = (e: Event) => {
            e.preventDefault();
            setLockedSafe(true);
            setQuality("safe");
          };

          canvas.addEventListener("webglcontextlost", onLost, false);
          const origDispose = gl.dispose.bind(gl);
          gl.dispose = () => {
            canvas.removeEventListener("webglcontextlost", onLost, false);
            origDispose();
          };
        }}
      >
        <CinematicCamera />
        <GradientBackdrop isGolden={isGolden} />
        <fogExp2 attach="fog" args={[isGolden ? "#451a03" : "#0f172a", 0.012]} />

        <Suspense fallback={null}>
          {/* Changed 'night' to 'city' to provide brighter reflections for dark materials */}
          <Environment preset={isGolden ? "sunset" : "city"} blur={0.6} background={false} />
        </Suspense>
        
        <ambientLight intensity={0.6} />

        {/* Increased intensity from 0.3 to 0.8 to cure 'black void' effect */}
        <hemisphereLight args={[isGolden ? "#fcd34d" : "#22d3ee", "#1e1b4b", 0.8]} />

        {/* Soft fill light for the ceiling/upper columns */}
        <pointLight position={[0, 10, 0]} intensity={2.2} distance={80} decay={1} color="#ffffff" />

        <spotLight
          position={[20, 30, 20]}
          angle={0.42}
          penumbra={0.35}
          intensity={keyLightIntensity}
          distance={160}
          decay={2}
          color={isGolden ? "#fff7ed" : "#e0f2fe"}
          castShadow
          shadow-mapSize={[shadowMapSize, shadowMapSize]}
          shadow-bias={-0.00002}
          shadow-normalBias={0.02}
        />

        <spotLight position={[-15, 10, -5]} intensity={quality === "safe" ? 25 : 40} distance={100} decay={2} color={themeColor} />

        <group>
          {/* FLOOR */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[100, 100]} />
            {(quality === "safe" || lockedSafe) ? (
              <meshStandardMaterial color="#0a0a0a" roughness={0.3} metalness={0.15} />
            ) : (
              <MeshReflectorMaterial
                resolution={reflectorResolution}
                blur={reflectorBlur}
                mixBlur={1}
                mixStrength={reflectorStrength}
                roughness={quality === "medium" ? 0.1 : 0.08}
                metalness={quality === "medium" ? 0.75 : 0.9}
                color="#0a0a0a"
                depthScale={quality === "medium" ? 0.8 : 1}
                minDepthThreshold={0.35}
                maxDepthThreshold={1.6}
                mirror={0.1}
              />
            )}
          </mesh>

          <Grid
            args={[60, 60]}
            cellSize={2}
            cellThickness={1}
            cellColor={themeColor}
            sectionSize={10}
            sectionThickness={1.5}
            sectionColor={themeColor}
            fadeDistance={30}
            followCamera={false}
            infiniteGrid
            position={[0, 0.01, 0]}
          />

          <LobbyEnvironment themeColor={themeColor} neonMat={neonMat} neonWhiteMat={neonWhiteMat} isGolden={isGolden} quality={quality} />

          <SeedCoreMonolith color={themeColor} />

          {safeAgents.map((agent) => (
            <DroneAgent 
                key={agent.id} 
                agent={agent} 
                themeColor={themeColor} 
                onHover={onAgentHover}
            />
          ))}

          <Sparkles count={quality === "safe" ? 120 : 200} scale={30} size={2} speed={0.2} opacity={0.3} color="#fff" position={[0, 5, 0]} />
        </group>

        {/* POST PROCESSING */}
        <Suspense fallback={null}>
          {enablePost && (
            <EffectComposer enableNormalPass={false} multisampling={0}>
              {enableBloom && (
                <Bloom
                  luminanceThreshold={quality === "high" ? 1.3 : 1.6}
                  intensity={quality === "high" ? 0.9 : 0.65}
                  radius={quality === "high" ? 0.35 : 0.25}
                  mipmapBlur={quality === "high"}
                  levels={quality === "high" ? 6 : 4}
                />
              )}
              <Noise opacity={quality === "high" ? 0.05 : 0.035} />
              <Vignette eskil={false} offset={0.1} darkness={quality === "high" ? 1.05 : 0.95} />
            </EffectComposer>
          )}
        </Suspense>
      </Canvas>

      <div
        className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/40 px-2 py-1 text-xs text-white"
        style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}
      >
        quality: {lockedSafe ? "safe (locked)" : quality} | fps≈{Math.round(fps)}
      </div>
    </div>
  );
}