import React, { useState, useEffect, useCallback } from 'react';
import { Aperture, Map, Film, X, Activity, Clock, Power, Cpu, AlertTriangle, Layers, Terminal, Loader2, Thermometer, Wind, Lightbulb, Droplets, Sparkles, RefreshCw } from 'lucide-react';
import { geminiService } from './services/geminiService';
import { generateMap, generateAgents, updateAgentsLogic } from './utils/simulationUtils';
import { EntityType, Room, Agent, SeedCoreState, SeedCorePlane } from './types';
import { GRID_WIDTH, GRID_HEIGHT, TICK_RATE_MS } from './constants';
import { DirectorMapLayer } from './components/DirectorMapLayer'; // Updated Import
import { VirtualLobby } from './components/VirtualLobby';
import { ConciergePanel } from './components/ConciergePanel';
import { DIYEraLuxPortal } from './components/DIYEraLayer';

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
  const [activeView, setActiveView] = useState<'LOBBY' | 'MAP' | 'DIY'>('LOBBY');
  const [isAiEnabled, setIsAiEnabled] = useState(false);
  
  const [grid, setGrid] = useState<EntityType[][]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  
  // Interaction State
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [interactingAgentId, setInteractingAgentId] = useState<string | null>(null);

  // Environment State
  const [isAdapting, setIsAdapting] = useState(false);
  const [envMetrics, setEnvMetrics] = useState({
     temperature: 22.4,
     humidity: 45,
     aqi: 12,
     narrative: ""
  });
  
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
    
    // Pass interactingAgentId to freeze logic
    setAgents(prev => updateAgentsLogic(prev || [], grid, interactingAgentId));
    setCoreState(prev => ({ ...prev, timeOfDay: (prev.timeOfDay + 0.05) % 24 }));
  }, [grid, interactingAgentId]);

  useEffect(() => {
    if (!isInitialized) return;
    const interval = setInterval(tick, TICK_RATE_MS);
    return () => clearInterval(interval);
  }, [isInitialized, tick]);

  const handleAdaptiveEnvironment = async () => {
    if (!isAiEnabled || !selectedRoom) return;
    setIsAdapting(true);
    
    try {
        const result = await geminiService.adaptEnvironment(
            selectedRoom.name, 
            coreState.activeAtmosphere, 
            coreState.timeOfDay
        );

        setCoreState(prev => ({ ...prev, activeAtmosphere: result.atmosphere }));
        setEnvMetrics({
            temperature: result.temperature,
            humidity: result.humidity,
            aqi: result.aqi,
            narrative: result.narrative
        });
    } catch (e) {
        console.error("Adaptation Error", e);
    } finally {
        setIsAdapting(false);
    }
  };

  const getLightingStatus = (atmosphere: string) => {
    switch (atmosphere) {
        case 'MORNING_LIGHT': return { text: "Natural 85%", color: "text-amber-200" };
        case 'GOLDEN_HOUR': return { text: "Warm 60%", color: "text-orange-300" };
        case 'EVENING_CHIC': return { text: "Dimmed 40%", color: "text-indigo-300" };
        case 'MIDNIGHT_LOUNGE': return { text: "Deep 20%", color: "text-violet-400" };
        default: return { text: "Standard", color: "text-cyan-200" };
    }
  };

  const lighting = getLightingStatus(coreState.activeAtmosphere);

  return (
    <div className="relative w-screen h-screen bg-[#020617] overflow-hidden text-slate-200 font-system selection:bg-cyan-500/20">
      
      {/* VIRTUAL LOBBY (MAIN SCREEN) */}
      {activeView === 'LOBBY' && (
        <div className="absolute inset-0 z-50 animate-in fade-in duration-700">
           <VirtualLobby 
            onNavigate={(view) => setActiveView(view)}
            coreState={coreState}
            updateCoreState={(updates) => setCoreState(prev => ({ ...prev, ...updates }))}
            isAiEnabled={isAiEnabled}
            setIsAiEnabled={setIsAiEnabled}
            rooms={rooms}
            agents={agents}
            onAgentHover={(id) => setInteractingAgentId(id)}
          />
        </div>
      )}

      {/* DIY ERA LAYER */}
      {activeView === 'DIY' && (
        <div className="absolute inset-0 z-50 animate-in fade-in duration-700">
            <DIYEraLuxPortal 
              onBack={() => setActiveView('LOBBY')} 
              onEnterZone={(id) => console.log("Entered Zone:", id)}
            />
        </div>
      )}

      {/* DIRECTOR MAP INTERFACE */}
      {activeView === 'MAP' && (
        <div className="w-full h-full relative flex flex-col animate-in fade-in zoom-in-95 duration-1000">
          
          {/* DYNAMIC WEBGL MAP BACKDROP (Replaces SVG) */}
          {isInitialized && (
            <div className="absolute inset-0 z-0">
               <DirectorMapLayer 
                  rooms={rooms}
                  agents={agents}
                  selectedRoomId={selectedRoom?.id}
                  onRoomSelect={setSelectedRoom}
               />
            </div>
          )}

          {/* HEADER HUD */}
          <header className="absolute top-0 left-0 right-0 h-24 px-10 flex items-center justify-between z-40 bg-gradient-to-b from-slate-950 via-slate-950/80 to-transparent pointer-events-none">
             <div className="flex items-center gap-5 pointer-events-auto">
                <div className="p-3 bg-cyan-500/10 rounded-xl border border-cyan-500/20"><Layers size={18} className="text-cyan-400"/></div>
                <div>
                    <h1 className="text--[11px] font-bold tracking-[0.4em] uppercase text-slate-100">SeedCore Director</h1>
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
                  onClick={() => setActiveView('LOBBY')} 
                  className="px-8 py-2.5 bg-white text-black rounded-full text-[9px] font-bold uppercase tracking-[0.2em] transition-all hover:bg-cyan-400 shadow-xl"
                >
                  FPV Mode
                </button>
             </div>
          </header>

          {/* HUD SIDEBARS */}
          <SensoryTelemetryPanel active={isAiEnabled} />
          
          <ConciergePanel active={isAiEnabled} />

          {/* FOOTER INSPECTOR */}
          {selectedRoom && (
             <div className="absolute bottom-12 left-1/2 -translate-x-1/2 w-[480px] bg-slate-950/80 backdrop-blur-2xl border border-cyan-500/30 p-6 rounded-2xl shadow-[0_0_60px_rgba(0,0,0,0.8)] z-40 animate-in slide-in-from-bottom-8 duration-500">
                <div className="flex justify-between items-center mb-5 border-b border-white/5 pb-4">
                   <div className="flex flex-col">
                     <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-white">{selectedRoom.name}</h3>
                     <span className="text-[8px] font-mono text-cyan-500/50 uppercase tracking-widest">Type: {selectedRoom.type} • ID: {selectedRoom.id}</span>
                   </div>
                   <button onClick={() => setSelectedRoom(null)} className="p-2 hover:bg-white/10 rounded-full transition-all"><X size={16} className="text-slate-500" /></button>
                </div>
                
                <div className="grid grid-cols-2 gap-3 mb-6">
                    {/* Status */}
                    <div className="p-3 bg-white/5 rounded-lg border border-white/5 flex items-center justify-between">
                        <div>
                           <span className="text-[8px] uppercase font-mono text-slate-500 block mb-1">Status</span>
                           <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-widest">Operational</span>
                        </div>
                        <Activity size={14} className="text-emerald-500/50" />
                    </div>
                    {/* Grid Lock */}
                    <div className="p-3 bg-white/5 rounded-lg border border-white/5 flex items-center justify-between">
                        <div>
                           <span className="text-[8px] uppercase font-mono text-slate-500 block mb-1">Grid Lock</span>
                           <span className="text-[10px] font-mono text-cyan-300 uppercase tracking-widest">{selectedRoom.topLeft.x},{selectedRoom.topLeft.y}</span>
                        </div>
                        <Map size={14} className="text-cyan-500/50" />
                    </div>

                    {/* Temperature */}
                    <div className="p-3 bg-white/5 rounded-lg border border-white/5 flex items-center justify-between">
                        <div>
                            <span className="text-[8px] uppercase font-mono text-slate-500 block mb-1">Temp</span>
                            <span className="text-[10px] font-mono text-amber-300 uppercase tracking-widest">{envMetrics.temperature}°C</span>
                        </div>
                        <Thermometer size={14} className="text-amber-500/50" />
                    </div>

                    {/* Air Quality */}
                    <div className="p-3 bg-white/5 rounded-lg border border-white/5 flex items-center justify-between">
                        <div>
                            <span className="text-[8px] uppercase font-mono text-slate-500 block mb-1">Air Quality</span>
                            <span className="text-[10px] font-mono text-emerald-300 uppercase tracking-widest">AQI {envMetrics.aqi}</span>
                        </div>
                        <Wind size={14} className="text-emerald-500/50" />
                    </div>

                    {/* Lighting */}
                    <div className="p-3 bg-white/5 rounded-lg border border-white/5 flex items-center justify-between">
                        <div>
                            <span className="text-[8px] uppercase font-mono text-slate-500 block mb-1">Lighting</span>
                            <span className={`text-[10px] font-mono ${lighting.color} uppercase tracking-widest`}>{lighting.text}</span>
                        </div>
                        <Lightbulb size={14} className="text-yellow-500/50" />
                    </div>
                    
                    {/* Humidity */}
                    <div className="p-3 bg-white/5 rounded-lg border border-white/5 flex items-center justify-between">
                        <div>
                            <span className="text-[8px] uppercase font-mono text-slate-500 block mb-1">Humidity</span>
                            <span className="text-[10px] font-mono text-blue-300 uppercase tracking-widest">{envMetrics.humidity}%</span>
                        </div>
                        <Droplets size={14} className="text-blue-500/50" />
                    </div>
                </div>

                {envMetrics.narrative && (
                    <div className="mb-4 px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-[9px] font-mono text-emerald-300 animate-in fade-in slide-in-from-bottom-2">
                        <span className="font-bold mr-2">SYS.LOG:</span> {envMetrics.narrative}
                    </div>
                )}

                <button 
                    onClick={handleAdaptiveEnvironment}
                    disabled={!isAiEnabled || isAdapting}
                    className={`w-full py-3 font-bold uppercase text-[9px] tracking-[0.3em] rounded-xl flex items-center justify-center gap-3 transition-all ${
                      isAiEnabled && !isAdapting ? 'bg-cyan-500 hover:bg-cyan-400 text-black shadow-lg shadow-cyan-500/20' : 'bg-slate-900 text-slate-600 cursor-not-allowed border border-slate-800'
                    }`}
                >
                    {isAdapting ? (
                        <>
                           <Loader2 size={14} className="animate-spin" /> Calculating...
                        </>
                    ) : (
                        <>
                           <RefreshCw size={14} /> {isAiEnabled ? 'Adaptive Environment' : 'Core Offline'}
                        </>
                    )}
                </button>
             </div>
          )}
        </div>
      )}
    </div>
  );
};

export default App;