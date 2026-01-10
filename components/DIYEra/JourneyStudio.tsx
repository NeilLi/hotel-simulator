import React, { useState, useRef } from 'react';
import { ArrowLeft, Compass, Video, Upload, Play, Film, Loader2, Sparkles, Map } from 'lucide-react';
import { geminiService } from '../../services/geminiService';

interface Props {
  onBack: () => void;
}

export function JourneyStudio({ onBack }: Props) {
  const [story, setStory] = useState("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [enrichmentStatus, setEnrichmentStatus] = useState<"IDLE" | "ENRICHING" | "DONE">("IDLE");
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      if (typeof event.target?.result === 'string') {
        setSelectedImage(event.target.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleGenerate = async () => {
    if (!story.trim() || !selectedImage) return;

    setIsGeneratingVideo(true);
    setVideoUrl(null);
    setErrorMsg(null);
    setEnrichmentStatus("ENRICHING");

    try {
      // 1. Backend Service Call (Simulated): Enrich Context
      const richPrompt = await geminiService.constructJourneyContext(story);
      setEnrichmentStatus("DONE");

      // 2. Call Veo Video Generation
      const result = await geminiService.generateJourneyVideo(richPrompt, selectedImage);

      if (result.url) {
        setVideoUrl(result.url);
      } else {
        setErrorMsg(result.message || "Video generation failed.");
      }
    } catch (e) {
      console.error(e);
      setErrorMsg("An unexpected error occurred during the journey.");
    } finally {
      setIsGeneratingVideo(false);
    }
  };

  return (
    <div className="w-full h-full bg-[#FAFAFA] text-slate-900 flex flex-col font-sans">
      
      {/* HEADER */}
      <div className="flex-shrink-0 px-8 py-6 flex items-center justify-between bg-white border-b border-indigo-100 sticky top-0 z-20">
        <div className="flex items-center gap-4">
           <button 
             onClick={onBack}
             className="p-2 rounded-full hover:bg-slate-100 text-slate-500 hover:text-indigo-600 transition-colors"
           >
              <ArrowLeft size={20} />
           </button>
           <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                 <Compass className="text-indigo-600" size={24} />
                 Journey Studio
              </h1>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                 Direct Your Travel Story
              </p>
           </div>
        </div>
        
        <div className="flex items-center gap-2">
           <div className="px-3 py-1 bg-indigo-50 text-indigo-600 text-[10px] font-bold uppercase tracking-widest rounded-full border border-indigo-100">
              Veo Powered
           </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12">
         
         {/* LEFT: DIRECTOR'S CONSOLE */}
         <div className="lg:col-span-5 p-8 overflow-y-auto bg-slate-50 border-r border-slate-200">
            <div className="max-w-md mx-auto space-y-8">
               
               {/* Step 1: Narrative */}
               <div className="space-y-3">
                  <label className="text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                     <Map size={14} /> 1. The Narrative
                  </label>
                  <textarea
                    value={story}
                    onChange={(e) => setStory(e.target.value)}
                    placeholder="Describe your journey... E.g., 'Walking through the neon markets of Neo-Tokyo at midnight, rain glistening on the pavement...'"
                    className="w-full h-32 p-4 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none shadow-sm transition-all placeholder:text-slate-300 font-medium leading-relaxed"
                  />
               </div>

               {/* Step 2: Visual Anchor */}
               <div className="space-y-3">
                  <label className="text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                     <Upload size={14} /> 2. Visual Context
                  </label>
                  
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className={`
                      w-full h-48 rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all relative overflow-hidden group
                      ${selectedImage ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 bg-white hover:border-indigo-400 hover:bg-slate-50'}
                    `}
                  >
                     {selectedImage ? (
                        <img src={selectedImage} alt="Preview" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                     ) : (
                        <div className="text-center p-6">
                           <div className="w-12 h-12 bg-indigo-100 text-indigo-500 rounded-full flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                              <Upload size={20} />
                           </div>
                           <p className="text-xs font-bold text-slate-600">Upload Reference Photo</p>
                           <p className="text-[10px] text-slate-400 mt-1">Starting frame for the video</p>
                        </div>
                     )}
                     
                     <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors" />
                  </div>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleImageUpload} 
                    accept="image/*" 
                    className="hidden" 
                  />
               </div>

               <hr className="border-slate-200" />

               {/* Action */}
               <div className="space-y-4">
                  <button
                     onClick={handleGenerate}
                     disabled={!story.trim() || !selectedImage || isGeneratingVideo}
                     className="w-full py-5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-2xl font-bold uppercase tracking-widest shadow-xl shadow-indigo-200 hover:shadow-indigo-300 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                  >
                     {isGeneratingVideo ? <Loader2 size={18} className="animate-spin" /> : <Video size={18} />}
                     {isGeneratingVideo ? "Directing Scene..." : "Generate Journey Video"}
                  </button>
                  
                  {isGeneratingVideo && (
                     <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 flex items-center gap-3">
                        <Sparkles size={14} className="text-indigo-500 animate-pulse" />
                        <span className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">
                           {enrichmentStatus === "ENRICHING" ? "Enriching Narrative Context..." : "Synthesizing Video Frames..."}
                        </span>
                     </div>
                  )}

                  {errorMsg && (
                    <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-xs text-red-600 font-medium">
                       {errorMsg}
                    </div>
                  )}
               </div>

            </div>
         </div>

         {/* RIGHT: CINEMA SCREEN */}
         <div className="lg:col-span-7 bg-black relative flex items-center justify-center p-8 lg:p-12">
             <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20" />
             
             <div className="relative w-full max-w-4xl aspect-video bg-neutral-900 rounded-2xl border border-white/10 shadow-2xl overflow-hidden flex items-center justify-center group">
                {videoUrl ? (
                   <video src={videoUrl} controls autoPlay loop className="w-full h-full object-cover" />
                ) : (
                   <div className="text-center opacity-30 group-hover:opacity-40 transition-opacity">
                      <Film size={64} className="mx-auto mb-4 text-white" />
                      <p className="text-sm font-mono text-white tracking-widest uppercase">Cinema Screen Standby</p>
                   </div>
                )}
                
                {/* Overlay UI elements for "Camera" look */}
                <div className="absolute top-4 left-4 w-8 h-8 border-l-2 border-t-2 border-white/20" />
                <div className="absolute top-4 right-4 w-8 h-8 border-r-2 border-t-2 border-white/20" />
                <div className="absolute bottom-4 left-4 w-8 h-8 border-l-2 border-b-2 border-white/20" />
                <div className="absolute bottom-4 right-4 w-8 h-8 border-r-2 border-b-2 border-white/20" />
                
                {isGeneratingVideo && (
                   <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-10">
                      <div className="text-center">
                         <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                         <p className="text-xs font-bold uppercase tracking-widest text-indigo-400 animate-pulse">Rendering...</p>
                      </div>
                   </div>
                )}
             </div>
         </div>

      </div>
    </div>
  );
}
