import React, { useState } from 'react';
import { ArrowLeft, Sparkles, Wand2, Zap, Printer, CheckCircle, MessageCircle, Bot } from 'lucide-react';
import { geminiService, ToyDesignResult } from '../../services/geminiService';

const TOY_TEMPLATES = [
  { 
      id: 'ROBOT_DOG', 
      name: 'Mechanical Bionic Experimental Toy Robot Dog', 
      shortName: 'Bionic Dog',
      desc: 'An intelligent programmable pup. Great for voice commands!',
      icon: '🐕'
  },
  { 
      id: 'DRONE_BUDDY', 
      name: 'Levitating Helper Bot', 
      shortName: 'Floaty',
      desc: 'A friendly drone that follows you around.',
      icon: '🛸'
  },
  { 
      id: 'MECH_CAT', 
      name: 'Solar-Powered Cyber Kitty', 
      shortName: 'Cyber Cat',
      desc: 'Purrs when it detects sunlight. Very sleepy.',
      icon: '😺'
  }
];

interface Props {
  onBack: () => void;
}

export function MagicAtelier({ onBack }: Props) {
  const [step, setStep] = useState<'SELECT' | 'DREAM' | 'REVEAL'>('SELECT');
  const [selectedTemplate, setSelectedTemplate] = useState(TOY_TEMPLATES[0]);
  const [wish, setWish] = useState("");
  const [isMagicHappening, setIsMagicHappening] = useState(false);
  const [result, setResult] = useState<ToyDesignResult | null>(null);

  const handleCastSpell = async () => {
    if (!wish.trim()) return;
    setIsMagicHappening(true);
    try {
       const data = await geminiService.designToy(selectedTemplate.name, wish);
       setResult(data);
       setStep('REVEAL');
    } catch (e) {
       alert("The magic fizzled out! Try again.");
    } finally {
       setIsMagicHappening(false);
    }
  };

  const handleReset = () => {
      setStep('SELECT');
      setWish("");
      setResult(null);
  };

  return (
    <div className="w-full h-full bg-[#FFF0F5] text-rose-900 flex flex-col font-sans">
      
      {/* HEADER */}
      <div className="px-6 py-4 bg-white/80 backdrop-blur-md border-b border-rose-200 flex items-center justify-between sticky top-0 z-20 shadow-sm">
         <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2 rounded-full bg-rose-100 hover:bg-rose-200 text-rose-600 transition-colors">
               <ArrowLeft size={20} />
            </button>
            <div className="flex items-center gap-2">
                <div className="p-1.5 bg-gradient-to-br from-rose-400 to-purple-500 rounded-lg text-white shadow-lg">
                    <Sparkles size={18} />
                </div>
                <div>
                    <h1 className="text-xl font-black tracking-tight text-rose-950">Magic Atelier</h1>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-rose-400">Kids Creative Zone</p>
                </div>
            </div>
         </div>
         <div className="hidden md:block px-3 py-1 bg-rose-100 rounded-full text-[10px] font-bold uppercase tracking-widest text-rose-600">
            Powered by Wonder-Tech™
         </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-8">
         <div className="max-w-5xl mx-auto">
            
            {/* STEP 1: SELECT */}
            {step === 'SELECT' && (
               <div className="animate-in fade-in slide-in-from-bottom-8 duration-500">
                  <h2 className="text-3xl font-black text-center mb-2 text-rose-950">Choose Your Buddy</h2>
                  <p className="text-center text-rose-600 mb-8 font-medium">Which toy do you want to bring to life today?</p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                     {TOY_TEMPLATES.map((t) => (
                        <button 
                           key={t.id}
                           onClick={() => { setSelectedTemplate(t); setStep('DREAM'); }}
                           className="group relative bg-white rounded-3xl p-6 border-2 border-rose-100 hover:border-rose-400 hover:shadow-xl hover:shadow-rose-200 hover:-translate-y-1 transition-all text-left"
                        >
                           <div className="text-6xl mb-4 group-hover:scale-110 transition-transform">{t.icon}</div>
                           <h3 className="text-xl font-bold text-rose-900 mb-2 leading-tight">{t.shortName}</h3>
                           <p className="text-sm text-rose-500 font-medium leading-relaxed">{t.desc}</p>
                           <div className="mt-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-purple-500">
                              <span>Select</span> <ArrowLeft size={12} className="rotate-180" />
                           </div>
                        </button>
                     ))}
                  </div>
               </div>
            )}

            {/* STEP 2: DREAM (INPUT) */}
            {step === 'DREAM' && (
               <div className="flex flex-col items-center max-w-2xl mx-auto animate-in fade-in zoom-in-95 duration-500">
                  <div className="w-full bg-white rounded-[2rem] p-8 shadow-2xl shadow-rose-200 border border-rose-100 relative overflow-hidden">
                     {/* Decorative Blob */}
                     <div className="absolute -top-20 -right-20 w-60 h-60 bg-gradient-to-br from-rose-200 to-purple-200 rounded-full blur-3xl opacity-50" />
                     
                     <button onClick={() => setStep('SELECT')} className="absolute top-8 left-8 text-rose-400 hover:text-rose-600 font-bold text-xs uppercase tracking-widest">
                        &larr; Back
                     </button>

                     <div className="mt-8 text-center">
                        <div className="text-6xl mb-4">{selectedTemplate.icon}</div>
                        <h2 className="text-3xl font-black text-rose-950 mb-6">Customize {selectedTemplate.shortName}</h2>
                        
                        <div className="bg-rose-50 rounded-2xl p-6 mb-6 text-left border border-rose-100">
                           <label className="flex items-center gap-2 text-sm font-bold text-rose-800 uppercase tracking-wide mb-3">
                              <MessageCircle size={16} /> What is your wish?
                           </label>
                           <textarea
                              value={wish}
                              onChange={(e) => setWish(e.target.value)}
                              placeholder="I want it to have wings and fly to the moon! Also paint it gold..."
                              className="w-full h-32 bg-white border-2 border-rose-200 rounded-xl p-4 text-lg font-medium text-rose-900 placeholder:text-rose-300 focus:outline-none focus:border-purple-400 focus:ring-4 focus:ring-purple-100 transition-all resize-none"
                           />
                        </div>

                        <button 
                           onClick={handleCastSpell}
                           disabled={!wish.trim() || isMagicHappening}
                           className="w-full py-5 rounded-2xl bg-gradient-to-r from-rose-500 to-purple-600 text-white font-black text-lg uppercase tracking-widest shadow-lg shadow-purple-200 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                        >
                           {isMagicHappening ? (
                              <>
                                 <Wand2 className="animate-spin" /> Casting Spell...
                              </>
                           ) : (
                              <>
                                 <Sparkles className="animate-pulse" /> Make it Magic!
                              </>
                           )}
                        </button>
                     </div>
                  </div>
               </div>
            )}

            {/* STEP 3: REVEAL */}
            {step === 'REVEAL' && result && (
               <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start animate-in slide-in-from-bottom-12 duration-700">
                  
                  {/* Left: Visual */}
                  <div className="bg-white p-4 rounded-[2rem] shadow-2xl shadow-rose-200/50 border border-rose-100 rotate-1">
                     <div className="aspect-square rounded-[1.5rem] overflow-hidden bg-rose-50 relative">
                        {result.imageUrl ? (
                           <img src={result.imageUrl} alt="Generated Toy" className="w-full h-full object-cover" />
                        ) : (
                           <div className="w-full h-full flex items-center justify-center text-rose-300">Image Failed</div>
                        )}
                        <div className="absolute bottom-4 right-4 bg-white/90 backdrop-blur px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest text-rose-600 shadow-sm">
                           AI Generated
                        </div>
                     </div>
                  </div>

                  {/* Right: The "Soul" */}
                  <div className="space-y-6">
                     <div className="bg-white rounded-[2rem] p-8 shadow-xl border border-rose-100">
                        <div className="flex items-center gap-3 mb-6">
                           <div className="p-3 bg-purple-100 text-purple-600 rounded-xl">
                              <Bot size={24} />
                           </div>
                           <div>
                              <h2 className="text-2xl font-black text-rose-950">{result.blueprint?.name}</h2>
                              <p className="text-xs font-bold uppercase tracking-widest text-purple-500">Identity Chip Created</p>
                           </div>
                        </div>

                        <div className="space-y-4 mb-8">
                           <div className="p-4 bg-rose-50 rounded-2xl">
                              <span className="text-[10px] font-bold uppercase text-rose-400 block mb-1">Superpower</span>
                              <p className="font-bold text-rose-800 text-lg">{result.blueprint?.superpower}</p>
                           </div>
                           <div className="p-4 bg-blue-50 rounded-2xl">
                              <span className="text-[10px] font-bold uppercase text-blue-400 block mb-1">Personality</span>
                              <p className="font-medium text-blue-900 leading-relaxed">"{result.blueprint?.personality}"</p>
                           </div>
                        </div>

                        <div className="border-t-2 border-dashed border-rose-100 pt-6">
                           <h3 className="font-bold text-rose-900 flex items-center gap-2 mb-4">
                              <Printer size={18} /> 3D Printer Queue
                           </h3>
                           <ul className="space-y-3">
                              {result.blueprint?.accessoryList?.map((acc, i) => (
                                 <li key={i} className="flex items-center gap-3 text-sm font-medium text-rose-700 bg-rose-50/50 p-2 rounded-lg">
                                    <CheckCircle size={16} className="text-green-500" />
                                    {acc}
                                 </li>
                              ))}
                           </ul>
                        </div>
                     </div>

                     <div className="flex gap-4">
                        <button onClick={handleReset} className="flex-1 py-4 bg-white border-2 border-rose-200 text-rose-600 font-bold rounded-2xl hover:bg-rose-50 transition-colors uppercase tracking-widest text-xs">
                           Design Another
                        </button>
                        <button className="flex-1 py-4 bg-purple-600 text-white font-bold rounded-2xl hover:bg-purple-700 transition-colors uppercase tracking-widest text-xs shadow-lg shadow-purple-200">
                           Print Accessories
                        </button>
                     </div>
                  </div>

               </div>
            )}

         </div>
      </div>
    </div>
  );
}
