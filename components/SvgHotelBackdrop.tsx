import React, { useEffect, useRef, useState, useMemo } from "react";
import { getTheme, getCoordinates } from "../utils/svgHotelMap";
import type { Room, Agent } from "../types";

// --- HOLOGRAPHIC STYLES ---
const GLOBAL_STYLES = `
  .holo-container {
    perspective: 1200px;
    overflow: hidden;
  }
  .holo-plane {
    transform-style: preserve-3d;
    transform: rotateX(25deg) scale(0.9);
    transition: transform 0.2s cubic-bezier(0.1, 0.7, 1.0, 0.1);
  }
  .agent-pin { transition: all 0.5s ease-out; }
  
  @keyframes spin-slow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @keyframes spin-rev { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }
  @keyframes pulse-ring { 0% { r: 0; opacity: 1; } 100% { r: 10; opacity: 0; } }
  @keyframes float-y { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }
  
  .animate-spin-slow { transform-origin: center; animation: spin-slow 20s linear infinite; }
  .animate-spin-rev { transform-origin: center; animation: spin-rev 15s linear infinite; }
  .animate-pulse-ring { animation: pulse-ring 3s infinite ease-out; }
`;

interface Props {
  atmosphere: string;
  enabled: boolean;
  rooms: Room[];
  agents: Agent[];
  gridW?: number;
  gridH?: number;
}

export function SvgHotelBackdrop({
  atmosphere,
  enabled,
  rooms,
  agents,
  gridW = 80,
  gridH = 44,
}: Props) {
  const theme = useMemo(() => getTheme(atmosphere), [atmosphere]);
  const [mouse, setMouse] = useState({ x: 0.5, y: 0.5, rawX: 0, rawY: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled) return;
    const handleMouseMove = (e: MouseEvent) => {
      // Normalize 0..1 for gradients, -0.5..0.5 for tilt
      const x = e.clientX / window.innerWidth;
      const y = e.clientY / window.innerHeight;
      setMouse({ x, y, rawX: e.clientX, rawY: e.clientY });
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [enabled]);

  if (!enabled) return null;

  // Render Constants
  const VB = `0 0 ${gridW} ${gridH}`;
  const CENTER_X = gridW / 2;
  const CENTER_Y = gridH - 12; // Adjusted for perspective center

  // Dynamic Tilt based on mouse
  const tiltX = (mouse.y - 0.5) * 5; // +/- 2.5deg
  const tiltY = (mouse.x - 0.5) * 5; // +/- 2.5deg

  // Defensive copies
  const safeRooms = Array.isArray(rooms) ? rooms : [];
  const safeAgents = Array.isArray(agents) ? agents : [];

  return (
    <div ref={containerRef} className="absolute inset-0 bg-[#020617] select-none holo-container">
      <style>{GLOBAL_STYLES}</style>

      {/* --- MOUSE FOLLOW SPOTLIGHT (Lighting Illusion) --- */}
      <div 
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          background: `radial-gradient(circle at ${mouse.rawX}px ${mouse.rawY}px, ${theme.gridStrong} 0%, transparent 40%)`,
          opacity: 0.15
        }}
      />

      {/* --- 3D HOLOGRAPHIC PLANE --- */}
      <div 
        className="w-full h-full holo-plane will-change-transform"
        style={{ transform: `rotateX(${25 + tiltX}deg) rotateY(${tiltY}deg) scale(0.9)` }}
      >
        <svg viewBox={VB} className="w-full h-full overflow-visible" preserveAspectRatio="xMidYMid meet">
          <defs>
            <filter id="glow-blur">
              <feGaussianBlur stdDeviation="0.4" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <linearGradient id="wall-grad" x1="0" y1="1" x2="0" y2="0">
               <stop offset="0%" stopColor={theme.roomBorder} stopOpacity="0" />
               <stop offset="100%" stopColor={theme.roomBorder} stopOpacity="0.4" />
            </linearGradient>
            <mask id="grid-mask">
              <rect x="0" y="0" width={gridW} height={gridH} fill="url(#vignette-grad)" />
            </mask>
            <radialGradient id="vignette-grad" cx="50%" cy="50%" r="60%">
              <stop offset="0%" stopColor="white" />
              <stop offset="100%" stopColor="black" />
            </radialGradient>
          </defs>

          {/* LAYER 1: BASE GRID (The Floor) */}
          <g mask="url(#grid-mask)">
            {/* Horizontal Lines */}
            {[...Array(23)].map((_, i) => (
              <line 
                key={`h-${i}`} 
                x1="0" y1={i * 2} x2={gridW} y2={i * 2} 
                stroke={theme.grid} 
                strokeWidth={i % 5 === 0 ? 0.15 : 0.05} 
                opacity={0.5}
              />
            ))}
            {/* Vertical Lines */}
            {[...Array(41)].map((_, i) => (
              <line 
                key={`v-${i}`} 
                x1={i * 2} y1="0" x2={i * 2} y2={gridH} 
                stroke={theme.grid} 
                strokeWidth={i % 5 === 0 ? 0.15 : 0.05} 
                opacity={0.5}
              />
            ))}
          </g>

          {/* LAYER 2: ROOM FOOTPRINTS (Glass Panels) */}
          {safeRooms.map(room => {
             const { x, y, w, h } = getCoordinates(room);
             return (
               <g key={room.id} opacity="0.8">
                  {/* Floor Plate */}
                  <rect x={x} y={y} width={w} height={h} fill={theme.roomFill} stroke="none" />
                  {/* Back Wall (Illusion of 3D) */}
                  <rect x={x} y={y} width={w} height={0.5} fill="url(#wall-grad)" />
                  {/* Corners */}
                  <path 
                    d={`M${x},${y+1} V${y} H${x+1} M${x+w-1},${y} H${x+w} V${y+1} M${x+w},${y+h-1} V${y+h} H${x+w-1} M${x+1},${y+h} H${x} V${y+h-1}`}
                    fill="none" stroke={theme.roomBorder} strokeWidth="0.1" opacity="0.8"
                  />
                  {/* Label */}
                  <text 
                     x={x + w/2} y={y + h/2} 
                     fill={theme.text} 
                     fontSize="0.7" 
                     textAnchor="middle" 
                     dominantBaseline="middle"
                     fontFamily="monospace"
                     opacity="0.6"
                     style={{ textShadow: `0 0 4px ${theme.bg}` }}
                  >
                     {room.name.toUpperCase()}
                  </text>
               </g>
             );
          })}

          {/* LAYER 3: THE CORE (Focal Anchor) */}
          <g transform={`translate(${CENTER_X}, ${CENTER_Y})`} opacity="0.8">
             {/* Rotating Rings */}
             <circle r="6" fill="none" stroke={theme.gridStrong} strokeWidth="0.05" strokeDasharray="1 1" className="animate-spin-slow" opacity="0.3" />
             <circle r="4" fill="none" stroke={theme.gridStrong} strokeWidth="0.1" strokeDasharray="2 4" className="animate-spin-rev" opacity="0.5" />
             {/* Pulse */}
             <circle r="0" fill="none" stroke={theme.agentRobot} strokeWidth="0.1" className="animate-pulse-ring" />
             <text y="8" fill={theme.gridStrong} fontSize="0.6" textAnchor="middle" letterSpacing="0.2">AI CORE: ACTIVE</text>
          </g>

          {/* LAYER 4: VOLUMETRIC AGENTS (The "Pins") */}
          {safeAgents.map(agent => {
             const { x, y, rotation } = getCoordinates(agent);
             const isRobot = agent.role.includes('ROBOT');
             const color = isRobot ? theme.agentRobot : theme.agentHuman;
             // We render the agent "floating" above the grid using Y offset logic
             // But in pure SVG map coords, y is "down". 
             // To simulate height in this tilted view, we draw a line "up" (negative Y) relative to the board tilt.
             
             // Base coordinate on grid
             const baseX = x + 0.5;
             const baseY = y + 0.5;
             
             // "Height" of the pin
             const pinHeight = 1.5; 

             return (
               <g key={agent.id} className="agent-pin">
                  {/* 1. Shadow on floor */}
                  <ellipse cx={baseX} cy={baseY} rx="0.4" ry="0.2" fill="black" opacity="0.5" />
                  
                  {/* 2. The Stem (Verticality Cue) */}
                  <line 
                    x1={baseX} y1={baseY} 
                    x2={baseX} y2={baseY - pinHeight} 
                    stroke={color} 
                    strokeWidth="0.05" 
                    opacity="0.4" 
                  />
                  
                  {/* 3. The Head (Floating) */}
                  <g transform={`translate(${baseX}, ${baseY - pinHeight})`}>
                     {/* Glow */}
                     <circle r="0.6" fill={color} opacity="0.15" filter="url(#glow-blur)" />
                     {/* Solid Core */}
                     <circle r="0.25" fill={color} />
                     {/* Direction Arrow */}
                     <path 
                       d="M0,0 L0.6,0" 
                       stroke={color} 
                       strokeWidth="0.1" 
                       transform={`rotate(${rotation})`}
                     />
                  </g>
               </g>
             );
          })}
        </svg>
      </div>

      {/* --- OVERLAYS --- */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#020617] to-transparent pointer-events-none" />
      <div className="absolute inset-0 pointer-events-none mix-blend-overlay opacity-20" 
           style={{ backgroundImage: 'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06))', backgroundSize: '100% 2px, 3px 100%' }} 
      />
    </div>
  );
}