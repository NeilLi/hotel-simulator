import React, { useState } from 'react';
import { ArrowLeft, Sparkles, Shirt, Wand2, Download, Printer, Scissors, Layers, Loader2 } from 'lucide-react';
import { geminiService, WearableDesignResult } from '../../services/geminiService';

const STYLES_LIST = ["Minimalist", "Cyberpunk", "Boho", "Vintage", "Abstract Art", "Streetwear"];
const SIZES_LIST = ["XS", "S", "M", "L", "XL", "XXL"];
const TYPES_LIST = ["T-Shirt", "Hoodie", "Jacket", "Tote Bag"];

interface Props {
  onBack: () => void;
}

export function WearableStoryStudio({ onBack }: Props) {
  const [story, setStory] = useState("");
  const [style, setStyle] = useState(STYLES_LIST[0]);
  const [size, setSize] = useState("M");
  const [type, setType] = useState(TYPES_LIST[0]);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<WearableDesignResult | null>(null);

  const handleGenerate = async () => {
    if (!story.trim()) return;
    setIsGenerating(true);
    setResult(null);

    try {
      const data = await geminiService.designWearable(story, style, type);
      setResult(data);
    } catch (e) {
      console.error(e);
      alert("Failed to generate design. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="w-full h-full bg-[#FAFAFA] text-slate-900 flex flex-col">
      {/* --- HEADER --- */}
      <div className="flex-shrink-0 px-8 py-6 flex items-center justify-between bg-white border-b border-blue-100">
        <div className="flex items-center gap-4">
           <button 
             onClick={onBack}
             className="p-2 rounded-full hover:bg-slate-100 text-slate-500 hover:text-blue-600 transition-colors"
           >
              <ArrowLeft size={20} />
           </button>
           <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                 <Shirt className="text-blue-500" size={24} />
                 Wearable Story Studio
              </h1>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                 Commemorate Moments into Matter
              </p>
           </div>
        </div>
        
        <div className="flex items-center gap-2">
           <div className="px-3 py-1 bg-blue-50 text-blue-600 text-[10px] font-bold uppercase tracking-widest rounded-full border border-blue-100">
              {isGenerating ? "AI Processing..." : "Studio Ready"}
           </div>
        </div>
      </div>

      {/* --- MAIN CONTENT GRID --- */}
      <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12">
         
         {/* LEFT: INPUT PANEL */}
         <div className="lg:col-span-4 p-8 overflow-y-auto bg-[#F8FAFC] border-r border-slate-200">
            <div className="space-y-8 max-w-md mx-auto">
               
               {/* Story Input */}
               <div className="space-y-3">
                  <label className="text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                     <Wand2 size={14} /> The Narrative
                  </label>
                  <textarea
                    value={story}
                    onChange={(e) => setStory(e.target.value)}
                    placeholder="E.g., I traveled to a southeast island with my girlfriend. We watched the sunset turn the ocean purple and gold..."
                    className="w-full h-40 p-4 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none shadow-sm transition-all placeholder:text-slate-300 font-medium"
                  />
                  <p className="text-[10px] text-slate-400 leading-relaxed">
                     Our AI Weaver interprets your memories to generate a unique textile pattern and design concept.
                  </p>
               </div>

               {/* Controls Grid */}
               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                     <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Item Type</label>
                     <select 
                        value={type} onChange={(e) => setType(e.target.value)}
                        className="w-full p-3 rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-700 focus:outline-none focus:border-blue-500 appearance-none"
                     >
                        {TYPES_LIST.map(t => <option key={t} value={t}>{t}</option>)}
                     </select>
                  </div>
                  <div className="space-y-2">
                     <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Aesthetic</label>
                     <select 
                        value={style} onChange={(e) => setStyle(e.target.value)}
                        className="w-full p-3 rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-700 focus:outline-none focus:border-blue-500 appearance-none"
                     >
                        {STYLES_LIST.map(s => <option key={s} value={s}>{s}</option>)}
                     </select>
                  </div>
               </div>

               {/* Size Selector */}
               <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Size / Cut</label>
                  <div className="flex gap-2">
                     {SIZES_LIST.map(s => (
                        <button
                           key={s}
                           onClick={() => setSize(s)}
                           className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all ${
                              size === s 
                              ? 'bg-slate-900 text-white border-slate-900' 
                              : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                           }`}
                        >
                           {s}
                        </button>
                     ))}
                  </div>
               </div>

               <hr className="border-slate-200" />

               {/* Action Button */}
               <button
                  onClick={handleGenerate}
                  disabled={!story.trim() || isGenerating}
                  className="w-full py-5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl font-bold uppercase tracking-widest shadow-xl shadow-blue-200 hover:shadow-blue-300 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
               >
                  {isGenerating ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                  {isGenerating ? "Weaving Reality..." : "Generate Wearable"}
               </button>

            </div>
         </div>

         {/* RIGHT: PREVIEW PANEL */}
         <div className="lg:col-span-8 bg-white relative p-8 flex flex-col items-center justify-center overflow-y-auto">
             {/* Background Pattern */}
             <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
             
             {result ? (
                <div className="w-full max-w-3xl animate-in fade-in slide-in-from-bottom-8 duration-700">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                        
                        {/* Image Result */}
                        <div className="bg-white p-4 rounded-3xl shadow-2xl border border-slate-100 rotate-1 hover:rotate-0 transition-transform duration-500">
                            {result.imageUrl ? (
                               <img src={result.imageUrl} alt="Generated Design" className="w-full aspect-square object-cover rounded-2xl bg-slate-50" />
                            ) : (
                               <div className="w-full aspect-square bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 font-mono text-xs">
                                  Image Generation Failed
                               </div>
                            )}
                        </div>

                        {/* Specs Ticket */}
                        <div className="space-y-6">
                           <div className="bg-[#FFFDF5] p-6 rounded-xl border border-amber-100 shadow-sm relative overflow-hidden">
                              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-amber-500" />
                              
                              <h3 className="font-black text-2xl text-slate-900 mb-1">Production Ticket</h3>
                              <p className="text-[10px] font-mono uppercase tracking-widest text-slate-400 mb-6">#SEEDCORE-MFG-{Math.floor(Math.random()*10000)}</p>

                              <div className="space-y-4">
                                 <div>
                                    <span className="text-[9px] font-bold uppercase text-slate-400 block mb-1">Design Concept</span>
                                    <p className="text-sm font-serif italic text-slate-700 leading-relaxed">
                                       "{result.specs?.designConcept || 'A harmonious blend of memory and textile.'}"
                                    </p>
                                 </div>

                                 <div className="grid grid-cols-2 gap-4">
                                    <div className="p-3 bg-white rounded-lg border border-slate-100">
                                       <div className="flex items-center gap-2 mb-1 text-blue-500"><Layers size={12} /> <span className="text-[9px] font-bold uppercase">Material</span></div>
                                       <span className="text-xs font-bold text-slate-700">{result.specs?.fabricType || 'Cotton'}</span>
                                    </div>
                                    <div className="p-3 bg-white rounded-lg border border-slate-100">
                                       <div className="flex items-center gap-2 mb-1 text-amber-500"><Scissors size={12} /> <span className="text-[9px] font-bold uppercase">Thread</span></div>
                                       <span className="text-xs font-bold text-slate-700">{result.specs?.threadCount || 300} TC</span>
                                    </div>
                                 </div>
                                 
                                 <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                                     <span className="text-[9px] font-bold uppercase text-slate-400 block mb-1">Care Instructions</span>
                                     <span className="text-xs font-mono text-slate-600">{result.specs?.careInstructions || 'Standard Wash'}</span>
                                 </div>
                              </div>
                           </div>

                           <div className="flex gap-3">
                              <button className="flex-1 py-4 bg-slate-900 text-white rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-slate-800 transition-colors flex items-center justify-center gap-2">
                                 <Printer size={16} /> Send to Mfg
                              </button>
                              <button className="px-6 py-4 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors">
                                 <Download size={18} />
                              </button>
                           </div>
                        </div>
                    </div>
                </div>
             ) : (
                <div className="text-center opacity-40">
                   <div className="w-32 h-32 bg-slate-100 rounded-full mx-auto mb-6 flex items-center justify-center border-4 border-slate-50">
                      <Shirt size={48} className="text-slate-300" />
                   </div>
                   <h3 className="text-xl font-bold text-slate-900 uppercase tracking-widest mb-2">Canvas Empty</h3>
                   <p className="max-w-xs mx-auto text-sm text-slate-500 font-medium">
                      Enter your story on the left to begin the fabrication process.
                   </p>
                </div>
             )}
         </div>

      </div>
    </div>
  );
}
