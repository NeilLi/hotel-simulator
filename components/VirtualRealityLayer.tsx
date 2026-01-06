import React, { useMemo, useRef, useState, useEffect, Suspense } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Environment,
  Float,
  RoundedBox,
  Sparkles,
  Grid,
  MeshReflectorMaterial,
} from "@react-three/drei";
import { EffectComposer, Bloom, Noise, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import type { Room, Agent } from "../types";
import { GRID_WIDTH, GRID_HEIGHT } from "../constants";
import { DroneAgent } from "./DroneAgent";

// Fix for missing R3F types in JSX
declare global {
  namespace JSX {
    interface IntrinsicElements {
      div: any;
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
      capsuleGeometry: any;
      rectAreaLight: any;
    }
  }
}

type Quality = "safe" | "medium" | "high";

// -----------------------------
// 1) CINEMATIC CAMERA
// -----------------------------
function CinematicCamera() {
  const { camera, pointer } = useThree();
  const vec = useMemo(() => new THREE.Vector3(), []);

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

// -----------------------------
// 2) GRADIENT BACKDROP
// -----------------------------
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

// -----------------------------
// 3) DYNAMIC DATA WALL
// -----------------------------
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
            <mesh>
              <planeGeometry args={[0.5, 8]} />
              <meshBasicMaterial color={themeColor} transparent opacity={0.18} />
            </mesh>
            <mesh position={[2, -2, 0]}>
              <planeGeometry args={[0.2, 4]} />
              <meshBasicMaterial color={themeColor} transparent opacity={0.10} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

// -----------------------------
// 4) ARCHITECTURAL LIGHT PANELS (cheap color wash)
// -----------------------------
function LightPanels({ a, b }: { a: string; b: string }) {
  return (
    <group>
      <mesh position={[0, 10.8, 2]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[18, 6]} />
        <meshBasicMaterial color={a} transparent opacity={0.06} toneMapped={false} />
      </mesh>

      <mesh position={[0, 6, -14.7]}>
        <planeGeometry args={[40, 12]} />
        <meshBasicMaterial color={b} transparent opacity={0.05} toneMapped={false} />
      </mesh>
    </group>
  );
}

// -----------------------------
// 5) FLOOR INLAYS (clean single-color style, reflection-safe)
// -----------------------------
function FloorInlays({
  palette,
  quality,
}: {
  palette: { accentA: string };
  quality: Quality;
}) {
  const y = 0.012;

  return (
    <group position={[0, y, 0]}>
      {/* Single-color concentric rings - architectural etchings, not light sources */}
      {[12, 20].map((r) => (
        <mesh key={r} rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[r, r + 0.06, 128]} />
          <meshStandardMaterial
            color={palette.accentA}
            emissive={palette.accentA}
            emissiveIntensity={0.6}
            roughness={0.35}
            metalness={0.25}
          />
        </mesh>
      ))}
    </group>
  );
}

// -----------------------------
// 6) MEZZANINE RING (top floor feel)
// -----------------------------
function Mezzanine({
  neonA,
  neonWhiteMat,
  quality,
}: {
  neonA: THREE.Material;
  neonWhiteMat: THREE.Material;
  quality: Quality;
}) {
  const y = 6.2;
  const radius = 22;

  return (
    <group position={[0, y, 0]}>
      <mesh receiveShadow castShadow>
        <cylinderGeometry args={[radius, radius, 0.6, 96, 1, true]} />
        <meshStandardMaterial color="#101318" roughness={0.55} metalness={0.15} envMapIntensity={0.9} />
      </mesh>

      <mesh position={[0, -0.31, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius - 6.5, radius - 0.4, 96]} />
        <meshStandardMaterial color="#0b0d14" roughness={0.95} metalness={0.0} />
      </mesh>

      <mesh position={[0, 0.45, 0]}>
        <torusGeometry args={[radius - 0.2, 0.06, 12, 180]} />
        <primitive object={neonA} attach="material" />
      </mesh>

      {Array.from({ length: 22 }).map((_, i) => {
        const a = (i / 22) * Math.PI * 2;
        const px = Math.cos(a) * (radius - 0.3);
        const pz = Math.sin(a) * (radius - 0.3);
        return (
          <mesh key={i} position={[px, 0.05, pz]} castShadow>
            <cylinderGeometry args={[0.06, 0.06, 0.9, 10]} />
            <primitive object={neonWhiteMat} attach="material" />
          </mesh>
        );
      })}

      {quality !== "safe" && (
        <mesh position={[0, -0.35, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[radius - 1.0, radius + 1.0, 96]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.04} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

// -----------------------------
// 7) LOBBY ENVIRONMENT
//    - No transmission (sandbox stability)
// -----------------------------
function LobbyEnvironment({
  themeColor,
  neonA,
  neonWhiteMat,
  neonB,
  neonC,
  isGolden,
  quality,
}: {
  themeColor: string;
  neonA: THREE.Material;
  neonWhiteMat: THREE.Material;
  neonB: THREE.Material;
  neonC: THREE.Material;
  isGolden: boolean;
  quality: Quality;
}) {
  return (
    <group>
      {/* RECEPTION */}
      <group position={[0, 0, -2]}>
        <RoundedBox args={[10, 1.1, 3]} radius={0.2} smoothness={8} position={[0, 0.55, 0]}>
          <meshStandardMaterial color="#161a24" roughness={0.25} metalness={0.65} envMapIntensity={1.2} />
        </RoundedBox>

        <mesh position={[0, 0.08, 0]}>
          <boxGeometry args={[10.4, 0.06, 3.4]} />
          <primitive object={neonB} attach="material" />
        </mesh>

        <mesh position={[0, 0.5, 1.51]}>
          <boxGeometry args={[9.8, 0.05, 0.02]} />
          <primitive object={neonA} attach="material" />
        </mesh>

        {/* Glass top (stable) */}
        <mesh position={[0, 1.15, 0]}>
          <boxGeometry args={[9.6, 0.08, 2.8]} />
          <meshPhysicalMaterial
            color="#ffffff"
            transparent
            opacity={0.10}
            roughness={0.25}
            metalness={0.0}
            clearcoat={1}
            clearcoatRoughness={0.12}
            envMapIntensity={1.3}
          />
        </mesh>

        {[-4.9, 4.9].map((x) => (
          <mesh key={x} position={[x, 0.65, 0]}>
            <boxGeometry args={[0.08, 1.0, 2.9]} />
            <primitive object={neonC} attach="material" />
          </mesh>
        ))}

        <Float speed={2} rotationIntensity={0.05} floatIntensity={0.1}>
          <group position={[0, 1.8, 0.5]}>
            <mesh>
              <planeGeometry args={[5, 1.5]} />
              <meshBasicMaterial color={themeColor} transparent opacity={0.10} side={THREE.DoubleSide} toneMapped={false} />
            </mesh>
          </group>
        </Float>
      </group>

      {/* COLUMNS */}
      {[-14, 14].map((sideX) => (
        <group key={sideX}>
          {[-5, 10].map((zPos) => (
            <group key={zPos} position={[sideX, 6, zPos]}>
              <mesh castShadow receiveShadow>
                <cylinderGeometry args={[2, 2, 12, 28]} />
                <meshStandardMaterial
                  color={isGolden ? "#4a3424" : "#2b3242"}
                  roughness={0.55}
                  metalness={0.08}
                  emissive={isGolden ? "#2a1a10" : "#0a1020"}
                  emissiveIntensity={0.22}
                  envMapIntensity={1.0}
                />
              </mesh>

              <mesh position={[0, -5.6, 0]} castShadow receiveShadow>
                <cylinderGeometry args={[2.35, 2.35, 0.6, 24]} />
                <meshStandardMaterial color="#151a21" roughness={0.5} metalness={0.2} />
              </mesh>

              <mesh position={[0, 5.6, 0]} castShadow receiveShadow>
                <cylinderGeometry args={[2.25, 2.25, 0.6, 24]} />
                <meshStandardMaterial color="#151a21" roughness={0.5} metalness={0.2} />
              </mesh>

              <mesh position={[0, 2.2, 0]}>
                <torusGeometry args={[2.05, 0.05, 10, 48]} />
                <primitive object={sideX > 0 ? neonB : neonC} attach="material" />
              </mesh>
              <mesh position={[0, -2.2, 0]}>
                <torusGeometry args={[2.05, 0.05, 10, 48]} />
                <primitive object={sideX > 0 ? neonC : neonB} attach="material" />
              </mesh>

              <mesh position={[sideX > 0 ? -1.9 : 1.9, 0, 0]}>
                <boxGeometry args={[0.12, 12, 0.25]} />
                <primitive object={neonA} attach="material" />
              </mesh>

              <mesh position={[0, 3, 0.001]}>
                <torusGeometry args={[2.05, 0.05, 12, 56]} />
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
          <meshStandardMaterial color="#1d2230" roughness={0.85} metalness={0.08} envMapIntensity={0.8} />
        </mesh>

        {[-6, -2, 2, 6].map((x) => (
          <group key={x}>
            {/* Core bright line */}
            <mesh position={[x, -0.1, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <planeGeometry args={[0.18, 40]} />
              <primitive object={neonA} attach="material" />
            </mesh>
            {/* Soft halo (cheap bloom effect) */}
            <mesh position={[x, -0.11, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <planeGeometry args={[0.45, 40]} />
              <meshBasicMaterial color={themeColor} transparent opacity={0.05} toneMapped={false} />
            </mesh>
          </group>
        ))}
      </group>

      {/* BACK WALL */}
      <group position={[0, 6, -15]}>
        <DataStreamBackground themeColor={themeColor} />
        <mesh receiveShadow>
          <boxGeometry args={[60, 20, 0.5]} />
          <meshPhysicalMaterial
            color={isGolden ? "#ffd2b8" : "#cceeff"}
            transparent
            opacity={0.13}
            roughness={0.75}
            metalness={0.0}
            clearcoat={0.6}
            clearcoatRoughness={0.35}
            envMapIntensity={0.7}
          />
        </mesh>

        <mesh position={[0, 0, 0.3]}>
          <ringGeometry args={[5, 5.1, 128]} />
          <primitive object={neonA} attach="material" />
        </mesh>
        <mesh position={[0, 0, 0.32]}>
          <ringGeometry args={[7, 7.02, 128]} />
          <primitive object={neonA} attach="material" />
        </mesh>
      </group>
    </group>
  );
}

// -----------------------------
// 8) SEEDCORE MONOLITH
// -----------------------------
function SeedCoreMonolith({ color }: { color: string }) {
  return (
    <group position={[0, 5, -2]}>
      <Float speed={3} rotationIntensity={0.5} floatIntensity={0.2}>
        <mesh>
          <octahedronGeometry args={[0.6, 0]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={4} toneMapped={false} />
        </mesh>
        {/* Keep this tiny sparkle count stable */}
        <Sparkles count={36} scale={2} size={3} speed={0.35} opacity={0.45} color={color} />
      </Float>
      <mesh position={[0, -2, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 4]} />
        <meshBasicMaterial color={color} transparent opacity={0.2} />
      </mesh>
    </group>
  );
}

// -----------------------------
// 9) POST FX — optional + safe fallback
// -----------------------------
function PostFX({ enabled }: { enabled: boolean }) {
  const { gl } = useThree();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let t = 0;
    if (!enabled) {
      setReady(false);
      return;
    }
    t = window.setTimeout(() => {
      const ctx = gl.getContext();
      if ((ctx as any)?.isContextLost?.() === true) return;
      setReady(true);
    }, 250);

    return () => window.clearTimeout(t);
  }, [enabled, gl]);

  if (!ready) return null;

  // Keep Bloom conservative for sandbox stability
  return (
    <EffectComposer multisampling={0}>
      <Bloom luminanceThreshold={1.45} intensity={0.65} radius={0.22} mipmapBlur={false} levels={4} />
      <Noise opacity={0.035} />
      <Vignette eskil={false} offset={0.1} darkness={1.0} />
    </EffectComposer>
  );
}

class FxBoundary extends React.Component<{ onError: () => void; children: React.ReactNode }> {
  componentDidCatch() {
    const props = (this as any).props as { onError: () => void; children: React.ReactNode };
    props.onError();
  }
  render() {
    const props = (this as any).props as { onError: () => void; children: React.ReactNode };
    return props.children;
  }
}

// -----------------------------
// 10) QUALITY MANAGER (stable state machine)
// -----------------------------
function useQualityManager(enabled: boolean, lockedSafe: boolean) {
  const [quality, setQuality] = useState<Quality>("safe");
  const [fps, setFps] = useState(60);

  const fpsAcc = useRef({ frames: 0, last: performance.now() });
  const stableUp = useRef(0);
  const stableDown = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    if (lockedSafe) setQuality("safe");
    else setQuality("safe"); // start safe on enable
  }, [enabled, lockedSafe]);

  useFrame(() => {
    if (!enabled) return;

    // Estimate fps ~2x/sec
    const now = performance.now();
    fpsAcc.current.frames += 1;
    const dt = now - fpsAcc.current.last;

    if (dt >= 500) {
      const currentFps = (fpsAcc.current.frames * 1000) / dt;
      setFps(currentFps);
      fpsAcc.current.frames = 0;
      fpsAcc.current.last = now;

      if (lockedSafe) {
        setQuality("safe");
        return;
      }

      // Upgrade logic (needs stability)
      if (currentFps >= 55) stableUp.current += 1;
      else if (currentFps >= 42) stableUp.current += 0.5;
      else stableUp.current = Math.max(0, stableUp.current - 0.5);

      // Downgrade logic (avoid thrashing)
      if (currentFps < 28) stableDown.current += 1;
      else stableDown.current = Math.max(0, stableDown.current - 0.5);

      // Apply transitions
      setQuality((q) => {
        if (stableDown.current >= 3) {
          // ~1.5s below threshold -> drop one level
          stableDown.current = 0;
          return q === "high" ? "medium" : "safe";
        }

        if (q === "safe" && stableUp.current >= 3) return "medium"; // ~1.5s stable
        if (q === "medium" && stableUp.current >= 6) return "high"; // longer stability
        return q;
      });
    }
  });

  return { quality, fps };
}

// -----------------------------
// MAIN COMPONENT
// -----------------------------
export function VirtualRealityLayer({
  atmosphere,
  enabled,
  rooms,
  agents,
  backgroundImage,
  onAgentHover,
  onAgentDoubleClick,
}: {
  atmosphere: string;
  enabled: boolean;
  rooms: Room[];
  agents: Agent[];
  backgroundImage?: string;
  onAgentHover?: (id: string | null) => void;
  onAgentDoubleClick?: (agent: Agent) => void;
}) {
  const isGolden = atmosphere === "GOLDEN_HOUR";
  const themeColor = isGolden ? "#fbbf24" : "#06b6d4";
  const safeAgents = useMemo(() => (Array.isArray(agents) ? agents : []), [agents]);

  const [lockedSafe, setLockedSafe] = useState(false);
  const [postFxDisabled, setPostFxDisabled] = useState(false);

  // Quality + FPS (stable)
  // NOTE: useFrame inside hook requires Canvas, so we render a small child below to run the hook.
  // We'll store quality/fps in state via a bridge component.

  const [quality, setQuality] = useState<Quality>("safe");
  const [fps, setFps] = useState(60);

  const palette = useMemo(() => {
    const accentA = isGolden ? "#fbbf24" : "#06b6d4";
    const accentB = isGolden ? "#a855f7" : "#f97316";
    const accentC = isGolden ? "#22c55e" : "#a78bfa";
    return { accentA, accentB, accentC };
  }, [isGolden]);

  const makeNeon = (color: string, emissiveIntensity = 3) =>
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity,
      toneMapped: false,
    });

  const neonA = useMemo(() => makeNeon(palette.accentA, 3.0), [palette]);
  const neonB = useMemo(() => makeNeon(palette.accentB, 2.6), [palette]);
  const neonC = useMemo(() => makeNeon(palette.accentC, 2.4), [palette]);

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

  const dpr = 1;

  // Feature gating
  const allowReflector = !lockedSafe && quality === "high" && fps > 55;
  const allowPostFX = !lockedSafe && quality === "high" && !postFxDisabled;

  if (!enabled) return null;

  return (
    <div className="absolute inset-0 z-10 transition-opacity duration-1000 animate-in fade-in" style={{ opacity: 1 }}>
      <Canvas
        shadows
        dpr={dpr}
        camera={{ fov: 50, position: [0, 4, 20], near: 0.1, far: 200 }}
        gl={{ antialias: true, alpha: false, depth: true, stencil: false, powerPreference: "high-performance" }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.40;

          gl.shadowMap.enabled = true;
          gl.shadowMap.type = THREE.PCFSoftShadowMap;

          const canvas = gl.domElement;

          const onLost = (e: Event) => {
            e.preventDefault();
            setLockedSafe(true);     // only lock on real context loss
            setPostFxDisabled(true); // and disable postfx too
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
        {/* Bridge: run quality hook inside Canvas and push to outer state */}
        <QualityBridge enabled={enabled} lockedSafe={lockedSafe} onUpdate={(q, f) => { setQuality(q); setFps(f); }} />

        <CinematicCamera />
        <GradientBackdrop isGolden={isGolden} />
        <fogExp2 attach="fog" args={[isGolden ? "#451a03" : "#0f172a", 0.012]} />

        <Suspense fallback={null}>
          <Environment preset={isGolden ? "sunset" : "city"} blur={0.25} background={false} />
        </Suspense>

        {/* Brighter base so it’s not “black lobby” */}
        <ambientLight intensity={0.9} />
        <hemisphereLight args={[isGolden ? "#fcd34d" : "#22d3ee", "#1e1b4b", 1.15]} />

        <pointLight position={[0, 10, 0]} intensity={2.2} distance={80} decay={1} color="#ffffff" />
        <spotLight
          position={[20, 30, 20]}
          angle={0.38}
          penumbra={0.25}
          intensity={quality === "high" ? 60 : quality === "medium" ? 50 : 40}
          distance={160}
          decay={2}
          color={isGolden ? "#fff7ed" : "#e0f2fe"}
          castShadow
          shadow-mapSize={[quality === "high" ? 1024 : 512, quality === "high" ? 1024 : 512]}
          shadow-bias={-0.00002}
          shadow-normalBias={0.02}
        />

        <spotLight position={[-15, 10, -5]} intensity={quality === "safe" ? 22 : 34} distance={100} decay={2} color={themeColor} />
        <pointLight position={[26, 4, 0]} intensity={1.3} distance={120} color={palette.accentC} />
        <pointLight position={[-26, 4, 0]} intensity={1.1} distance={120} color={palette.accentB} />
        {/* Front fill to avoid black crush */}
        <pointLight position={[0, 5, 18]} intensity={1.2} distance={80} decay={2} color="#ffffff" />

        <group>
          {/* FLOOR */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[100, 100]} />
            {allowReflector ? (
              <MeshReflectorMaterial
                resolution={256}
                blur={[60, 16]}
                mixBlur={0.5}
                mixStrength={8}
                roughness={0.14}
                metalness={0.32}
                color={isGolden ? "#1a1f2e" : "#151b2a"}
                depthScale={0.5}
                minDepthThreshold={0.75}
                maxDepthThreshold={1.05}
                mirror={0.16}
              />
            ) : (
              // Medium/safe: polished physical floor (stable, brighter)
              <meshPhysicalMaterial
                color={isGolden ? "#1a1f2e" : "#151b2a"}
                roughness={quality === "medium" ? 0.22 : 0.35}
                metalness={0.25}
                clearcoat={quality === "medium" ? 0.9 : 0.65}
                clearcoatRoughness={quality === "medium" ? 0.18 : 0.25}
                envMapIntensity={1.15}
              />
            )}
          </mesh>

          {/* Grid: subtle floor etching - reflection-safe */}
          <Grid
            args={[60, 60]}
            cellSize={2}
            cellThickness={0.35}
            cellColor={themeColor}
            sectionSize={10}
            sectionThickness={0.7}
            sectionColor={themeColor}
            fadeDistance={22}
            followCamera={false}
            infiniteGrid={false}
            position={[0, 0.02, 0]}
            material-transparent
            material-opacity={0.35}
            material-depthWrite={false}
            material-toneMapped={false}
          />

          <FloorInlays palette={palette} quality={quality} />
          <LightPanels a={palette.accentA} b={palette.accentB} />
          <Mezzanine neonA={neonA} neonWhiteMat={neonWhiteMat} quality={quality} />

          <LobbyEnvironment
            themeColor={themeColor}
            neonA={neonA}
            neonWhiteMat={neonWhiteMat}
            neonB={neonB}
            neonC={neonC}
            isGolden={isGolden}
            quality={quality}
          />

          <SeedCoreMonolith color={themeColor} />

          {safeAgents.map((agent) => (
            <DroneAgent
              key={agent.id}
              agent={agent}
              themeColor={themeColor}
              onHover={onAgentHover}
              onDoubleClick={onAgentDoubleClick}
            />
          ))}

          {/* Sparkles: keep buffers stable (no count changes, reflection-safe) */}
          <Sparkles
            count={120}
            scale={30}
            size={quality === "high" ? 2 : 1.6}
            speed={0.2}
            opacity={quality === "high" ? 0.32 : 0.22}
            color="#fff"
            position={[0, 5, 0]}
            depthWrite={false}
            toneMapped={false}
          />
        </group>

        {/* POST PROCESSING (optional, never locks safe) */}
        <FxBoundary
          onError={() => {
            // disable postFX only (don’t lock safe)
            setPostFxDisabled(true);
            // also drop quality one step to reduce stress
            setQuality((q) => (q === "high" ? "medium" : q));
          }}
        >
          <Suspense fallback={null}>{allowPostFX ? <PostFX enabled /> : null}</Suspense>
        </FxBoundary>
      </Canvas>

      <div
        className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/40 px-2 py-1 text-xs text-white"
        style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}
      >
        quality: {lockedSafe ? "safe (locked)" : quality}
        {" | "}
        postfx: {postFxDisabled ? "off" : allowPostFX ? "on" : "gated"}
        {" | "}
        fps≈{Math.round(fps)}
      </div>
    </div>
  );
}

// Runs inside Canvas (so it can use useFrame) and reports quality+fps outward.
function QualityBridge({
  enabled,
  lockedSafe,
  onUpdate,
}: {
  enabled: boolean;
  lockedSafe: boolean;
  onUpdate: (q: Quality, fps: number) => void;
}) {
  const { quality, fps } = useQualityManager(enabled, lockedSafe);

  useEffect(() => {
    onUpdate(quality, fps);
  }, [quality, fps, onUpdate]);

  return null;
}
