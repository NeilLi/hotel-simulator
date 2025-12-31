import React, { useState, useEffect, useCallback } from 'react';
import { Aperture, Map, Film, X, Activity, Clock, Power, Cpu, AlertTriangle, Layers, Terminal, Loader2 } from 'lucide-react';
import { geminiService } from './services/geminiService';
import { generateMap, generateAgents, updateAgentsLogic, updateAgentsDialogue, generateDialogueForAgent, setConversingAgent } from './utils/simulationUtils';
import { EntityType, Room, Agent, SeedCoreState, SeedCorePlane } from './types';
import { GRID_WIDTH, GRID_HEIGHT, TICK_RATE_MS } from './constants';
import { SvgHotelBackdrop } from './components/SvgHotelBackdrop';
import { VirtualLobby } from './components/VirtualLobby';
import { ConciergePanel } from './components/ConciergePanel';

// --- SIDEBAR COMPONENT: SENSORY TELEMETRY (LEFT) ---
const SensoryTelemetryPanel = ({ active }: { active: boolean }) => {
  const [lux, setLux] = useState(450);
  const [db, setDb] = useState(45);
  const [temp, setTemp] = useState(22.0);

  useEffect(() => {
    if (!active) return;
    const i = setInterval(() => {
      setLux(prev => Math.min(800, Math.max(200, prev + (Math.random() - 0.5) * 50)));
      setDb(prev => Math.min(90, Math.max(30, prev + (Math.random() - 0.5) * 10)));
      setTemp(prev => 22.0 + (Math.random() - 0.5));
    }, 1000);
    return () => clearInterval(i);
  }, [active]);

  const Bar = ({ label, value, max, unit, color }: any) => (
    <div className="mb-4">
      <div className="flex justify-between text-[9px] font-mono text-cyan-700 mb-1 uppercase tracking-wider">
        <span>{label}</span>
        <span className="text-cyan-400">{active ? `${value.toFixed(1)}${unit}` : '---'}</span>
      </div>
      <div className="h-0.5 w-full bg-cyan-950/30 rounded-full overflow-hidden">
        <div 
          className={`h-full transition-all duration-1000 ease-out ${active ? color : 'bg-slate-800'}`} 
          style={{ width: active ? `${(value / max) * 100}%` : '0%' }}
        />
      </div>
    </div>
  );

  return (
    <div className="absolute top-24 left-8 w-64 bg-slate-950/40 backdrop-blur-xl border border-cyan-500/20 p-6 rounded-xl z-30 flex flex-col pointer-events-none shadow-[0_0_40px_rgba(0,0,0,0.5)]">
      <h3 className="text-[10px] font-bold text-cyan-400 uppercase tracking-[0.3em] mb-8 flex items-center gap-3">
        <Activity size={14} /> {active ? 'Sensory Data' : 'Sensors Off'}
      </h3>
      <Bar label="Lux Channel" value={lux} max={1000} unit=" lx" color="bg-amber-500" />
      <Bar label="Acoustic Load" value={db} max={100} unit=" dB" color="bg-cyan-500" />
      <Bar label="Thermal Gradient" value={temp} max={30} unit="°C" color="bg-emerald-500" />
      {!active && (
        <div className="mt-4 text-[8px] font-mono text-slate-600 animate-pulse uppercase tracking-[0.1em]">
          Core Deactivated
        </div>
      )}
    </div>
  );
};

// --- MAIN APP COMPONENT ---
const App: React.FC = () => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [inLobby, setInLobby] = useState(true);
  const [isAiEnabled, setIsAiEnabled] = useState(false);
  
  const [grid, setGrid] = useState<EntityType[][]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isVideoLoading, setIsVideoLoading] = useState(false);
  
  const [coreState, setCoreState] = useState<SeedCoreState>({
    activeAtmosphere: 'MORNING_LIGHT',
    logs: [],
    timeOfDay: 8.0 
  });

  useEffect(() => {
    const { grid: g, rooms: r } = generateMap(GRID_WIDTH, GRID_HEIGHT);
    setGrid(g);
    setRooms(r);
    setAgents(generateAgents(8, GRID_WIDTH, GRID_HEIGHT));
    setIsInitialized(true);
  }, []);

  const tick = useCallback(async () => {
    // Fix: Defensive check to prevent accessing property of undefined
    if (!grid || !Array.isArray(grid) || !grid.length) return;
    setAgents(prev => updateAgentsLogic(prev || [], grid, coreState));
    setCoreState(prev => ({ ...prev, timeOfDay: (prev.timeOfDay + 0.05) % 24 }));
  }, [grid, coreState]);

  useEffect(() => {
    if (!isInitialized) return;
    const interval = setInterval(tick, TICK_RATE_MS);
    return () => clearInterval(interval);
  }, [isInitialized, tick]);

  // Separate effect for dialogue generation (runs less frequently to avoid API spam)
  useEffect(() => {
    if (!isInitialized || !isAiEnabled) return;
    
    const dialogueInterval = setInterval(async () => {
      await updateAgentsDialogue(agents, coreState, (agentId, dialogue, audioUrl) => {
        setAgents(prev => prev.map(agent => 
          agent.id === agentId 
            ? { ...agent, dialogue, audioUrl, lastDialogueTime: Date.now() }
            : agent
        ));
      });
    }, 20000); // Check for dialogue generation every 20 seconds

    return () => clearInterval(dialogueInterval);
  }, [isInitialized, isAiEnabled, agents, coreState]);

  const requestShot = async (desc: string) => {
    if (!isAiEnabled) return;
    setIsVideoLoading(true);
    const result = await geminiService.generateCinematicShot(desc, coreState.activeAtmosphere);
    if (result.url) {
      setVideoUrl(result.url);
    } else if (result.message) {
      // Show error/limit message to user
      alert(result.message);
    }
    setIsVideoLoading(false);
  };

  return (
    <div className="relative w-screen h-screen bg-[#020617] overflow-hidden text-slate-200 font-system selection:bg-cyan-500/20">
      
      {/* VIRTUAL LOBBY (MAIN SCREEN) */}
      {inLobby ? (
        <div className="absolute inset-0 z-50 animate-in fade-in duration-700">
           <VirtualLobby 
            onExitLobby={() => setInLobby(false)}
            coreState={coreState}
            updateCoreState={(updates) => setCoreState(prev => ({ ...prev, ...updates }))}
            isAiEnabled={isAiEnabled}
            setIsAiEnabled={setIsAiEnabled}
            rooms={rooms}
            agents={agents}
            onAgentClick={async (agentId) => {
              setAgents(prev => {
                const clickedAgent = prev.find(a => a.id === agentId);
                if (!clickedAgent) return prev;
                
                // Only allow waiters and guests to enter conversation
                const canConversate = clickedAgent.role === 'ROBOT_WAITER' || clickedAgent.role === 'GUEST';
                if (!canConversate) return prev;
                
                // Get previous conversing agent and exit it
                const previousConversingAgentId = setConversingAgent(agentId);
                
                // Update agents: exit previous conversing agent, enter new one
                const updatedAgents = prev.map(agent => {
                  // Exit previous conversing agent
                  if (previousConversingAgentId && agent.id === previousConversingAgentId) {
                    return { 
                      ...agent, 
                      state: 'PAUSING' as const,
                      isGeneratingDialogue: false
                    };
                  }
                  // Enter conversation for clicked agent
                  if (agent.id === agentId) {
                    return { 
                      ...agent, 
                      state: 'CONVERSING' as const, 
                      target: { ...agent.position }, // Stop movement immediately
                      isGeneratingDialogue: true // Show loading state
                    };
                  }
                  return agent;
                });
                
                // Find the clicked agent and generate dialogue immediately
                const updatedClickedAgent = updatedAgents.find(a => a.id === agentId);
                if (updatedClickedAgent && isAiEnabled) {
                  // Generate dialogue immediately for the clicked agent (queued to prevent concurrent calls)
                  generateDialogueForAgent(updatedClickedAgent, updatedAgents, coreState, (agentId, dialogue, audioUrl) => {
                    setAgents(current => current.map(agent => 
                      agent.id === agentId 
                        ? { 
                            ...agent, 
                            dialogue, 
                            audioUrl, 
                            lastDialogueTime: Date.now(),
                            isGeneratingDialogue: false // Clear loading state
                          }
                        : agent
                    ));
                  }).catch(error => {
                    // Clear loading state on error
                    setAgents(current => current.map(agent => 
                      agent.id === agentId 
                        ? { ...agent, isGeneratingDialogue: false, state: 'PAUSING' as const }
                        : agent
                    ));
                    console.error('Failed to generate dialogue:', error);
                  });
                }
                
                return updatedAgents;
              });
            }}
          />
        </div>
      ) : (
        /* --- DIRECTOR MAP INTERFACE --- */
        /* Replaced CSS opacity transition with conditional rendering to fix black screen bug */
        <div className="w-full h-full relative flex flex-col animate-in fade-in zoom-in-95 duration-1000">
          
          {/* SVG VISUALIZATION BACKDROP */}
          {isInitialized && (
            <div className="absolute inset-0 z-0">
               <SvgHotelBackdrop 
                  atmosphere={coreState.activeAtmosphere}
                  enabled={true}
                  rooms={rooms}
                  agents={agents}
                  gridW={GRID_WIDTH}
                  gridH={GRID_HEIGHT}
               />
            </div>
          )}

          {/* HEADER HUD */}
          <header className="absolute top-0 left-0 right-0 h-24 px-10 flex items-center justify-between z-40 bg-gradient-to-b from-slate-950 via-slate-950/80 to-transparent pointer-events-none">
             <div className="flex items-center gap-5 pointer-events-auto">
                <div className="p-3 bg-cyan-500/10 rounded-xl border border-cyan-500/20"><Layers size={18} className="text-cyan-400"/></div>
                <div>
                    <h1 className="text-[11px] font-bold tracking-[0.4em] uppercase text-slate-100">SeedCore Director</h1>
                    <div className="text-[8px] text-cyan-500/40 font-mono tracking-widest uppercase mt-1">Plane: Topological • Grid: 80x44</div>
                </div>
             </div>

             <div className="flex items-center gap-6 pointer-events-auto">
                <button 
                  onClick={() => setIsAiEnabled(!isAiEnabled)}
                  className={`flex items-center gap-3 px-6 py-2.5 rounded-full border transition-all duration-500 ${
                    isAiEnabled 
                      ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.2)]' 
                      : 'bg-slate-900/50 border-slate-800 text-slate-600 hover:text-slate-400'
                  }`}
                >
                  <Power size={12} className={isAiEnabled ? "animate-pulse" : ""} />
                  <span className="text-[9px] font-bold uppercase tracking-[0.2em]">{isAiEnabled ? 'Core Live' : 'Core Standby'}</span>
                </button>

                <button 
                  onClick={() => setInLobby(true)} 
                  className="px-8 py-2.5 bg-white text-black rounded-full text-[9px] font-bold uppercase tracking-[0.2em] transition-all hover:bg-cyan-400 shadow-xl"
                >
                  FPV Mode
                </button>
             </div>
          </header>

          {/* HUD SIDEBARS */}
          <SensoryTelemetryPanel active={isAiEnabled} />
          
          {/* REPLACED OPERATIONS PANEL WITH CONCIERGE PANEL */}
          <ConciergePanel active={isAiEnabled} />

          {/* FOOTER INSPECTOR */}
          {selectedRoom && (
             <div className="absolute bottom-12 left-1/2 -translate-x-1/2 w-[400px] bg-slate-950/60 backdrop-blur-2xl border border-cyan-500/30 p-6 rounded-2xl shadow-[0_0_60px_rgba(0,0,0,0.8)] z-40 animate-in slide-in-from-bottom-8 duration-500">
                <div className="flex justify-between items-center mb-5">
                   <div className="flex flex-col">
                     <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-white">{selectedRoom.name}</h3>
                     <span className="text-[8px] font-mono text-cyan-500/50 uppercase tracking-widest">Room Type: {selectedRoom.type}</span>
                   </div>
                   <button onClick={() => setSelectedRoom(null)} className="p-2 hover:bg-white/10 rounded-full transition-all"><X size={16} className="text-slate-500" /></button>
                </div>
                <div className="grid grid-cols-2 gap-6 mb-8">
                    <div className="p-3 bg-white/5 rounded-lg border border-white/5">
                        <span className="text-[8px] uppercase font-mono text-slate-500 block mb-1">Status</span>
                        <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-widest">Operational</span>
                    </div>
                    <div className="p-3 bg-white/5 rounded-lg border border-white/5">
                        <span className="text-[8px] uppercase font-mono text-slate-500 block mb-1">Grid Lock</span>
                        <span className="text-[10px] font-mono text-cyan-300 uppercase tracking-widest">{selectedRoom.topLeft.x},{selectedRoom.topLeft.y}</span>
                    </div>
                </div>
                <button 
                    onClick={() => requestShot(`Holographic verification of ${selectedRoom.name}`)}
                    disabled={!isAiEnabled}
                    className={`w-full py-4 font-bold uppercase text-[9px] tracking-[0.3em] rounded-xl flex items-center justify-center gap-3 transition-all ${
                      isAiEnabled ? 'bg-cyan-500 hover:bg-cyan-400 text-black shadow-lg shadow-cyan-500/20' : 'bg-slate-900 text-slate-600 cursor-not-allowed border border-slate-800'
                    }`}
                >
                    <Film size={14} /> {isAiEnabled ? 'Request Neural Feed' : 'Core Offline'}
                </button>
             </div>
          )}
        </div>
      )}

      {/* VIDEO MODAL */}
      {(videoUrl || isVideoLoading) && (
        <div className="absolute inset-0 z-[60] bg-black/90 flex items-center justify-center p-8">
            <div className="relative w-full max-w-4xl aspect-video bg-black border border-slate-800 shadow-2xl flex items-center justify-center rounded-2xl overflow-hidden">
                 {isVideoLoading ? (
                    <div className="flex flex-col items-center gap-4">
                      <Loader2 size={32} className="animate-spin text-cyan-500" />
                      <span className="text-[10px] font-mono text-cyan-500 uppercase tracking-widest">Compiling Scene...</span>
                    </div>
                 ) : <video src={videoUrl!} autoPlay controls loop className="w-full h-full object-cover" />}
                 <button onClick={() => { setVideoUrl(null); setIsVideoLoading(false); }} className="absolute top-6 right-6 p-2 bg-black/50 rounded-full text-white hover:bg-white/20 transition-all"><X size={20}/></button>
            </div>
        </div>
      )}
    </div>
  );
};

export default App;