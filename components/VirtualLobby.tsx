import React, { useState, useEffect } from 'react';
import { geminiService, LobbyTurnResult } from '../services/geminiService';
import { RefreshCw, Map, Power, Cpu, Aperture } from 'lucide-react';
import { SeedCoreState, Room, Agent } from '../types';
import { VirtualRealityLayer } from './VirtualRealityLayer';

interface VirtualLobbyProps {
  onExitLobby: () => void;
  coreState: SeedCoreState;
  updateCoreState: (updates: Partial<SeedCoreState>) => void;
  isAiEnabled: boolean;
  setIsAiEnabled: (val: boolean) => void;
  rooms: Room[];
  agents: Agent[];
  onAgentClick?: (agentId: string) => void;
}

// STRATEGY: Use a High-Res External URL for the default lobby background.
// Using the raw GitHub content URL to ensure the image loads correctly as an image resource.
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

export const VirtualLobby: React.FC<VirtualLobbyProps> = ({ 
  onExitLobby, 
  coreState, 
  updateCoreState,
  isAiEnabled,
  setIsAiEnabled,
  rooms,
  agents,
  onAgentClick
}) => {
  const [history, setHistory] = useState<{ role: string, parts: { text: string }[] }[]>([]);
  const [choices, setChoices] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const [lobbyImage, setLobbyImage] = useState<string | null>(USER_LOBBY_IMAGE);
  const [isVisualLoading, setIsVisualLoading] = useState(false);

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
      
      // FIX: Store the raw extracted text in history, not the JSON blob, to make rendering easier
      const narrativeText = extractNarrative(result);
      
      setHistory(prev => [
        ...prev, 
        { role: 'user', parts: [{ text: userAction }] },
        { role: 'model', parts: [{ text: narrativeText }] } // Store simple text
      ]);

    } catch (e) {
      console.error("Lobby turn failed", e);
    } finally {
      setIsLoading(false);
    }
  };

  const currentNarrative = history.length > 0 ? history[history.length - 1].parts[0].text : "";

  return (
    <div className="w-full h-full relative bg-black font-sans overflow-hidden select-none cursor-default">
      
      {/* --- LAYER 1: STATIC BACKGROUND (Visible only when AI OFF) --- */}
      <div className={`absolute inset-0 z-0 bg-neutral-950 transition-opacity duration-1000 ${isAiEnabled ? 'opacity-0' : 'opacity-100'}`}>
           <div className="relative w-full h-full">
              {/* USAGE: safeImageSrc applied here */}
              <img 
                 src={safeImageSrc(lobbyImage || USER_LOBBY_IMAGE)} 
                 alt="Lobby Visualization" 
                 // UPDATED: Brightness increased from 0.85 to 1.05
                 className={`w-full h-full object-cover transition-all duration-[2000ms] ${isVisualLoading ? 'scale-105 blur-md brightness-50' : 'scale-100 blur-0 brightness-105'}`}
                 onError={(e) => {
                   console.warn("Background image failed load:", lobbyImage);
                   // Fallback to a solid color if even the external URL fails (e.g. strict firewall)
                   e.currentTarget.style.display = 'none';
                 }}
              />
              {/* UPDATED: Reduced gradient opacity from 70/90 to 30/60 */}
              <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60 pointer-events-none" />
              {/* Changed from cyan-900/10 to amber-500/10 for a warmer, inviting tone */}
              <div className="absolute inset-0 bg-amber-500/10 mix-blend-overlay pointer-events-none" />
           </div>
      </div>

      {/* --- LAYER 1.5: VIRTUAL REALITY DIGITAL TWIN (Visible when AI ON) --- */}
      <VirtualRealityLayer 
        atmosphere={coreState.activeAtmosphere} 
        enabled={isAiEnabled} 
        rooms={rooms} 
        agents={agents} 
        // USAGE: safeImageSrc applied here
        backgroundImage={safeImageSrc(lobbyImage || USER_LOBBY_IMAGE)}
        onAgentClick={onAgentClick}
      />

      {/* --- LAYER 2: HUD --- */}
      {!isAiEnabled ? (
         // UPDATED: Reduced backdrop opacity from 40 to 20
         <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/20 backdrop-blur-[2px]">
            <div className="relative z-10 flex flex-col items-center max-w-lg text-center px-6 animate-in fade-in zoom-in duration-1000">
               <div className="w-24 h-24 rounded-full bg-stone-900/90 border border-white/10 flex items-center justify-center mb-8 shadow-[0_0_60px_rgba(0,0,0,0.8)]">
                  <Cpu size={36} className="text-cyan-500/50" />
               </div>
               <h2 className="text-2xl font-bold tracking-[0.5em] uppercase text-white mb-3 drop-shadow-2xl">SeedCore</h2>
               <div className="h-px w-32 bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent mb-6" />
               <p className="text-[10px] text-stone-300 font-mono tracking-[0.2em] leading-relaxed mb-10 uppercase opacity-70">
                  System State: Decoupled <br/>
                  <span className="text-stone-500">Autonomous synthesis on standby</span>
               </p>
               <button 
                 onClick={() => setIsAiEnabled(true)}
                 className="group relative flex items-center gap-4 px-12 py-4 bg-white text-black rounded-full font-bold uppercase text-[10px] tracking-[0.3em] hover:bg-cyan-400 transition-all active:scale-95 shadow-[0_0_40px_rgba(255,255,255,0.1)] hover:shadow-cyan-500/30"
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
              <div className="absolute bottom-36 left-1/2 -translate-x-1/2 max-w-2xl w-full text-center px-10 pointer-events-none">
                 <div className="animate-in fade-in slide-in-from-bottom-4 duration-1000">
                    <span className="text-[13px] italic font-body text-stone-200 leading-relaxed tracking-wide drop-shadow-[0_4px_15px_rgba(0,0,0,0.9)]">
                       {/* SAFE: Direct text access, no JSON parsing here */}
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
                   onClick={generateVisuals} 
                   disabled={isVisualLoading}
                   className="p-3.5 rounded-xl hover:bg-white/10 text-stone-400 hover:text-cyan-400 transition-colors disabled:opacity-30"
                   title="Regenerate Reality"
                 >
                   <RefreshCw size={18} className={isVisualLoading ? "animate-spin" : ""} />
                 </button>

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