import React, { useState, useRef, useEffect } from 'react';
import { Terminal, Activity, Cpu, Shield, Wifi, Hexagon, X } from 'lucide-react';

interface Ticket { id: string; room: string; type: string; status: 'PENDING' | 'ACTIVE' | 'RESOLVED'; time: string; }

interface ConciergePanelProps {
  active: boolean;
  onClose?: () => void;
}

export const ConciergePanel: React.FC<ConciergePanelProps> = ({ active, onClose }) => {
  const [tickets, setTickets] = useState<Ticket[]>([
    { id: 'T-101', room: '104', type: 'High Noise Alert', status: 'ACTIVE', time: '08:02' },
    { id: 'T-102', room: 'Lobby', type: 'Spill Detected', status: 'PENDING', time: '08:05' },
  ]);
  
  // State for 3D Tilt
  const [rotate, setRotate] = useState({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // --- MOUSE PARALLAX LOGIC ---
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Calculate rotation (center of element is 0,0)
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    // Max rotation in degrees
    const maxRotation = 15;
    
    // Y pixel diff affects X rotation (tilting up/down)
    const rotateX = ((y - centerY) / centerY) * -maxRotation; 
    // X pixel diff affects Y rotation (tilting left/right)
    const rotateY = ((x - centerX) / centerX) * maxRotation;

    setRotate({ x: rotateX, y: rotateY });
  };

  const handleMouseEnter = () => setIsHovering(true);
  
  const handleMouseLeave = () => {
    setIsHovering(false);
    setRotate({ x: 0, y: 0 });
  };

  // --- SIMULATION DATA FEED ---
  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => {
      if (Math.random() > 0.7) {
        const types = ['Room Service', 'HVAC Maint', 'Guest Request', 'Bio-Filter'];
        const statuses: ('PENDING' | 'ACTIVE')[] = ['PENDING', 'ACTIVE'];
        const newTicket: Ticket = {
          id: `T-${Math.floor(Math.random() * 1000)}`,
          room: `${100 + Math.floor(Math.random() * 20)}`,
          type: types[Math.floor(Math.random() * types.length)],
          status: statuses[Math.floor(Math.random() * statuses.length)],
          time: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })
        };
        setTickets(prev => [newTicket, ...prev].slice(0, 4));
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [active]);

  return (
    <div 
      className={`absolute top-24 right-8 w-80 h-[520px] z-30 transition-all duration-700 ${active ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-10 pointer-events-none'}`}
      style={{ perspective: '1200px' }}
    >
      <div 
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="relative w-full h-full rounded-3xl border border-white/10"
        style={{
          transform: `rotateX(${rotate.x}deg) rotateY(${rotate.y}deg)`,
          transformStyle: 'preserve-3d',
          transition: isHovering ? 'transform 0.1s ease-out' : 'transform 0.5s ease-out',
          background: "linear-gradient(180deg, rgba(10,10,16,0.85), rgba(2,6,23,0.95))",
          boxShadow: isHovering 
            ? "0 30px 60px -10px rgba(0,0,0,0.8), 0 0 40px rgba(34,211,238,0.15)"
            : "0 20px 40px -10px rgba(0,0,0,0.8)"
        }}
      >
        {/* --- DEPTH LAYER: BACK GLOW (Behind content) --- */}
        <div 
          className="absolute inset-4 rounded-2xl bg-cyan-500/5 blur-2xl -z-10 transition-opacity"
          style={{ transform: "translateZ(-20px)", opacity: isHovering ? 0.6 : 0.2 }}
        />

        {/* --- DEPTH LAYER: REFLECTIONS (Foreground) --- */}
        <div 
          className="absolute inset-0 rounded-3xl pointer-events-none overflow-hidden"
          style={{ transform: "translateZ(1px)" }}
        >
           <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent opacity-50" />
           {/* Scanlines */}
           <div className="absolute inset-0 opacity-10" style={{ backgroundSize: '100% 3px', backgroundImage: 'linear-gradient(0deg, transparent 0%, transparent 50%, #000 50%, #000 100%)' }} />
        </div>

        {/* --- CONTENT LAYER (Floating) --- */}
        <div className="relative z-10 p-6 flex flex-col h-full" style={{ transform: "translateZ(20px)" }}>
          
          {/* Header */}
          <div className="text-center mb-6 relative">
             <div className="relative w-20 h-20 mx-auto flex items-center justify-center mb-3">
                {/* Rotating Rings */}
                <div className="absolute inset-0 rounded-full border border-cyan-500/30 animate-[spin_10s_linear_infinite]" />
                <div className="absolute inset-2 rounded-full border border-cyan-400/20 border-t-transparent animate-[spin_3s_linear_infinite_reverse]" />
                
                {/* Core Icon */}
                <div className="relative z-10 p-3 bg-slate-950/50 rounded-full border border-cyan-500/20 backdrop-blur-md shadow-[0_0_20px_rgba(34,211,238,0.2)]">
                  <Hexagon size={28} className={`text-cyan-400 ${active ? 'animate-pulse' : 'opacity-50'}`} />
                </div>
                
                {/* Floating Data Nodes */}
                {active && (
                   <>
                    <div className="absolute -right-6 top-2 text-[7px] font-mono text-cyan-300 animate-bounce">CPU: 98%</div>
                    <div className="absolute -left-6 bottom-2 text-[7px] font-mono text-cyan-300 animate-bounce delay-150">NET: 40TB</div>
                   </>
                )}
             </div>
             
             <h2 className="text-lg font-bold uppercase tracking-widest text-white drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]">
               Concierge AI
             </h2>
             <p className="text-[9px] font-mono text-cyan-500/60 tracking-widest">UNIT 734-ALPHA</p>
          </div>

          {/* Vitals */}
          <div className="flex justify-between gap-2 mb-6" style={{ transform: "translateZ(10px)" }}>
             {[
                { label: 'Neural', icon: Cpu, val: 92, col: 'bg-cyan-500' },
                { label: 'Security', icon: Shield, val: 100, col: 'bg-emerald-500' },
                { label: 'Uplink', icon: Wifi, val: 88, col: 'bg-amber-500' }
              ].map((sys, i) => (
                <div key={i} className="flex-1 bg-slate-900/40 border border-white/5 rounded-lg p-2 flex flex-col items-center group hover:border-cyan-500/30 transition-colors">
                   <sys.icon size={12} className="text-slate-400 mb-2 group-hover:text-white transition-colors" />
                   <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden mb-1">
                      <div className={`h-full ${active ? sys.col : 'bg-slate-700'} transition-all duration-1000`} style={{ width: active ? `${sys.val}%` : '0%' }} />
                   </div>
                   <span className="text-[7px] font-mono uppercase text-slate-500">{sys.label}</span>
                </div>
              ))}
          </div>

          {/* Task List */}
          <div className="flex-1 overflow-hidden flex flex-col" style={{ transform: "translateZ(15px)" }}>
             <div className="flex items-center justify-between mb-2 pb-2 border-b border-white/10">
                 <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-cyan-400 flex items-center gap-2">
                   <Terminal size={10} /> Active Tasks
                 </span>
                 <span className="text-[8px] font-mono text-slate-500">{tickets.length} PENDING</span>
              </div>
              
              <div className="flex-1 space-y-2 overflow-y-auto pr-1">
                 {tickets.map((t) => (
                   <div 
                      key={t.id}
                      className="group relative p-3 bg-slate-800/40 border-l-2 border-l-slate-700 hover:border-l-cyan-400 hover:bg-slate-800/60 transition-all cursor-pointer rounded-r-lg"
                   >
                      <div className="flex justify-between items-start">
                         <span className="text-[9px] font-bold text-slate-200 group-hover:text-cyan-200 uppercase tracking-wider">{t.type}</span>
                         <span className="text-[8px] font-mono text-slate-500">{t.time}</span>
                      </div>
                      <div className="flex justify-between items-center mt-1">
                         <span className="text-[8px] font-mono text-cyan-600 uppercase">RM {t.room}</span>
                         <div className="flex items-center gap-1">
                            <div className={`w-1.5 h-1.5 rounded-full ${t.status === 'ACTIVE' ? 'bg-amber-500 animate-pulse' : 'bg-slate-600'}`} />
                         </div>
                      </div>
                   </div>
                 ))}
              </div>
          </div>
          
        </div>

        {/* --- DECORATIVE EXTERIOR ELEMENTS --- */}
        <div className="absolute top-0 left-0 w-4 h-4 border-l border-t border-cyan-500/50 rounded-tl-lg pointer-events-none" style={{ transform: "translateZ(5px)" }} />
        <div className="absolute top-0 right-0 w-4 h-4 border-r border-t border-cyan-500/50 rounded-tr-lg pointer-events-none" style={{ transform: "translateZ(5px)" }} />
        <div className="absolute bottom-0 left-0 w-4 h-4 border-l border-b border-cyan-500/50 rounded-bl-lg pointer-events-none" style={{ transform: "translateZ(5px)" }} />
        <div className="absolute bottom-0 right-0 w-4 h-4 border-r border-b border-cyan-500/50 rounded-br-lg pointer-events-none" style={{ transform: "translateZ(5px)" }} />
        
        {/* Status Light Side Bar */}
        <div 
          className={`absolute -right-1 top-10 w-1 h-8 rounded-l-sm transition-colors ${active ? 'bg-cyan-500 shadow-[0_0_10px_#06b6d4]' : 'bg-red-900'}`} 
          style={{ transform: "translateZ(5px)" }}
        />

        {/* Close Button (Optional) */}
        {onClose && (
           <button 
             onClick={onClose}
             className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors z-50"
             style={{ transform: "translateZ(30px)" }}
           >
             <X size={16} />
           </button>
        )}

      </div>
    </div>
  );
};
