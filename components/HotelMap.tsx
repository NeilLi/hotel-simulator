import React, { useRef, useEffect, useState, useCallback } from 'react';
import { EntityType, Room, Agent, AgentRole } from '../types';
import { GRID_WIDTH, GRID_HEIGHT } from '../constants';

interface HotelMapProps {
  grid: EntityType[][];
  rooms: Room[];
  agents: Agent[];
  onRoomClick: (room: Room) => void;
  atmosphere: string;
}

export const HotelMap: React.FC<HotelMapProps> = ({ rooms, agents, onRoomClick, atmosphere }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Camera state
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 15 });
  const isDragging = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });

  // Isometric projection helper
  // x, y are grid coordinates (0 to 80, 0 to 44)
  // z is height (offset upwards)
  const project = (x: number, y: number, z: number = 0) => {
    // Standard isometric math
    const centerX = canvasRef.current ? canvasRef.current.width / 2 : 0;
    const centerY = canvasRef.current ? canvasRef.current.height / 2 : 0;
    
    // Shift grid to be centered around (0,0) before projection
    const cx = x - GRID_WIDTH / 2;
    const cy = y - GRID_HEIGHT / 2;

    const px = centerX + camera.x + (cx - cy) * camera.zoom;
    const py = centerY + camera.y + (cx + cy) * (camera.zoom * 0.5) - z * camera.zoom;
    
    return { x: px, y: py };
  };

  // Rendering logic
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear background
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 1. Draw Grid
    ctx.beginPath();
    ctx.strokeStyle = '#0e749022'; // Very faint cyan
    ctx.lineWidth = 1;
    for (let i = 0; i <= GRID_WIDTH; i++) {
      const p1 = project(i, 0);
      const p2 = project(i, GRID_HEIGHT);
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
    }
    for (let j = 0; j <= GRID_HEIGHT; j++) {
      const p1 = project(0, j);
      const p2 = project(GRID_WIDTH, j);
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
    }
    ctx.stroke();

    // 2. Draw Rooms (Wireframe boxes)
    rooms.forEach(room => {
      const h = room.type === 'LOBBY' ? 3 : 1.5;
      const x1 = room.topLeft.x;
      const y1 = room.topLeft.y;
      const x2 = room.bottomRight.x + 1;
      const y2 = room.bottomRight.y + 1;

      const p00 = project(x1, y1, 0);
      const p10 = project(x2, y1, 0);
      const p11 = project(x2, y2, 0);
      const p01 = project(x1, y2, 0);

      const p00h = project(x1, y1, h);
      const p10h = project(x2, y1, h);
      const p11h = project(x2, y2, h);
      const p01h = project(x1, y2, h);

      // Styles based on atmosphere and type
      const isGarden = room.type === 'GARDEN';
      const color = isGarden ? '#10b981' : '#22d3ee';
      
      // Draw footprint (faint fill)
      ctx.beginPath();
      ctx.moveTo(p00.x, p00.y);
      ctx.lineTo(p10.x, p10.y);
      ctx.lineTo(p11.x, p11.y);
      ctx.lineTo(p01.x, p01.y);
      ctx.closePath();
      ctx.fillStyle = isGarden ? '#10b98111' : '#0ea5e911';
      ctx.fill();

      // Draw wireframe
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      
      // Bottom face
      ctx.beginPath();
      ctx.moveTo(p00.x, p00.y); ctx.lineTo(p10.x, p10.y); ctx.lineTo(p11.x, p11.y); ctx.lineTo(p01.x, p01.y); ctx.closePath();
      ctx.stroke();

      // Top face
      ctx.beginPath();
      ctx.moveTo(p00h.x, p00h.y); ctx.lineTo(p10h.x, p10h.y); ctx.lineTo(p11h.x, p11h.y); ctx.lineTo(p01h.x, p01h.y); ctx.closePath();
      ctx.stroke();

      // Pillars
      ctx.beginPath();
      ctx.moveTo(p00.x, p00.y); ctx.lineTo(p00h.x, p00h.y);
      ctx.moveTo(p10.x, p10.y); ctx.lineTo(p10h.x, p10h.y);
      ctx.moveTo(p11.x, p11.y); ctx.lineTo(p11h.x, p11h.y);
      ctx.moveTo(p01.x, p01.y); ctx.lineTo(p01h.x, p01h.y);
      ctx.stroke();

      // Labels (if zoom is high enough)
      if (camera.zoom > 10 && room.id !== 'GARDEN-MAIN') {
        const center = project((x1+x2)/2, (y1+y2)/2, h + 0.5);
        ctx.fillStyle = color;
        ctx.font = 'bold 8px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(room.name.toUpperCase(), center.x, center.y);
      }
    });

    // 3. Draw Agents (Glowing nodes)
    agents.forEach(agent => {
      const pos = project(agent.position.x + 0.5, agent.position.y + 0.5, 0.5);
      const isRobot = agent.role !== AgentRole.GUEST;
      
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, isRobot ? 3 : 2, 0, Math.PI * 2);
      ctx.fillStyle = isRobot ? '#22d3ee' : '#fcd34d';
      ctx.shadowBlur = 10;
      ctx.shadowColor = isRobot ? '#22d3ee' : '#fcd34d';
      ctx.fill();
      ctx.shadowBlur = 0; // Reset shadow for next drawings
    });

  }, [rooms, agents, camera]);

  // Handle Resizing
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current && canvasRef.current) {
        canvasRef.current.width = containerRef.current.clientWidth;
        canvasRef.current.height = containerRef.current.clientHeight;
        render();
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, [render]);

  // Handle Animation
  useEffect(() => {
    let frame: number;
    const loop = () => {
      render();
      frame = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(frame);
  }, [render]);

  // Interactions
  const onMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;
    setCamera(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const onMouseUp = () => {
    isDragging.current = false;
  };

  const onWheel = (e: React.WheelEvent) => {
    const delta = -e.deltaY;
    setCamera(prev => ({
      ...prev,
      zoom: Math.max(5, Math.min(50, prev.zoom + delta * 0.05))
    }));
  };

  const onClick = (e: React.MouseEvent) => {
    // Basic hit detection (check which room bounds contain mouse point in world space)
    // For a simple UX, we translate mouse coords back to a rough grid estimate
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left - canvas.width / 2 - camera.x;
    const my = e.clientY - rect.top - canvas.height / 2 - camera.y;

    // Inverse of:
    // x_screen = (cx - cy) * zoom
    // y_screen = (cx + cy) * (zoom * 0.5)
    // Solving for cx, cy:
    const zoom = camera.zoom;
    const cx = (mx / zoom + my / (zoom * 0.5)) / 2;
    const cy = (my / (zoom * 0.5) - mx / zoom) / 2;
    
    // Back to grid
    const gx = cx + GRID_WIDTH / 2;
    const gy = cy + GRID_HEIGHT / 2;

    const clickedRoom = rooms.find(r => 
      gx >= r.topLeft.x && gx <= r.bottomRight.x + 1 &&
      gy >= r.topLeft.y && gy <= r.bottomRight.y + 1
    );

    if (clickedRoom) onRoomClick(clickedRoom);
  };

  return (
    <div ref={containerRef} className="w-full h-full relative bg-slate-950 overflow-hidden">
      <canvas
        ref={canvasRef}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
        onClick={onClick}
        className="cursor-move"
      />
      
      {/* Interaction Hint */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-none text-[9px] font-mono text-cyan-500/40 uppercase tracking-[0.3em] flex items-center gap-4 bg-slate-950/40 px-4 py-2 rounded-full backdrop-blur-sm">
        <span>[ L-CLICK: PAN ]</span>
        <div className="w-1 h-1 rounded-full bg-cyan-950" />
        <span>[ CLICK BOX: SELECT ]</span>
        <div className="w-1 h-1 rounded-full bg-cyan-950" />
        <span>[ SCROLL: ZOOM ]</span>
      </div>

      {/* Decorative Blueprint elements */}
      <div className="absolute top-6 left-6 pointer-events-none opacity-20 border-l border-t border-cyan-500 w-12 h-12" />
      <div className="absolute bottom-6 right-6 pointer-events-none opacity-20 border-r border-b border-cyan-500 w-12 h-12" />
    </div>
  );
};