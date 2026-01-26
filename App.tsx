import React, { useState, useEffect, useCallback } from 'react';
import { Aperture, Map, Film, X, Activity, Clock, Power, Cpu, AlertTriangle, Layers, Terminal, Loader2, Thermometer, Wind, Lightbulb, Droplets, Sparkles, RefreshCw, CheckCircle2, ShieldX, ShieldAlert } from 'lucide-react';
import { geminiService } from './services/geminiService';
import { generateMap, generateAgents, updateAgentsLogic } from './utils/simulationUtils';
import { EntityType, Room, Agent, SeedCoreState, SeedCorePlane, Snapshot } from './types';
import { GRID_WIDTH, GRID_HEIGHT, TICK_RATE_MS } from './constants';
import { DirectorMapLayer } from './components/DirectorMapLayer'; // Updated Import
import { VirtualLobby } from './components/VirtualLobby';
import { ConciergePanel } from './components/ConciergePanel';
import { DIYEraLuxPortal } from './components/DIYEraLayer';
import { seedcoreService, type PKGEvaluateResponse } from './services/seedcoreService';
import { wearableStudioService } from './services/wearableStudioService';
import { buildRoomSelectionPKGRequest, type RoomAccessContext } from './services/pkgRequests';

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
  const [isLiveMode, setIsLiveMode] = useState(false); // Controls sensor/concierge panel visibility
  
  const [grid, setGrid] = useState<EntityType[][]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  
  // Interaction State
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [interactingAgentId, setInteractingAgentId] = useState<string | null>(null);
  
  // PKG Evaluation State
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [pkgResponse, setPkgResponse] = useState<PKGEvaluateResponse | null>(null);
  const [pkgLoading, setPkgLoading] = useState(false);
  const [pkgError, setPkgError] = useState<string | null>(null);

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

  // Load active snapshot
  useEffect(() => {
    let alive = true;
    wearableStudioService
      .getActiveSnapshot()
      .then((snap) => {
        if (alive) setSnapshot(snap);
      })
      .catch(() => {
        // silent; UI already handles snapshot unavailable
      });
    return () => {
      alive = false;
    };
  }, []);

  // Evaluate PKG when room is selected
  useEffect(() => {
    if (!selectedRoom) {
      setPkgResponse(null);
      setPkgError(null);
      return;
    }

    setPkgLoading(true);
    setPkgError(null);

    const evaluateRoom = async () => {
      try {
        const pkgReq = buildRoomSelectionPKGRequest(selectedRoom, snapshot);
        const response = await seedcoreService.evaluatePKGAsync(pkgReq);
        setPkgResponse(response);
      } catch (e: any) {
        const msg = e?.message || String(e);
        let userMessage = 'Failed to evaluate room access policy.';
        
        if (msg === 'PKG_NOT_AVAILABLE' || msg === 'SERVER_NOT_RUNNING' || msg === 'SERVER_NOT_INITIALIZED') {
          userMessage = 'Policy evaluation system is unavailable.';
        } else if (msg.includes('POLICY_BLOCKED')) {
          userMessage = `Policy blocked: ${e?.ruleName || msg}`;
        }
        
        setPkgError(userMessage);
        setPkgResponse(null);
      } finally {
        setPkgLoading(false);
      }
    };

    evaluateRoom();
  }, [selectedRoom, snapshot]);

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
                  onClick={() => setIsLiveMode(!isLiveMode)}
                  className={`flex items-center gap-3 px-6 py-2.5 rounded-full border transition-all duration-500 ${
                    isLiveMode 
                      ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.2)]' 
                      : 'bg-slate-900/50 border-slate-800 text-slate-600 hover:text-slate-400'
                  }`}
                >
                  <Power size={12} className={isLiveMode ? "animate-pulse" : ""} />
                  <span className="text-[9px] font-bold uppercase tracking-[0.2em]">{isLiveMode ? 'Core Live' : 'Core Standby'}</span>
                </button>

                <button 
                  onClick={() => setActiveView('LOBBY')} 
                  className="px-8 py-2.5 bg-white text-black rounded-full text-[9px] font-bold uppercase tracking-[0.2em] transition-all hover:bg-cyan-400 shadow-xl"
                >
                  FPV Mode
                </button>
             </div>
          </header>

          {/* HUD SIDEBARS - Controlled by live switch (hidden by default) */}
          {isLiveMode && <SensoryTelemetryPanel active={isLiveMode} />}
          {isLiveMode && <ConciergePanel active={isLiveMode} />}

          {/* FOOTER INSPECTOR */}
          {selectedRoom && (
             <div className="absolute bottom-12 left-1/2 -translate-x-1/2 w-[480px] bg-slate-950/80 backdrop-blur-2xl border border-cyan-500/30 p-6 rounded-2xl shadow-[0_0_60px_rgba(0,0,0,0.8)] z-40 animate-in slide-in-from-bottom-8 duration-500">
                <div className="flex justify-between items-center mb-5 border-b border-white/5 pb-4">
                   <div className="flex flex-col">
                     <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-white">{selectedRoom.name}</h3>
                     <span className="text-[8px] font-mono text-cyan-500/50 uppercase tracking-widest">Type: {selectedRoom.type} • ID: {selectedRoom.id}</span>
                   </div>
                   <div className="flex items-center gap-2">
                     {/* PKG Evaluation Status */}
                     {pkgLoading ? (
                       <div className="px-3 py-1.5 rounded-full text-[10px] font-bold flex items-center gap-1.5 bg-indigo-100 text-indigo-700 border border-indigo-200">
                         <Loader2 size={12} className="animate-spin" />
                         Evaluating...
                       </div>
                     ) : pkgResponse ? (
                       <div className={`px-3 py-1.5 rounded-full text-[10px] font-bold flex items-center gap-1.5 ${
                         pkgResponse.decision?.allowed
                           ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                           : 'bg-rose-100 text-rose-700 border border-rose-200'
                       }`}>
                         {pkgResponse.decision?.allowed ? (
                           <>
                             <CheckCircle2 size={12} />
                             PKG: Allowed
                           </>
                         ) : (
                           <>
                             <ShieldX size={12} />
                             PKG: Blocked
                           </>
                         )}
                       </div>
                     ) : pkgError ? (
                       <div className="px-3 py-1.5 rounded-full text-[10px] font-bold flex items-center gap-1.5 bg-amber-100 text-amber-700 border border-amber-200">
                         <ShieldAlert size={12} />
                         Error
                       </div>
                     ) : null}
                     <button onClick={() => setSelectedRoom(null)} className="p-2 hover:bg-white/10 rounded-full transition-all"><X size={16} className="text-slate-500" /></button>
                   </div>
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

                {/* PKG Evaluation Details - Enhanced */}
                {pkgResponse && (
                    <div className={`mb-4 rounded-lg text-[9px] font-mono animate-in fade-in slide-in-from-bottom-2 border overflow-hidden ${
                      pkgResponse.decision?.allowed
                        ? 'bg-emerald-500/10 border-emerald-500/20'
                        : 'bg-rose-500/10 border-rose-500/20'
                    }`}>
                        {/* Header */}
                        <div className="px-3 py-2 border-b border-white/10">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    {pkgResponse.decision?.allowed ? (
                                        <CheckCircle2 size={12} className="text-emerald-400" />
                                    ) : (
                                        <ShieldX size={12} className="text-rose-400" />
                                    )}
                                    <span className={`font-bold uppercase ${pkgResponse.decision?.allowed ? 'text-emerald-300' : 'text-rose-300'}`}>
                                        PKG Policy: {pkgResponse.decision?.allowed ? 'ALLOWED' : 'BLOCKED'}
                                    </span>
                                </div>
                                {pkgResponse.meta && (
                                    <div className="text-[8px] opacity-60 font-mono">
                                        {(pkgResponse.meta as any).duration_ms && `${((pkgResponse.meta as any).duration_ms as number).toFixed(1)}ms`}
                                        {(pkgResponse.meta as any).engine && ` • ${(pkgResponse.meta as any).engine.toUpperCase()}`}
                                    </div>
                                )}
                            </div>
                            {pkgResponse.decision?.reason && (
                                <div className={`mt-2 text-[8px] ${pkgResponse.decision?.allowed ? 'text-emerald-200' : 'text-rose-200'} opacity-90`}>
                                    {pkgResponse.decision.reason}
                                </div>
                            )}
                        </div>

                        {/* Evaluation Metrics */}
                        {(pkgResponse.meta || pkgResponse.provenance?.rules) && (
                            <div className="px-3 py-2 bg-black/20 border-b border-white/5">
                                <div className="grid grid-cols-2 gap-2 text-[8px]">
                                    {(pkgResponse.meta as any)?.rules_matched !== undefined && (
                                        <div className="flex items-center gap-1.5">
                                            <span className="opacity-60">Rules Matched:</span>
                                            <span className="font-bold text-cyan-300">{(pkgResponse.meta as any).rules_matched}</span>
                                        </div>
                                    )}
                                    {pkgResponse.emissions?.subtasks && (
                                        <div className="flex items-center gap-1.5">
                                            <span className="opacity-60">Subtasks:</span>
                                            <span className="font-bold text-cyan-300">{pkgResponse.emissions.subtasks.length}</span>
                                        </div>
                                    )}
                                    {(pkgResponse.meta as any)?.snapshot && (
                                        <div className="flex items-center gap-1.5 col-span-2">
                                            <span className="opacity-60">Snapshot:</span>
                                            <span className="font-mono text-[7px] text-cyan-400 truncate">{(pkgResponse.meta as any).snapshot}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Matched Rules */}
                        {pkgResponse.provenance?.rules && pkgResponse.provenance.rules.length > 0 && (
                            <div className="px-3 py-2 border-b border-white/5">
                                <div className="text-[8px] opacity-60 uppercase mb-1.5 font-bold">Matched Rules ({pkgResponse.provenance.rules.length}):</div>
                                <div className="flex flex-wrap gap-1">
                                    {pkgResponse.provenance.rules.map((rule: any, idx: number) => (
                                        <span 
                                            key={idx} 
                                            className="px-2 py-0.5 bg-white/10 rounded text-[8px] font-mono border border-white/10 hover:bg-white/15 transition-colors"
                                            title={rule.rule_id || rule.id || ''}
                                        >
                                            {rule.ruleName || rule.name || rule.rule_name || `Rule ${idx + 1}`}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Generated Subtasks/Emissions */}
                        {pkgResponse.emissions?.subtasks && pkgResponse.emissions.subtasks.length > 0 && (
                            <div className="px-3 py-2">
                                <div className="text-[8px] opacity-60 uppercase mb-1.5 font-bold">Generated Subtasks ({pkgResponse.emissions.subtasks.length}):</div>
                                <div className="space-y-1.5">
                                    {pkgResponse.emissions.subtasks.map((subtask: any, idx: number) => (
                                        <div 
                                            key={idx} 
                                            className="px-2 py-1.5 bg-white/5 rounded border border-white/10 text-[8px]"
                                        >
                                            <div className="flex items-start justify-between gap-2 mb-1">
                                                <div className="flex items-center gap-1.5">
                                                    <Sparkles size={10} className="text-cyan-400 flex-shrink-0" />
                                                    <span className="font-bold text-cyan-300">
                                                        {subtask.name || subtask.type || subtask.subtask_type || `Subtask ${idx + 1}`}
                                                    </span>
                                                </div>
                                                {subtask.rule_name && (
                                                    <span className="text-[7px] opacity-60 font-mono px-1 py-0.5 bg-white/5 rounded">
                                                        {subtask.rule_name}
                                                    </span>
                                                )}
                                            </div>
                                            {subtask.params && Object.keys(subtask.params).length > 0 && (
                                                <div className="mt-1 pl-3.5 text-[7px] opacity-70 font-mono">
                                                    <div className="opacity-50 mb-0.5">Params:</div>
                                                    {Object.entries(subtask.params).slice(0, 3).map(([key, value]: [string, any]) => (
                                                        <div key={key} className="flex gap-1">
                                                            <span className="opacity-60">{key}:</span>
                                                            <span className="text-cyan-200">
                                                                {typeof value === 'object' ? JSON.stringify(value).slice(0, 30) + '...' : String(value).slice(0, 40)}
                                                            </span>
                                                        </div>
                                                    ))}
                                                    {Object.keys(subtask.params).length > 3 && (
                                                        <div className="opacity-50 text-[6px] mt-0.5">
                                                            +{Object.keys(subtask.params).length - 3} more
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Governed Facts Info */}
                        {pkgResponse.provenance?.governed_facts && (
                            <div className="px-3 py-2 bg-black/20 border-t border-white/5">
                                <div className="text-[8px] opacity-60 uppercase mb-1">
                                    Governed Facts: <span className="text-cyan-300 font-bold">
                                        {Array.isArray(pkgResponse.provenance.governed_facts) 
                                            ? pkgResponse.provenance.governed_facts.length 
                                            : Object.keys(pkgResponse.provenance.governed_facts || {}).length}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {pkgError && (
                    <div className="mb-4 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg text-[9px] font-mono text-amber-300 animate-in fade-in slide-in-from-bottom-2">
                        <span className="font-bold mr-2">PKG ERROR:</span> {pkgError}
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