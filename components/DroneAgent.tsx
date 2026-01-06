import React, { useRef, useMemo, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Float, RoundedBox, Sparkles } from "@react-three/drei";
import * as THREE from "three";
import { Agent } from "../types";
import { GRID_WIDTH, GRID_HEIGHT } from "../constants";

const WORLD_SCALE = 0.5;
const CENTER_X = GRID_WIDTH / 2;
const CENTER_Y = GRID_HEIGHT / 2;

export const DroneAgent: React.FC<{
  agent: Agent;
  themeColor: string;
  onHover?: (id: string | null) => void;
  onDoubleClick?: (agent: Agent) => void;
}> = ({ agent, themeColor, onHover, onDoubleClick }) => {
  if (!agent || !agent.position) return null;

  const role = String((agent as any)?.role ?? "").toUpperCase();
  const isRobot = role !== "GUEST";
  const isWaiter = role.includes("WAITER");
  const isInteracting = agent.state === "SOCIALIZING";

  const guestBlue = "#0ea5e9";
  const baseColor = isRobot ? themeColor : guestBlue;

  // “Welcome” warm white + a hint of gold
  const waiterWarm = "#fff7ed";
  const waiterLed = "#60a5fa";
  const displayColor = isWaiter ? waiterWarm : baseColor;

  const sizeScale = isWaiter ? 2.25 : 1;

  const targetX = (agent.position.x - CENTER_X) * WORLD_SCALE;
  const targetZ = (agent.position.y - CENTER_Y) * WORLD_SCALE;

  const groupRef = useRef<THREE.Group>(null);
  const haloRef = useRef<THREE.Mesh>(null);

  // waiter-specific refs
  const waiterRootRef = useRef<THREE.Group>(null);
  const waiterHeadRef = useRef<THREE.Group>(null);
  const waiterEyesRef = useRef<THREE.Group>(null);
  const waiterArmLRef = useRef<THREE.Group>(null);
  const waiterArmRRef = useRef<THREE.Group>(null);
  const waiterTrayRef = useRef<THREE.Group>(null);

  // non-waiter robot refs
  const gyroRef = useRef<THREE.Group>(null);

  const [hovered, setHovered] = useState(false);

  const seed = useMemo(() => {
    const id = String((agent as any)?.id ?? "");
    let h = 2166136261;
    for (let i = 0; i < id.length; i++) h = (h ^ id.charCodeAt(i)) * 16777619;
    return (h >>> 0) / 4294967295;
  }, [(agent as any)?.id]);

  // ---------- Materials ----------
  // Premium ceramic shell (waiter)
  const ceramicMat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: "#f4f6fb",
        roughness: 0.22,
        metalness: 0.05,
        clearcoat: 1,
        clearcoatRoughness: 0.12,
        envMapIntensity: 1.4,
      }),
    []
  );

  // Brushed metal joints
  const jointMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#c7cbd6",
        roughness: 0.35,
        metalness: 0.8,
        envMapIntensity: 1.2,
      }),
    []
  );

  // Gold accent
  const goldMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#d4af37",
        metalness: 0.9,
        roughness: 0.18,
        envMapIntensity: 1.6,
      }),
    []
  );

  // Visor glass
  const visorGlassMat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: "#0b1220",
        roughness: 0.12,
        metalness: 0.0,
        transmission: 0.0, // keep stable in sandbox (no real refraction)
        transparent: true,
        opacity: 0.55,
        clearcoat: 1,
        clearcoatRoughness: 0.1,
        envMapIntensity: 1.8,
      }),
    []
  );

  const eyeGlowMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: waiterLed,
        transparent: true,
        opacity: 0.85,
        toneMapped: false,
        depthWrite: false,
      }),
    []
  );

  const smileGlowMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: displayColor,
        transparent: true,
        opacity: 0.28,
        toneMapped: false,
        depthWrite: false,
      }),
    [displayColor]
  );

  // Generic mats (non-waiter robot / guest)
  const coreMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#0b0d14",
        roughness: 0.12,
        metalness: 0.85,
        envMapIntensity: 1.2,
      }),
    []
  );

  const shellMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: isRobot ? "#14151a" : "#f3f4f6",
        roughness: isRobot ? 0.4 : 0.55,
        metalness: isRobot ? 0.6 : 0.15,
        envMapIntensity: 1.2,
      }),
    [isRobot]
  );

  const ringMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: displayColor,
        transparent: true,
        opacity: isRobot ? 0.5 : 0.3,
        side: THREE.DoubleSide,
        toneMapped: false,
        depthWrite: false,
      }),
    [displayColor, isRobot]
  );

  // ---------- Animation ----------
  useFrame((state, dt) => {
    const g = groupRef.current;
    if (!g) return;

    const t = state.clock.elapsedTime;
    const camera = state.camera;

    const lerp = 1 - Math.pow(0.001, dt);
    g.position.x = THREE.MathUtils.lerp(g.position.x, targetX, lerp);
    g.position.z = THREE.MathUtils.lerp(g.position.z, targetZ, lerp);

    // Facing behavior
    if (isInteracting) {
      const dx = camera.position.x - g.position.x;
      const dz = camera.position.z - g.position.z;
      const angleToCam = Math.atan2(dx, dz);
      g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, angleToCam, 0.1);
      g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, 0, 0.12);
      g.rotation.z = THREE.MathUtils.lerp(g.rotation.z, 0, 0.12);
    } else {
      const dx = targetX - g.position.x;
      const dz = targetZ - g.position.z;
      const desiredYaw = Math.atan2(dx, dz);
      g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, desiredYaw, 0.08);
      const tiltAmount = isWaiter ? 0.004 : isRobot ? 0.06 : 0.03;
      g.rotation.x = Math.sin(t * 1.2 + seed * 7) * tiltAmount;
      g.rotation.z = Math.sin(t * 1.4 + seed * 5) * tiltAmount;
    }

    // Hover height (waiter less floaty = more “real”)
    const hoverBase = isWaiter ? 1.38 : isRobot ? 1.45 : 1.35;
    const bobSpeed = isInteracting ? 0.18 : isWaiter ? 0.35 : isRobot ? 2.2 : 1.6;
    const bobAmp = isInteracting ? 0.008 : isWaiter ? 0.015 : isRobot ? 0.06 : 0.04;
    g.position.y = hoverBase + Math.sin(t * bobSpeed + seed * 10) * bobAmp;

    // Waiter micro-gestures
    if (isWaiter) {
      const root = waiterRootRef.current;
      const head = waiterHeadRef.current;
      const eyes = waiterEyesRef.current;
      const armL = waiterArmLRef.current; // tray arm
      const armR = waiterArmRRef.current; // wave arm
      const tray = waiterTrayRef.current;

      // Friendly bow when interacting
      if (root) {
        const bow = isInteracting ? 0.08 + Math.sin(t * 2.0) * 0.01 : 0.0;
        root.rotation.x = THREE.MathUtils.lerp(root.rotation.x, bow, 0.08);
      }

      // Head scanning / nodding
      if (head) {
        if (isInteracting) {
          const nod = 0.06 + Math.sin(t * 2.2) * 0.02;
          head.rotation.x = THREE.MathUtils.lerp(head.rotation.x, nod, 0.10);
          head.rotation.y = THREE.MathUtils.lerp(head.rotation.y, 0, 0.10);
        } else {
          const scan = Math.sin(t * 0.35 + seed * 20) * 0.18;
          head.rotation.y = THREE.MathUtils.lerp(head.rotation.y, scan, 0.05);
          head.rotation.x = THREE.MathUtils.lerp(head.rotation.x, 0.02, 0.08);
        }
      }

      // Keep tray level
      if (tray) {
        tray.rotation.x = -g.rotation.x * 0.8;
        tray.rotation.z = -g.rotation.z * 0.8;
        tray.position.y = THREE.MathUtils.lerp(tray.position.y, 0.18 + Math.sin(t * 1.8 + seed * 50) * 0.008, 0.08);
      }

      // Left arm holds tray steadily
      if (armL) {
        armL.rotation.x = THREE.MathUtils.lerp(armL.rotation.x, -0.25, 0.08);
        armL.rotation.z = THREE.MathUtils.lerp(armL.rotation.z, 0.12, 0.08);
      }

      // Right arm waves on hover or when interacting
      if (armR) {
        const shouldWave = hovered || isInteracting;
        const wave = shouldWave ? Math.sin(t * 3.0) * 0.55 : 0.0;
        armR.rotation.z = THREE.MathUtils.lerp(armR.rotation.z, -0.35 + wave * 0.25, 0.08);
        armR.rotation.x = THREE.MathUtils.lerp(armR.rotation.x, 0.25 + wave * 0.15, 0.08);
      }

      // Eyes brighten when hover / interacting
      if (eyes) {
        const s = hovered || isInteracting ? 1.15 : 1.0;
        eyes.scale.setScalar(THREE.MathUtils.lerp(eyes.scale.x, s, 0.10));
      }
    } else if (isRobot) {
      if (gyroRef.current) {
        gyroRef.current.rotation.y += dt * 3.5;
        gyroRef.current.rotation.x = Math.PI / 2 + Math.sin(t * 0.5 + seed) * 0.15;
      }
    }

    // Halo (cleaner, smaller)
    if (haloRef.current) {
      const pulse = 0.55 + 0.18 * Math.sin(t * (isInteracting ? 6 : 2.5) + seed * 10);
      haloRef.current.scale.setScalar(1 + pulse * 0.08);
      (haloRef.current.material as THREE.MeshBasicMaterial).opacity = isWaiter
        ? (hovered || isInteracting ? 0.28 : 0.16) * pulse
        : (isRobot ? 0.26 : 0.15) * pulse;
    }
  });

  // ---------- Render ----------
  return (
    <group
      ref={groupRef}
      position={[targetX, 1.45, targetZ]}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        onHover?.(agent.id);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        setHovered(false);
        onHover?.(null);
        document.body.style.cursor = "auto";
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick?.(agent);
      }}
    >
      {/* Waiter: less float / more grounded */}
      <Float speed={isWaiter ? 0.6 : isRobot ? 2 : 1.2} rotationIntensity={isWaiter ? 0.06 : isRobot ? 0.12 : 0.5} floatIntensity={isWaiter ? 0.06 : 0.12} scale={sizeScale}>
        {isWaiter ? (
          <group ref={waiterRootRef}>
            {/* --- BODY (torso + skirt base) --- */}
            <group position={[0, -0.10, 0]}>
              <mesh castShadow receiveShadow>
                <capsuleGeometry args={[0.12, 0.28, 8, 16]} />
                <primitive object={ceramicMat} attach="material" />
              </mesh>

              {/* collar */}
              <mesh position={[0, 0.14, 0]}>
                <torusGeometry args={[0.11, 0.02, 10, 40]} />
                <primitive object={goldMat} attach="material" />
              </mesh>

              {/* chest badge light */}
              <mesh position={[0, 0.06, 0.12]}>
                <RoundedBox args={[0.14, 0.10, 0.03]} radius={0.02} smoothness={4}>
                  <meshBasicMaterial color={waiterLed} transparent opacity={0.35} toneMapped={false} depthWrite={false} />
                </RoundedBox>
              </mesh>
            </group>

            {/* --- ARMS --- */}
            {/* Left arm holds tray */}
            <group ref={waiterArmLRef} position={[-0.16, 0.08, 0.04]}>
              <mesh castShadow>
                <cylinderGeometry args={[0.03, 0.03, 0.22, 12]} />
                <primitive object={jointMat} attach="material" />
              </mesh>
              <mesh position={[0, -0.13, 0.10]} castShadow>
                <sphereGeometry args={[0.045, 16, 16]} />
                <primitive object={goldMat} attach="material" />
              </mesh>
            </group>

            {/* Right arm waves */}
            <group ref={waiterArmRRef} position={[0.16, 0.08, 0.04]}>
              <mesh castShadow>
                <cylinderGeometry args={[0.03, 0.03, 0.22, 12]} />
                <primitive object={jointMat} attach="material" />
              </mesh>
              <mesh position={[0, -0.13, 0.10]} castShadow>
                <sphereGeometry args={[0.045, 16, 16]} />
                <primitive object={goldMat} attach="material" />
              </mesh>
            </group>

            {/* --- HEAD --- */}
            <group ref={waiterHeadRef} position={[0, 0.30, 0]}>
              <mesh castShadow>
                <sphereGeometry args={[0.14, 28, 28]} />
                <primitive object={ceramicMat} attach="material" />
              </mesh>

              {/* visor */}
              <mesh position={[0, 0.01, 0.085]}>
                <RoundedBox args={[0.20, 0.12, 0.06]} radius={0.04} smoothness={8}>
                  <primitive object={visorGlassMat} attach="material" />
                </RoundedBox>
              </mesh>

              {/* eyes + smile */}
              <group ref={waiterEyesRef} position={[0, 0.01, 0.12]}>
                <mesh position={[-0.045, 0.015, 0]}>
                  <sphereGeometry args={[0.012, 14, 14]} />
                  <primitive object={eyeGlowMat} attach="material" />
                </mesh>
                <mesh position={[0.045, 0.015, 0]}>
                  <sphereGeometry args={[0.012, 14, 14]} />
                  <primitive object={eyeGlowMat} attach="material" />
                </mesh>

                {/* subtle “smile” arc */}
                <mesh position={[0, -0.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
                  <ringGeometry args={[0.028, 0.032, 40, 1, Math.PI * 1.1, Math.PI * 0.8]} />
                  <primitive object={smileGlowMat} attach="material" />
                </mesh>
              </group>

              {/* ear caps */}
              <mesh position={[-0.13, 0.00, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.05, 0.05, 0.05, 14]} />
                <primitive object={goldMat} attach="material" />
              </mesh>
              <mesh position={[0.13, 0.00, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.05, 0.05, 0.05, 14]} />
                <primitive object={goldMat} attach="material" />
              </mesh>
            </group>

            {/* --- TRAY --- */}
            <group ref={waiterTrayRef} position={[-0.10, 0.18, 0.22]}>
              <mesh castShadow receiveShadow>
                <cylinderGeometry args={[0.22, 0.19, 0.018, 28]} />
                <meshPhysicalMaterial color="#0b0d14" metalness={0.85} roughness={0.18} clearcoat={1} clearcoatRoughness={0.12} envMapIntensity={1.2} />
              </mesh>

              {/* rim light */}
              <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[0.19, 0.205, 40]} />
                <meshBasicMaterial color={waiterLed} transparent opacity={0.22} toneMapped={false} depthWrite={false} />
              </mesh>

              {/* plate + cup silhouette */}
              <mesh position={[0.04, 0.015, 0.02]} rotation={[-Math.PI / 2, 0, 0]}>
                <circleGeometry args={[0.06, 26]} />
                <meshStandardMaterial color="#e5e7eb" roughness={0.35} metalness={0.0} envMapIntensity={0.9} />
              </mesh>
              <mesh position={[-0.06, 0.03, 0.03]} castShadow>
                <cylinderGeometry args={[0.025, 0.022, 0.05, 14]} />
                <meshStandardMaterial color="#e5e7eb" roughness={0.28} metalness={0.0} envMapIntensity={0.9} />
              </mesh>
            </group>

            {/* tiny sparkles: welcoming, not sci-fi storm */}
            <Sparkles count={10} scale={0.8} size={2} speed={0.25} opacity={0.35} color={waiterWarm} />
          </group>
        ) : !isRobot ? (
          // guest (keep your existing look, slightly cleaned)
          <group>
            <mesh>
              <sphereGeometry args={[0.22, 28, 28]} />
              <meshStandardMaterial color="#38bdf8" emissive="#0284c7" emissiveIntensity={1.2} roughness={0.28} metalness={0.35} toneMapped={false} />
            </mesh>
            <mesh scale={1.1}>
              <sphereGeometry args={[0.25, 28, 28]} />
              <meshBasicMaterial color="#7dd3fc" transparent opacity={0.10} depthWrite={false} />
            </mesh>
            <Sparkles count={12} scale={1.0} size={2} speed={0.8} opacity={0.5} color="#bae6fd" />
          </group>
        ) : (
          // generic robot
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
                <primitive object={ringMat} attach="material" />
              </mesh>
            </group>
          </group>
        )}

        {/* Halo: smaller + cleaner */}
        <mesh ref={haloRef} rotation={[Math.PI / 2, 0, 0]} position={[0, isWaiter ? -0.42 : 0, 0]}>
          <ringGeometry args={[isRobot ? 0.30 : 0.28, isRobot ? 0.36 : 0.33, 48]} />
          <primitive object={ringMat} attach="material" />
        </mesh>

        {/* soft presence light */}
        <pointLight color={displayColor} intensity={isWaiter ? 0.55 : isRobot ? 0.40 : 0.22} distance={2.4} decay={2} />
      </Float>

      {/* floor marker */}
      <group scale={[sizeScale, 1, sizeScale]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.38, 0]}>
          <ringGeometry args={[0.18, 0.30, 32]} />
          <meshBasicMaterial color={displayColor} transparent opacity={isWaiter ? 0.10 : isRobot ? 0.14 : 0.10} toneMapped={false} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
};
