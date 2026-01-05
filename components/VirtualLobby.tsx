import React, { useState, useEffect, useMemo } from 'react';
import { geminiService, LobbyTurnResult } from '../services/geminiService';
import { RefreshCw, Map, Power, Cpu, Aperture, MessageSquare, Zap } from 'lucide-react';
import { SeedCoreState, Room, Agent, AgentRole } from '../types';
import { VirtualRealityLayer } from './VirtualRealityLayer';

interface VirtualLobbyProps {
  onExitLobby: () => void;
  coreState: SeedCoreState;
  updateCoreState: (updates: Partial<SeedCoreState>) => void;
  isAiEnabled: boolean;
  setIsAiEnabled: (val: boolean) => void;
  rooms: Room[];
  agents: Agent[];
  onAgentHover?: (id: string | null) => void;
}

// STRATEGY: Use a High-Res External URL for the default lobby background (static fallback).
const USER_LOBBY_IMAGE = "https://raw.githubusercontent.com/NeilLi/seedcore-hotel-simulator/main/public/images/lobby.png";

// SAFETY: Helper to sanitize image sources.
const safeImageSrc = (src?: string | null) => {
  if (!src) return undefined;
  return src;
};

// ROBUSTNESS: Helper to extract narrative safely without crashing on bad JSON
const extractNarrative = (res: LobbyTurnResult | any): string => {
  if (!res) return "Connection stabilizing...";
  // If it's already parsed
  if (res.responses) {
    const narrator = res.responses.find((r: any) => r.role === 'NARRATOR');
    return narrator?.content || res.responses[0]?.content || '';
  }
  // Fallback for raw text
  return "Processing environmental data...";
};

// --- INTERACTION HUD COMPONENT ---
const AgentInteractionHUD = ({ agentId, agents }: { agentId: string | null, agents: Agent[] }) => {
  const [task, setTask] = useState("");
  
  const agent = useMemo(() => agents.find(a => a.id === agentId), [agentId, agents]);

  // Generate a mock "thought" or task when the agent changes
  useEffect(() => {
    if (!agent) return;
    
    const thoughts = {
       [AgentRole.ROBOT_WAITER]: [
         "Calibrating espresso blend #402", 
         "Analyzing guest hydration levels", 
         "Synchronizing with kitchen grid",
         "Polishing glassware protocol",
         "Awaiting service vector"
       ],
       [AgentRole.ROBOT_CONCIERGE]: [
         "Reviewing VIP arrivals", 
         "Optimizing lobby throughput", 
         "Updating local weather data",
         "Accessing city guide database"
       ],
       [AgentRole.GUEST]: [
         "Admiring the architecture", 
         "Checking flight status", 
         "Looking for the lounge",
         "Resting after travel"
       ]
    };

    const roleThoughts = thoughts[agent.role as AgentRole] || ["Processing..."];
    setTask(roleThoughts[Math.floor(Math.random() * roleThoughts.length)]);
  }, [agent]);

  if (!agentId || !agent) return null;

  return (
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-[60] flex flex-col items-center animate-in fade-in zoom-in-90 duration-300">
       {/* Connecting Line (Visual) */}
       <div className="w-px h-16 bg-gradient-to-t from-cyan-500/0 via-cyan-500/50 to-cyan-500 mb-2" />
       
       <div className="bg-slate-950/80 backdrop-blur-md border border-cyan-500/30 p-4 rounded-xl shadow-[0_0_30px_rgba(34,211,238,0.2)] max-w-xs text-center">
          <div className="flex items-center justify-center gap-2 mb-2 text-cyan-400">
             {agent.role.includes('ROBOT') ? <Zap size={14} className="animate-pulse" /> : <MessageSquare size={14} />}
             <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Neural Link Established</span>
          </div>
          
          <h3 className="text-white font-mono text-sm mb-1">{agent.role.replace('_', ' ')} <span className="text-slate-500 text-[10px]">{agent.id}</span></h3>
          <div className="h-px w-full bg-white/10 my-2" />
          <p className="text-[11px] text-cyan-100 font-mono leading-relaxed">
             "{task}..."
          </p>
          
          <div className="mt-3 flex justify-center gap-1">
             <div className="w-1 h-1 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
             <div className="w-1 h-1 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
             <div className="w-1 h-1 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
       </div>
    </div>
  );
}

export const VirtualLobby: React.FC<VirtualLobbyProps> = ({ 
  onExitLobby, 
  coreState, 
  updateCoreState,
  isAiEnabled,
  setIsAiEnabled,
  rooms,
  agents,
  onAgentHover
}) => {
  const [history, setHistory] = useState<{ role: string, parts: { text: string }[] }[]>([]);
  const [choices, setChoices] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const [lobbyImage, setLobbyImage] = useState<string | null>(USER_LOBBY_IMAGE);
  const [isVisualLoading, setIsVisualLoading] = useState(false);
  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null);

  // FIX: Added history.length dependency to prevent infinite loops or missed inits
  useEffect(() => {
    if (isAiEnabled && history.length === 0) {
      handleTurn("Initialize simulation. Describe the current moment in the lobby.");
    }
  }, [isAiEnabled, history.length]);

  const generateVisuals = async () => {
    if (!isAiEnabled) return;
    setIsVisualLoading(true);
    const img = await geminiService.generateLobbyImage(coreState.activeAtmosphere);
    if (img) setLobbyImage(img);
    setIsVisualLoading(false);
  };

  const handleTurn = async (userAction: string) => {
    if (!isAiEnabled) return;
    setIsLoading(true);
    try {
      const result: LobbyTurnResult = await geminiService.stepLobbySimulation(history, userAction);
      
      if (result.worldStateUpdate) {
        updateCoreState({
           activeAtmosphere: result.worldStateUpdate.atmosphere as any || coreState.activeAtmosphere,
           timeOfDay: result.worldStateUpdate.timeOffset ? coreState.timeOfDay + result.worldStateUpdate.timeOffset : coreState.timeOfDay
        });
      }

      setChoices(result.choices);
      
      const narrativeText = extractNarrative(result);
      
      setHistory(prev => [
        ...prev, 
        { role: 'user', parts: [{ text: userAction }] },
        { role: 'model', parts: [{ text: narrativeText }] }
      ]);

    } catch (e) {
      console.error("Lobby turn failed", e);
    } finally {
      setIsLoading(false);
    }
  };

  const currentNarrative = history.length > 0 ? history[history.length - 1].parts[0].text : "";

  // Handle local hover state + bubble up to parent
  const handleAgentHover = (id: string | null) => {
      setHoveredAgent(id);
      if (onAgentHover) onAgentHover(id);
  };

  return (
    <div className="w-full h-full relative bg-black font-sans overflow-hidden select-none cursor-default">
      
      {/* --- LAYER 1: 3D VIRTUAL REALITY LAYER (Primary Visual) --- */}
      <VirtualRealityLayer 
        atmosphere={coreState.activeAtmosphere} 
        enabled={isAiEnabled} 
        rooms={rooms} 
        agents={agents} 
        backgroundImage={safeImageSrc(lobbyImage || USER_LOBBY_IMAGE)}
        onAgentHover={handleAgentHover}
      />

      {/* --- LAYER 1.5: INTERACTION HUD --- */}
      <AgentInteractionHUD agentId={hoveredAgent} agents={agents} />

      {/* --- LAYER 0: STATIC FALLBACK (Visible only when AI OFF) --- */}
      <div className={`absolute inset-0 z-0 bg-neutral-950 transition-opacity duration-1000 ${isAiEnabled ? 'opacity-0 delay-500' : 'opacity-100'}`}>
           <div className="relative w-full h-full">
              <img 
                 src={safeImageSrc(lobbyImage || USER_LOBBY_IMAGE)} 
                 alt="Lobby Visualization" 
                 className={`w-full h-full object-cover transition-all duration-[2000ms] ${isVisualLoading ? 'scale-105 blur-md brightness-50' : 'scale-100 blur-0 brightness-110'}`}
                 onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
              {/* Reduced Overlay Opacity to make image clearer */}
              <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/40 pointer-events-none" />
              <div className="absolute inset-0 bg-amber-500/5 mix-blend-overlay pointer-events-none" />
           </div>
      </div>

      {/* --- LAYER 2: HUD & UI --- */}
      {!isAiEnabled ? (
         // CHANGED: Removed backdrop-blur-sm and reduced bg-black opacity to allow crystal clear view
         <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/10">
            <div className="relative z-10 flex flex-col items-center max-w-lg text-center px-6 animate-in fade-in zoom-in duration-1000">
               <div className="w-24 h-24 rounded-full bg-stone-900/90 border border-white/10 flex items-center justify-center mb-8 shadow-[0_0_60px_rgba(0,0,0,0.8)] backdrop-blur-md">
                  <Cpu size={36} className="text-cyan-500/50" />
               </div>
               <h2 className="text-2xl font-bold tracking-[0.5em] uppercase text-white mb-3 drop-shadow-2xl">SeedCore</h2>
               <div className="h-px w-32 bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent mb-6" />
               <p className="text-[10px] text-stone-100 font-mono tracking-[0.2em] leading-relaxed mb-10 uppercase opacity-90 drop-shadow-md">
                  System State: Decoupled <br/>
                  <span className="text-stone-300">Autonomous synthesis on standby</span>
               </p>
               <button 
                 onClick={() => setIsAiEnabled(true)}
                 className="group relative flex items-center gap-4 px-12 py-4 bg-white/90 backdrop-blur-sm text-black rounded-full font-bold uppercase text-[10px] tracking-[0.3em] hover:bg-cyan-400 transition-all active:scale-95 shadow-[0_0_40px_rgba(0,0,0,0.3)] hover:shadow-cyan-500/30"
               >
                  <Power size={14} className="group-hover:animate-pulse" />
                  Initialize Intelligence
               </button>
            </div>
         </div>
      ) : (
        <div className="absolute inset-0 z-20 pointer-events-none">
           {/* Top HUD */}
           <div className="absolute top-0 left-0 right-0 p-10 flex justify-between items-start">
              <div className="flex items-center gap-5 pointer-events-auto">
                 <div className="p-3 bg-black/40 backdrop-blur border border-white/5 rounded-full">
                    <Aperture size={20} className="text-cyan-400 animate-[spin_6s_linear_infinite]" />
                 </div>
                 <div>
                    <div className="text-[11px] font-bold tracking-[0.3em] uppercase text-stone-100">Grand Atrium</div>
                    <div className="text-[8px] font-mono text-cyan-500/50 uppercase tracking-[0.2em]">Active Simulation</div>
                 </div>
              </div>

              <div className="flex flex-col items-end gap-3 pointer-events-auto">
                 <div className="flex items-center gap-5 text-[9px] font-mono tracking-[0.2em] text-white/90 uppercase bg-black/50 backdrop-blur-md px-5 py-2.5 rounded-full border border-white/10">
                    <span className="flex items-center gap-2">
                       <div className={`w-1.5 h-1.5 rounded-full ${isLoading ? 'bg-amber-500 animate-pulse' : 'bg-cyan-500 shadow-[0_0_12px_rgba(34,211,238,0.8)]'}`} />
                       {isLoading ? 'SYNCING' : 'CORE LIVE'}
                    </span>
                    <span className="opacity-30">|</span>
                    <span>{Math.floor(coreState.timeOfDay).toString().padStart(2, '0')}:{(coreState.timeOfDay % 1 * 60).toFixed(0).padStart(2,'0')}</span>
                 </div>
                 <button 
                   onClick={() => setIsAiEnabled(false)}
                   className="flex items-center gap-2 px-4 py-2 bg-red-950/30 hover:bg-red-950/50 border border-red-500/20 rounded-full text-[8px] font-bold uppercase tracking-widest text-red-400 transition-all backdrop-blur-sm pointer-events-auto"
                 >
                   <Power size={10} /> Disconnect
                 </button>
              </div>
           </div>

           {/* Narrative Subtitles */}
           {history.length > 0 && !isLoading && (
              <div className="absolute bottom-36 left-1/2 -translate-x-1/2 max-w-2xl w-full text-center px-10">
                 <div className="animate-in fade-in slide-in-from-bottom-4 duration-1000">
                    <span className="text-[13px] italic font-body text-stone-200 leading-relaxed tracking-wide drop-shadow-[0_4px_15px_rgba(0,0,0,0.9)] bg-black/30 backdrop-blur-sm px-6 py-4 rounded-xl border border-white/5">
                       {currentNarrative}
                    </span>
                 </div>
              </div>
           )}

           {/* Action Dock */}
           <div className="absolute bottom-12 left-0 right-0 flex justify-center p-4">
              <div className="flex items-center gap-2 p-2.5 bg-stone-900/90 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] pointer-events-auto">
                 {choices.map((choice, idx) => {
                    if (choice.toLowerCase().includes('director') || choice.toLowerCase().includes('map')) return null;
                    return (
                      <button
                        key={idx}
                        onClick={() => handleTurn(choice)}
                        disabled={isLoading}
                        className="px-6 py-3.5 rounded-xl hover:bg-white/10 text-stone-300 hover:text-white transition-all text-[10px] font-bold uppercase tracking-[0.2em] border border-transparent hover:border-white/5 active:scale-95 disabled:opacity-50"
                      >
                        {choice}
                      </button>
                    );
                 })}

                 {choices.length > 0 && <div className="w-px h-8 bg-white/10 mx-2" />}

                 <button 
                   onClick={onExitLobby}
                   className="px-7 py-3.5 bg-white text-black rounded-xl hover:bg-cyan-50 transition-all text-[10px] font-bold uppercase tracking-[0.2em] shadow-xl active:scale-95 flex items-center gap-3"
                 >
                    <Map size={14} />
                    Director Map
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};