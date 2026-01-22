import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Float, RoundedBox, MeshDistortMaterial, Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import { Agent } from '../types';
import { GRID_WIDTH, GRID_HEIGHT } from '../constants';

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

const WORLD_SCALE = 0.5;
const CENTER_X = GRID_WIDTH / 2;
const CENTER_Y = GRID_HEIGHT / 2;

export const DroneAgent: React.FC<{ 
  agent: Agent; 
  themeColor: string; 
  onHover?: (id: string | null) => void;
  onDoubleClick?: (agent: Agent) => void;
}> = ({ 
  agent, 
  themeColor, 
  onHover,
  onDoubleClick
}) => {
  if (!agent || !agent.position) return null;

  const role = String((agent as any)?.role ?? "").toUpperCase();
  const isRobot = role !== "GUEST";
  const isWaiter = role.includes("WAITER");
  const isInteracting = agent.state === 'SOCIALIZING';

  const guestBlue = "#0ea5e9";
  const baseColor = isRobot ? themeColor : guestBlue;
  
  const waiterWarmth = "#ffffff"; 
  const displayColor = isWaiter ? waiterWarmth : baseColor;
  
  const sizeScale = isWaiter ? 2.2 : 1; 

  const targetX = (agent.position.x - CENTER_X) * WORLD_SCALE;
  const targetZ = (agent.position.y - CENTER_Y) * WORLD_SCALE;

  const groupRef = useRef<THREE.Group>(null);
  const haloRef = useRef<THREE.Mesh>(null);
  const gyroRef = useRef<THREE.Group>(null);
  const trayRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);

  const seed = useMemo(() => {
    const id = String((agent as any)?.id ?? "");
    let h = 2166136261;
    for (let i = 0; i < id.length; i++) h = (h ^ id.charCodeAt(i)) * 16777619;
    return (h >>> 0) / 4294967295;
  }, [(agent as any)?.id]);

  useFrame((state, dt) => {
    const g = groupRef.current;
    if (!g) return;

    const t = state.clock.elapsedTime;
    const camera = state.camera;

    const lerp = 1 - Math.pow(0.001, dt);
    g.position.x = THREE.MathUtils.lerp(g.position.x, targetX, lerp);
    g.position.z = THREE.MathUtils.lerp(g.position.z, targetZ, lerp);

    if (isInteracting) {
        const dx = camera.position.x - g.position.x;
        const dz = camera.position.z - g.position.z;
        const angleToCam = Math.atan2(dx, dz);
        g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, angleToCam, 0.1);
        
        g.rotation.z = THREE.MathUtils.lerp(g.rotation.z, 0, 0.1);
        g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, 0, 0.1);
    } else {
        const dx = targetX - g.position.x;
        const dz = targetZ - g.position.z;
        const desiredYaw = Math.atan2(dx, dz);
        g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, desiredYaw, 0.08);

        const tiltAmount = isWaiter ? 0.005 : (isRobot ? 0.06 : 0.03);
        const tiltX = Math.sin(t * 1.2 + seed * 7) * tiltAmount;
        const tiltZ = Math.sin(t * 1.4 + seed * 5) * tiltAmount;
        
        g.rotation.z = tiltZ;
        g.rotation.x = tiltX;
    }

    const hoverBase = isRobot ? 1.45 : 1.35;
    const bobSpeed = isInteracting ? 0.2 : (isWaiter ? 0.4 : (isRobot ? 2.2 : 1.6));
    const bobAmp = isInteracting ? 0.01 : (isWaiter ? 0.02 : (isRobot ? 0.06 : 0.04));
    
    const bob = Math.sin(t * bobSpeed + seed * 10) * bobAmp;
    g.position.y = hoverBase + bob;

    if (isRobot) {
        if (gyroRef.current && !isWaiter) {
            gyroRef.current.rotation.y += dt * 3.5; 
            gyroRef.current.rotation.x = Math.PI / 2 + Math.sin(t * 0.5 + seed) * 0.15;
        }

        if (isWaiter) {
            if (headRef.current) {
                if (isInteracting) {
                    headRef.current.rotation.y = THREE.MathUtils.lerp(headRef.current.rotation.y, 0, 0.1);
                    const nod = Math.sin(t * 2) * 0.03 + 0.05; 
                    headRef.current.rotation.x = THREE.MathUtils.lerp(headRef.current.rotation.x, nod, 0.1);
                } else {
                    const scan = Math.sin(t * 0.4 + seed * 20) * 0.15;
                    headRef.current.rotation.y = THREE.MathUtils.lerp(headRef.current.rotation.y, scan, 0.05);
                    headRef.current.rotation.x = THREE.MathUtils.lerp(headRef.current.rotation.x, 0, 0.1);
                }
            }

            if (trayRef.current) {
                trayRef.current.rotation.x = -g.rotation.x;
                trayRef.current.rotation.z = -g.rotation.z;
                trayRef.current.position.y = 0.1 + Math.sin(t * 2 + seed * 50) * 0.01;
            }
        }
    }

    if (haloRef.current) {
      const pulseSpeed = isInteracting ? 8 : 3;
      const pulse = 0.55 + 0.25 * Math.sin(t * pulseSpeed + seed * 10);
      haloRef.current.scale.setScalar(1 + pulse * 0.12);
      (haloRef.current.material as THREE.MeshBasicMaterial).opacity = isInteracting ? 0.6 : (isRobot ? 0.35 : 0.18) * pulse;
    }
  });

  const coreMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#0a0a0a",
    roughness: 0.1,
    metalness: 0.8,
    envMapIntensity: 1.0,
  }), []);

  const shellMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: isWaiter ? "#f8f8f8" : (isRobot ? "#14151a" : "#f3f4f6"),
    roughness: isWaiter ? 0.1 : 0.4,
    metalness: isWaiter ? 0.2 : 0.6,
    envMapIntensity: 1.2,
  }), [isRobot, isWaiter]);

  const goldMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#d4af37",
    metalness: 0.9,
    roughness: 0.1,
    envMapIntensity: 1.5,
  }), []);

  const visorMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#020202",
    roughness: 0.0,
    metalness: 1.0,
    envMapIntensity: 2.0,
  }), []);

  const glowMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: displayColor,
    transparent: true,
    opacity: isRobot ? (isWaiter ? 0.8 : 0.25) : 0.14,
    toneMapped: false,
    depthWrite: false,
  }), [displayColor, isRobot, isWaiter]);

  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: displayColor,
    transparent: true,
    opacity: isRobot ? 0.55 : 0.35,
    side: THREE.DoubleSide,
    toneMapped: false,
    depthWrite: false,
  }), [displayColor, isRobot]);

  return (
    <group 
        ref={groupRef} 
        position={[targetX, 1.45, targetZ]}
        onPointerOver={(e) => { e.stopPropagation(); if (onHover) onHover(agent.id); document.body.style.cursor = 'pointer'; }}
        onPointerOut={(e) => { e.stopPropagation(); if (onHover) onHover(null); document.body.style.cursor = 'auto'; }}
        onDoubleClick={(e) => { e.stopPropagation(); if (onDoubleClick) onDoubleClick(agent); }}
    >
      <Float speed={isRobot ? 2 : 1.2} rotationIntensity={isRobot ? 0.12 : 0.5} floatIntensity={0.12} scale={sizeScale}>
        
        {isWaiter ? (
             <group>
                <group position={[0, -0.1, 0]}>
                    <mesh castShadow>
                        <cylinderGeometry args={[0.12, 0.08, 0.45, 16]} />
                        <primitive object={shellMat} attach="material" />
                    </mesh>
                    
                    <mesh position={[0, 0.05, 0.09]}>
                        <RoundedBox args={[0.12, 0.2, 0.02]} radius={0.02} smoothness={4}>
                            <primitive object={visorMat} attach="material" />
                        </RoundedBox>
                    </mesh>
                    <mesh position={[0, 0.05, 0.101]}>
                        <circleGeometry args={[0.02, 16]} />
                        <primitive object={glowMat} attach="material" />
                    </mesh>
                </group>

                <group position={[0, 0.12, 0]}>
                    <mesh rotation={[0, 0, Math.PI / 2]}>
                        <cylinderGeometry args={[0.04, 0.04, 0.32, 16]} />
                        <primitive object={goldMat} attach="material" />
                    </mesh>
                    <mesh position={[-0.16, 0, 0]}>
                        <sphereGeometry args={[0.045, 16, 16]} />
                        <primitive object={goldMat} attach="material" />
                    </mesh>
                    <mesh position={[0.16, 0, 0]}>
                        <sphereGeometry args={[0.045, 16, 16]} />
                        <primitive object={goldMat} attach="material" />
                    </mesh>
                </group>

                <group ref={headRef} position={[0, 0.28, 0]}>
                    <mesh castShadow>
                        <sphereGeometry args={[0.13, 32, 32]} />
                        <primitive object={shellMat} attach="material" />
                    </mesh>
                    
                    <mesh position={[-0.12, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                        <cylinderGeometry args={[0.05, 0.05, 0.05, 16]} />
                        <primitive object={goldMat} attach="material" />
                    </mesh>
                    <mesh position={[0.12, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                        <cylinderGeometry args={[0.05, 0.05, 0.05, 16]} />
                        <primitive object={goldMat} attach="material" />
                    </mesh>

                    <mesh position={[0, 0, 0.06]} rotation={[Math.PI / 2, 0, 0]}>
                        <sphereGeometry args={[0.11, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
                        <primitive object={visorMat} attach="material" />
                    </mesh>
                    
                    <group position={[0, 0.01, 0.12]}>
                        <mesh position={[-0.035, 0, 0]}>
                            <sphereGeometry args={[0.012, 16, 16]} />
                            <primitive object={glowMat} attach="material" />
                        </mesh>
                        <mesh position={[0.035, 0, 0]}>
                            <sphereGeometry args={[0.012, 16, 16]} />
                            <primitive object={glowMat} attach="material" />
                        </mesh>
                    </group>

                    <mesh position={[0, -0.12, 0]}>
                        <cylinderGeometry args={[0.06, 0.06, 0.04, 16]} />
                        <primitive object={goldMat} attach="material" />
                    </mesh>
                </group>

                <group ref={trayRef} position={[0, -0.05, 0.22]}>
                    <mesh castShadow receiveShadow>
                        <cylinderGeometry args={[0.22, 0.12, 0.015, 32]} />
                        <meshPhysicalMaterial color="#111" metalness={0.9} roughness={0.1} clearcoat={1} />
                    </mesh>
                    <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                        <ringGeometry args={[0.2, 0.21, 32]} />
                        <primitive object={glowMat} attach="material" />
                    </mesh>
                </group>
             </group>
        ) : !isRobot ? (
            <group>
                 <mesh><sphereGeometry args={[0.35, 16, 16]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>
                 <mesh>
                    <sphereGeometry args={[0.22, 32, 32]} />
                    <MeshDistortMaterial color="#38bdf8" emissive="#0284c7" emissiveIntensity={1.8} roughness={0.2} metalness={0.5} distort={0.55} speed={3} toneMapped={false} />
                 </mesh>
                 <mesh scale={1.1}><sphereGeometry args={[0.24, 32, 32]} /><meshBasicMaterial color="#7dd3fc" transparent opacity={0.15} depthWrite={false} /></mesh>
                 <Sparkles count={20} scale={1.2} size={3} speed={1} opacity={0.7} color="#bae6fd" />
            </group>
        ) : (
            <group>
                <mesh><sphereGeometry args={[0.35, 16, 16]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>
                <mesh castShadow><icosahedronGeometry args={[0.23, 1]} /><primitive object={coreMat} attach="material" /></mesh>
                <mesh castShadow scale={1.25}><octahedronGeometry args={[0.22, 0]} /><primitive object={shellMat} attach="material" /></mesh>
                <group ref={gyroRef}><mesh><torusGeometry args={[0.34, 0.006, 6, 32]} /><primitive object={ringMat} attach="material" /></mesh></group>
            </group>
        )}

        <mesh ref={haloRef} rotation={[Math.PI / 2, 0, 0]} position={[0, isWaiter ? -0.4 : 0, 0]}>
          <ringGeometry args={[isRobot ? 0.34 : 0.30, isRobot ? 0.42 : 0.36, 48]} />
          <primitive object={ringMat} attach="material" />
        </mesh>
        
        <pointLight color={displayColor} intensity={isRobot ? 0.45 : 0.25} distance={2.4} decay={2} />
      </Float>

      <group scale={[sizeScale, 1, sizeScale]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.38, 0]}>
            <ringGeometry args={[0.22, 0.34, 32]} />
            <meshBasicMaterial color={displayColor} transparent opacity={isRobot ? 0.18 : 0.12} toneMapped={false} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
};