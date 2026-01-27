import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Compass,
  Box,
  Shirt,
  Sparkles,
  ChevronRight,
  Aperture,
  Baby,
  Palette,
  Scissors,
  Star
} from "lucide-react";
import { WearableStoryStudio } from "./DIYEra/WearableStoryStudio";
import { MagicAtelier } from "./DIYEra/MagicAtelier";
import { JourneyStudio } from "./DIYEra/JourneyStudio";
import { GiftForgePage } from "./DIYEra/GiftForgePage";

/**
 * DIY Era — Creative Studio Scene
 * Handles navigation between the main "Hub" and specific creative modules.
 */

const STYLES = `
@keyframes floatSlow {
  0%,100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}
@keyframes blobPulse {
  0% { transform: scale(1); opacity: 0.5; }
  50% { transform: scale(1.1); opacity: 0.7; }
  100% { transform: scale(1); opacity: 0.5; }
}
@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-5px); }
}
@keyframes spin-slow {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@keyframes shimmer-gold {
  0% { background-position: -200% center; }
  100% { background-position: 200% center; }
}
@keyframes firework-burst {
  0% { transform: scale(0); opacity: 0; }
  15% { opacity: 1; transform: scale(0.5); }
  50% { opacity: 0.8; }
  100% { transform: scale(1.5); opacity: 0; }
}
@keyframes firework-particles {
  0% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
  100% { transform: translate(calc(-50% + var(--tx)), calc(-50% + var(--ty))) scale(0); opacity: 0; }
}
.animate-blob { animation: blobPulse 10s ease-in-out infinite; }
.animate-spin-slow { animation: spin-slow 12s linear infinite; }

.animation-delay-1000 { animation-delay: 1s; }
.animation-delay-2000 { animation-delay: 2s; }
.animation-delay-3000 { animation-delay: 3s; }

/* gradient movement for your headline */
@keyframes gradient-x {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
.animate-gradient-x {
  background-size: 200% 200%;
  animation: gradient-x 7s ease-in-out infinite;
}

/* optional: make fireworks pop on bright backgrounds */
.fireworks-pop { opacity: 1; }

.scrollbar-hide::-webkit-scrollbar {
    display: none;
}
.scrollbar-hide {
    -ms-overflow-style: none;
    scrollbar-width: none;
}
`;

// --- Small utility for class joining ---
const cx = (...parts: Array<string | false | undefined | null>) =>
  parts.filter(Boolean).join(" ");

type Zone = {
  id: string;
  name: string; 
  caption: string; 
  icon: React.ComponentType<any>;
  theme: "blue" | "gold" | "rose" | "royal";
  isKids?: boolean;
};

// Vibrant, saturated color themes with Blue/Gold focus
const THEMES: Record<Zone["theme"], { bg: string; border: string; text: string; iconBg: string; shadow: string; accent: string }> = {
  blue: {
    bg: "bg-blue-50",
    border: "border-blue-300 group-hover:border-blue-500",
    text: "text-blue-900",
    iconBg: "bg-gradient-to-br from-blue-500 to-blue-700 text-white",
    shadow: "shadow-blue-300",
    accent: "bg-blue-600",
  },
  gold: {
    bg: "bg-amber-50",
    border: "border-amber-200 group-hover:border-amber-400",
    text: "text-amber-900",
    iconBg: "bg-gradient-to-br from-amber-300 to-orange-500 text-white",
    shadow: "shadow-amber-200",
    accent: "bg-amber-500",
  },
  royal: {
    bg: "bg-indigo-50",
    border: "border-indigo-200 group-hover:border-indigo-400",
    text: "text-indigo-900",
    iconBg: "bg-gradient-to-br from-indigo-400 to-violet-600 text-white",
    shadow: "shadow-indigo-200",
    accent: "bg-indigo-500",
  },
  rose: {
    bg: "bg-rose-50",
    border: "border-rose-200 group-hover:border-rose-400",
    text: "text-rose-900",
    iconBg: "bg-gradient-to-br from-rose-400 to-pink-600 text-white",
    shadow: "shadow-rose-200",
    accent: "bg-rose-500",
  }
};

// --- FIREWORKS COMPONENT ---
function Firework({ x, y, color, delay, scale = 1 }: { x: number; y: number; color: string; delay: number; scale?: number }) {
  const particles = useMemo(() => {
    const count = 14;
    return Array.from({ length: count }).map((_, i) => {
      const angle = (i / count) * Math.PI * 2;
      const velocity = 70 + Math.random() * 70;
      const tx = Math.cos(angle) * velocity;
      const ty = Math.sin(angle) * velocity;
      return { tx, ty };
    });
  }, []);

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        transform: `translate(-50%, -50%) scale(${scale})`,
        willChange: "transform",
      }}
    >
      <div
        className="relative"
        style={{
          animation: `firework-burst 2.8s ease-out infinite`,
          animationDelay: `${delay}ms`,
          transformOrigin: "center",
        }}
      >
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 rounded-full blur-3xl opacity-40"
          style={{ backgroundColor: color }}
        />
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full opacity-90"
          style={{ backgroundColor: color, boxShadow: `0 0 18px ${color}` }}
        />
        {particles.map((p, i) => (
          <div
            key={i}
            className="absolute left-1/2 top-1/2 w-1.5 h-1.5 rounded-full"
            style={
              {
                backgroundColor: color,
                boxShadow: `0 0 10px ${color}`,
                animation: `firework-particles 2.8s ease-out infinite`,
                animationDelay: `${delay}ms`,
                ["--tx" as any]: `${p.tx}px`,
                ["--ty" as any]: `${p.ty}px`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
    </div>
  );
}

function FireworksBackground() {
  const fireworks: Array<{ x: number; y: number; color: string; delay: number; scale: number }> = [
    { x: 10, y: 20, color: '#3b82f6', delay: 0, scale: 1 },        
    { x: 85, y: 15, color: '#f59e0b', delay: 1200, scale: 1.1 },  
    { x: 50, y: 30, color: '#ec4899', delay: 600, scale: 1.2 },   
    { x: 20, y: 45, color: '#a855f7', delay: 1800, scale: 0.9 },  
    { x: 75, y: 55, color: '#10b981', delay: 2400, scale: 1 },    
    { x: 35, y: 10, color: '#06b6d4', delay: 900, scale: 0.8 },   
    { x: 65, y: 40, color: '#f97316', delay: 1500, scale: 1.1 },  
    { x: 45, y: 25, color: '#8b5cf6', delay: 300, scale: 1 },     
    { x: 90, y: 50, color: '#14b8a6', delay: 2100, scale: 0.9 },  
    { x: 15, y: 60, color: '#f43f5e', delay: 2700, scale: 1.2 },  
  ];

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none fireworks-pop">
      {fireworks.map((fw, i) => (
        // @ts-ignore
        <Firework key={i} x={fw.x} y={fw.y} color={fw.color} delay={fw.delay} scale={fw.scale} />
      ))}
    </div>
  );
}

function TopBar({
  onBack,
  logoSrc,
}: {
  onBack: () => void;
  logoSrc?: string;
}) {
  return (
    <div className="relative z-20 flex-shrink-0 flex items-center justify-between px-6 py-6 md:px-10">
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="group inline-flex items-center gap-2 rounded-full border border-blue-300 bg-white/80 backdrop-blur-md px-5 py-2.5
                     text-[11px] font-bold uppercase tracking-widest text-blue-700 hover:text-blue-800
                     hover:border-blue-500 hover:shadow-lg hover:shadow-blue-200 transition-all"
        >
          <ArrowLeft size={16} className="text-blue-500 group-hover:text-blue-600 transition" />
          Return
        </button>

        <div className="h-6 w-px bg-slate-200 hidden sm:block" />

        <div className="hidden sm:flex items-center gap-3">
          <div className="flex items-center gap-2 text-blue-900">
             <div className="p-1.5 bg-blue-600 rounded-lg text-white shadow-md shadow-blue-300">
                <Aperture size={16} />
             </div>
             <span className="text-[12px] font-bold tracking-widest uppercase text-blue-800">
                SeedCore
             </span>
          </div>
          <span className="ml-2 text-[10px] font-bold tracking-widest uppercase text-amber-600 bg-amber-100 px-2 py-1 rounded-md border border-amber-200">
            Creator Studio
          </span>
        </div>
      </div>

      <div className="hidden md:flex items-center gap-3">
        <div className="flex -space-x-2">
            {[1,2,3].map(i => (
                <div key={i} className={`w-7 h-7 rounded-full border-2 border-white flex items-center justify-center text-[9px] font-bold text-white shadow-sm ${
                    i === 1 ? 'bg-blue-400' : i === 2 ? 'bg-amber-400' : 'bg-rose-400'
                }`}>
                    {String.fromCharCode(64+i)}
                </div>
            ))}
        </div>
        <span className="text-[10px] font-bold tracking-widest uppercase text-slate-400">
          3 Creators Active
        </span>
      </div>
    </div>
  );
}

function PortalCTA({
  onExplore,
}: {
  onExplore: () => void;
}) {
  return (
      <div className="relative z-10 w-full mb-10">
      <div className="relative overflow-hidden rounded-[2rem] border border-blue-300 bg-white shadow-[0_20px_50px_-10px_rgba(37,99,235,0.25)] group hover:shadow-[0_30px_60px_-10px_rgba(37,99,235,0.3)] transition-all duration-500">
        
        <div className="absolute inset-0 bg-gradient-to-br from-blue-100/60 via-white to-blue-50/60" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-blue-300/30 to-blue-200/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 animate-blob" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-gradient-to-tr from-blue-400/25 to-cyan-300/20 rounded-full blur-3xl translate-y-1/3 -translate-x-1/3 animate-blob animation-delay-2000" />

        <div className="relative p-10 md:p-14 flex flex-col md:flex-row items-center md:items-start justify-between gap-10">
            <div className="flex-1 text-center md:text-left z-10">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-900 text-white text-[10px] font-bold uppercase tracking-widest mb-6 shadow-lg shadow-slate-200">
                <Star size={12} className="text-amber-400 fill-amber-400" />
                <span>Featured Experience</span>
              </div>
              
              <h1 className="text-5xl md:text-6xl font-black text-slate-900 tracking-tight mb-6 leading-[1.1]">
                Design Your <br/>
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-blue-500 to-blue-700 animate-gradient-x">
                    Masterpiece
                </span>
              </h1>
              
              <p className="max-w-xl text-slate-600 text-base font-medium leading-relaxed mb-10 mx-auto md:mx-0">
                Step into a world of limitless creativity. Use our intuitive AI tools to craft bespoke fashion, direct films, or build 3D wonders.
              </p>

              <div className="flex flex-col sm:flex-row items-center gap-5 justify-center md:justify-start">
                <button
                  onClick={onExplore}
                  className="relative overflow-hidden inline-flex items-center justify-center gap-3 rounded-full
                            bg-gradient-to-r from-blue-600 to-blue-700 px-10 py-5 text-sm font-bold uppercase tracking-widest text-white
                            hover:scale-105 active:scale-95 transition-all shadow-xl shadow-blue-300 hover:shadow-blue-400/50"
                >
                  <span className="relative z-10 flex items-center gap-3">
                    Start Creating
                    <div className="bg-white/20 p-1 rounded-full">
                       <ChevronRight size={16} className="text-white" />
                    </div>
                  </span>
                  <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-12" />
                </button>

                <div className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-widest text-slate-400 bg-white/60 px-4 py-2 rounded-full border border-slate-100">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <span>Studio Live</span>
                </div>
              </div>
            </div>

            <div className="relative hidden md:block w-72 h-72 flex-shrink-0">
               <div className="absolute inset-0 rounded-full border-2 border-dashed border-blue-300 animate-spin-slow" />
               <div className="absolute inset-4 rounded-full border border-blue-400/50 animate-spin-slow animation-delay-1000" style={{ animationDirection: 'reverse' }} />
               <div className="absolute inset-0 bg-gradient-to-tr from-blue-100 to-blue-50 rounded-full" />
               <div className="absolute inset-8 bg-white rounded-full shadow-2xl shadow-blue-200 flex items-center justify-center z-10">
                   <Palette size={80} className="text-blue-700 drop-shadow-sm" />
               </div>
               
               <div className="absolute top-0 right-8 bg-white p-3.5 rounded-2xl shadow-lg border border-blue-200 animate-bounce text-blue-500 transform rotate-12">
                  <Scissors size={28} />
               </div>
               <div className="absolute bottom-10 -left-2 bg-white p-3.5 rounded-2xl shadow-lg border border-blue-300 animate-bounce text-blue-600 transform -rotate-12" style={{ animationDelay: '0.5s' }}>
                  <Box size={28} />
               </div>
               <div className="absolute top-1/2 -right-6 bg-white p-3.5 rounded-2xl shadow-lg border border-blue-400 animate-bounce text-blue-700" style={{ animationDelay: '1s' }}>
                  <Shirt size={28} />
               </div>
            </div>
        </div>
      </div>
    </div>
  );
}

function DoorTile({
  zone,
  focused,
  onFocus,
  onOpen,
}: {
  zone: Zone;
  focused: boolean;
  onFocus: () => void;
  onOpen: () => void;
}) {
  const Icon = zone.icon;
  const theme = THEMES[zone.theme];
  const isKids = zone.isKids;

  return (
    <button
      onMouseEnter={onFocus}
      onFocus={onFocus}
      onClick={onOpen}
      className={cx(
        "group relative w-full rounded-3xl text-left overflow-hidden min-h-[200px] flex-1",
        "transition-all duration-300 outline-none flex flex-col justify-between",
        "border-[3px]",
        focused 
          ? `bg-white scale-[1.02] shadow-2xl ${theme.shadow} z-10 ${theme.border}` 
          : `bg-white border-slate-100 hover:border-slate-200 shadow-sm hover:shadow-lg`,
        isKids && !focused && "bg-gradient-to-br from-rose-50 to-purple-50 border-rose-100"
      )}
    >
      <div className={cx(
        "absolute top-0 right-0 w-48 h-48 rounded-bl-full opacity-0 group-hover:opacity-100 transition-all duration-500 ease-out",
        theme.bg,
        focused ? "scale-100" : "scale-50 opacity-0"
      )} />

      {isKids && (
        <div className="absolute top-5 right-5 z-20">
             <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-rose-200 shadow-sm">
                <Baby size={12} className="text-rose-500" />
                <span className="text-[9px] font-black text-rose-600 uppercase tracking-widest">Kids Zone</span>
             </div>
        </div>
      )}

      <div className="relative p-7 flex flex-col h-full justify-between z-10">
        <div className="flex flex-col gap-5">
            <div
              className={cx(
                "w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-500 shadow-md",
                focused ? "scale-110 rotate-3" : "",
                theme.iconBg
              )}
            >
              <Icon size={26} />
            </div>

            <div>
              <div className={cx(
                  "text-[17px] font-bold tracking-tight leading-tight transition-colors",
                  focused ? "text-slate-900" : "text-slate-700"
              )}>
                {zone.name}
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                 <div className={cx("w-8 h-0.5 rounded-full transition-colors", focused ? theme.accent : "bg-slate-200")} />
                 <div className="text-[10px] font-bold tracking-widest uppercase text-slate-400 group-hover:text-slate-500">
                    {zone.caption}
                 </div>
              </div>
            </div>
        </div>

        <div className="flex items-center justify-between mt-4">
             <div className="flex -space-x-2 opacity-0 group-hover:opacity-100 transition-opacity delay-75">
                {[1,2,3].map(i => <div key={i} className="w-6 h-6 rounded-full bg-slate-100 border-2 border-white shadow-sm" />)}
             </div>
             
             <div className={cx(
                "w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300",
                focused ? `text-white shadow-lg transform translate-x-1 ${theme.accent.replace('bg-', 'bg-')}` : "bg-slate-50 text-slate-300"
             )}>
                <ChevronRight size={20} />
             </div>
        </div>
      </div>
    </button>
  );
}

export function DIYEraLuxPortal({
  onBack,
  onEnterZone,
  logoSrc,
}: {
  onBack: () => void;
  onEnterZone?: (zoneId: string) => void;
  logoSrc?: string;
}) {
  const [ready, setReady] = useState(false);
  const [focus, setFocus] = useState<string>("JOURNEY");
  const [activeModule, setActiveModule] = useState<string | null>(null); // NAV STATE
  
  const wrapRef = useRef<HTMLDivElement>(null);
  const [spot, setSpot] = useState({ x: 50, y: 35 });

  useEffect(() => {
    setReady(true);
  }, []);

  const zones: Zone[] = useMemo(
    () => [
      { id: "JOURNEY", name: "Journey Studio", caption: "Direct Your Story", icon: Compass, theme: "royal" },
      { id: "GIFT", name: "Gift Forge", caption: "Craft 3D Objects", icon: Box, theme: "gold" },
      { id: "WEAR", name: "Fashion Lab", caption: "Design Wearables", icon: Shirt, theme: "blue" },
      { id: "KIDS", name: "Magic Atelier", caption: "Build Companions", icon: Sparkles, theme: "rose" },
    ],
    []
  );

  const focusedZone = zones.find((z) => z.id === focus) ?? zones[0];
  const activeTheme = THEMES[focusedZone.theme];

  const handleExplore = () => {
    if (focus === "WEAR") setActiveModule("WEAR");
    if (focus === "KIDS") setActiveModule("KIDS");
    if (focus === "JOURNEY") setActiveModule("JOURNEY");
    if (focus === "GIFT") setActiveModule("GIFT");
    if (onEnterZone) onEnterZone(focus);
  };

  const handleOpenZone = (id: string) => {
    setFocus(id);
    if (id === "WEAR") setActiveModule("WEAR");
    if (id === "KIDS") setActiveModule("KIDS");
    if (id === "JOURNEY") setActiveModule("JOURNEY");
    if (id === "GIFT") setActiveModule("GIFT");
    if (onEnterZone) onEnterZone(id);
  };

  const onMouseMove = (e: React.MouseEvent) => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    setSpot({ x, y });
  };

  // --- SUB-APP RENDER ---
  if (activeModule === "WEAR") {
      return <WearableStoryStudio onBack={() => setActiveModule(null)} />;
  }
  if (activeModule === "KIDS") {
      return <MagicAtelier onBack={() => setActiveModule(null)} />;
  }
  if (activeModule === "JOURNEY") {
      return <JourneyStudio onBack={() => setActiveModule(null)} />;
  }
  if (activeModule === "GIFT") {
      return <GiftForgePage onBack={() => setActiveModule(null)} />;
  }

  // --- MAIN HUB RENDER ---
  return (
    <div
      ref={wrapRef}
      onMouseMove={onMouseMove}
      className="relative h-screen w-full bg-[#FAFAFA] text-slate-900 flex flex-col overflow-hidden"
    >
      <style>{STYLES}</style>

      {/* Background: Richer Blue/Gold Gradients */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-100/80 via-blue-50/90 to-blue-200/70" />
        <div className="absolute inset-0 opacity-[0.02] mix-blend-multiply" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }} />
        <FireworksBackground />
        <div className="absolute top-[-10%] left-[10%] w-[40%] h-[40%] bg-blue-400/20 rounded-full blur-[120px]" />
        <div className="absolute top-[20%] right-[-5%] w-[30%] h-[50%] bg-blue-500/15 rounded-full blur-[100px]" />
        <div className="absolute bottom-[-10%] left-[20%] w-[40%] h-[40%] bg-blue-600/20 rounded-full blur-[120px]" />
        <div className="absolute top-[50%] right-[20%] w-[25%] h-[30%] bg-cyan-400/15 rounded-full blur-[100px]" />
        <div
          className="absolute inset-0 transition-opacity duration-300 mix-blend-screen"
          style={{
            background: `radial-gradient(circle at ${spot.x}% ${spot.y}%, rgba(255,255,255,0.35), transparent 35%)`,
          }}
        />
      </div>

      <TopBar onBack={onBack} logoSrc={logoSrc} />

      <div className="flex-1 overflow-y-auto scrollbar-hide relative z-10 w-full min-h-0">
        <div
            className={cx(
            "max-w-7xl mx-auto px-6 pb-20 pt-2 md:px-10 w-full",
            "transition-all duration-1000",
            ready ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            )}
        >
            <PortalCTA onExplore={handleExplore} />

            {/* Layout Grid - Responsive */}
            <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-6 mb-8" style={{ gridAutoRows: '1fr' }}>
                {zones.map((z) => (
                    <div key={z.id} className="flex h-full">
                        <DoorTile
                            zone={z}
                            focused={focus === z.id}
                            onFocus={() => setFocus(z.id)}
                            onOpen={() => handleOpenZone(z.id)}
                        />
                    </div>
                ))}
            </div>

            {/* Detail Panel */}
            <div className="w-full">
                <div className={cx(
                    "relative rounded-[2rem] overflow-hidden bg-white shadow-2xl transition-all duration-500 border-4 w-full",
                    activeTheme.border.replace('group-hover:', ''),
                    focusedZone.isKids ? "border-rose-100 shadow-rose-100" : "border-slate-50 shadow-slate-200"
                )}>
                    <div className={cx("h-40 w-full relative overflow-hidden", activeTheme.bg)}>
                        <div className="absolute inset-0 bg-gradient-to-t from-white via-transparent to-transparent opacity-80" />
                        <div className="absolute top-4 right-4 opacity-20"><Sparkles size={48} className={activeTheme.text} /></div>
                        <div className="absolute bottom-4 left-4 w-24 h-24 rounded-full bg-current opacity-10 blur-xl" style={{ color: "currentColor" }} />
                    </div>

                    <div className="relative px-8 pb-10 -mt-16 flex flex-col">
                         <div className={cx("w-28 h-28 rounded-[2rem] flex items-center justify-center shadow-xl mb-6 border-[6px] border-white transform rotate-3", activeTheme.iconBg)}>
                            <focusedZone.icon size={44} className="text-white drop-shadow-md" />
                         </div>

                         <div className="flex-1 flex flex-col">
                            <div className="flex items-center gap-2 mb-3">
                               <div className={cx("px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest text-white", activeTheme.accent)}>
                                  Selected
                               </div>
                            </div>
                            
                            <h2 className="text-4xl font-black text-slate-900 mb-4 leading-tight">
                                {focusedZone.name}
                            </h2>
                            <p className="text-[15px] font-medium text-slate-500 leading-relaxed mb-10">
                                {focusedZone.id === "KIDS"
                                    ? "Design and customize your perfect hotel companion. Create intelligent robot buddies with unique personalities, skills, and behaviors powered by Wonder-Tech™. Perfect for guests of all ages who want a personalized concierge experience."
                                    : `Step into the ${focusedZone.name} to start your project. Our AI assistants will help you iterate on designs, materials, and final production.`
                                }
                            </p>
                         </div>

                         <div className="mt-auto pt-4">
                            <button
                                onClick={() => handleOpenZone(focusedZone.id)}
                                className={cx(
                                    "w-full group relative overflow-hidden inline-flex items-center justify-center gap-3 rounded-2xl py-4 text-xs font-bold uppercase tracking-widest transition-all transform active:scale-95 shadow-lg text-white",
                                    activeTheme.iconBg
                                )}
                            >
                                <span className="relative z-10 flex items-center gap-2">
                                    Enter {focusedZone.name}
                                    <ChevronRight size={16} className="opacity-70 group-hover:translate-x-1 transition-transform" />
                                </span>
                                <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-12" />
                            </button>
                            
                            <div className="mt-5 flex justify-center text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                Capacity: Available
                            </div>
                         </div>
                    </div>
                </div>
            </div>

            <div className="mt-24 flex items-center justify-center opacity-60 pb-12">
                <div className="flex items-center gap-6 text-[10px] font-bold tracking-[0.3em] uppercase text-slate-400 bg-white/50 px-8 py-3 rounded-full border border-slate-200">
                  <span>Create</span>
                  <div className="w-1 h-1 bg-amber-400 rounded-full" />
                  <span>Share</span>
                  <div className="w-1 h-1 bg-blue-600 rounded-full" />
                  <span>Inspire</span>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}
