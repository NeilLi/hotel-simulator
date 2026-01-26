import React, { useState, useEffect } from 'react';
import { ArrowLeft, Sparkles, Wand2, Zap, Printer, CheckCircle, MessageCircle, Bot, ShieldAlert, ShieldCheck, ShieldX, Save, Play, Star, Heart } from 'lucide-react';
import { geminiService, ToyDesignResult } from '../../services/geminiService';
import { wearableStudioService } from '../../services/wearableStudioService';
import type { PolicyDecision } from '../../services/wearableStudioTypes';

type Template = {
  id: string;
  name: string;
  shortName: string;
  desc: string;
  icon: string;
  media?: { type: "image" | "gif"; src: string };
  badge?: string;
};

const TOY_TEMPLATES: Template[] = [
  { 
      id: 'ROBOT_DOG', 
      name: 'Mechanical Bionic Experimental Toy Robot Dog', 
      shortName: 'Bionic Dog',
      desc: 'An intelligent programmable pup. Great for voice commands!',
      icon: '🐕',
      media: { type: "image", src: "/assets/dog.png" }
  },
  { 
      id: 'DRONE_BUDDY', 
      name: 'Levitating Helper Bot', 
      shortName: 'Bionic Cat',
      desc: 'A friendly drone that follows you around.',
      icon: '🛸',
      media: { type: "image", src: "/assets/cat.png" }
  },
  { 
      id: 'REACHY_MINI', 
      name: 'Reachy Mini', 
      shortName: 'Reachy Mini',
      desc: 'A cute concierge buddy kit — build your own hotel companion.',
      icon: '🤖',
      badge: 'New • Hotel Edition',
      media: { type: "gif", src: "/assets/reachy/reachy_mini_demo.gif" }
  }
];

type BuddyRole = "Concierge" | "Guide" | "Dining" | "Housekeeping" | "Planner";

interface BuddyIdentity {
  name: string;
  role: BuddyRole;
  energy: number; // 0-100: Calm ↔ Hyper
  humor: number; // 0-100: Serious ↔ Funny
  warmth: number; // 0-100: Cool ↔ Sweet
  catchphrase: string;
  hotelSkills: {
    orderTowels: boolean;
    roomService: boolean;
    guideAmenities: boolean;
    wakeUpReminder: boolean;
    kidsMode: boolean;
  };
}

const DEFAULT_SKILLS = {
  orderTowels: true,
  roomService: true,
  guideAmenities: true,
  wakeUpReminder: false,
  kidsMode: false,
};

const DEFAULT_BUDDY_CONFIGS: Record<string, BuddyIdentity> = {
  ROBOT_DOG: {
    name: "Rover",
    role: "Housekeeping",
    energy: 80,
    humor: 50,
    warmth: 90,
    catchphrase: "Woof! I've got your back!",
    hotelSkills: { ...DEFAULT_SKILLS, wakeUpReminder: true },
  },
  DRONE_BUDDY: {
    name: "Bionic Cat",
    role: "Guide",
    energy: 55,
    humor: 35,
    warmth: 60,
    catchphrase: "Scanning… ready to assist.",
    hotelSkills: { ...DEFAULT_SKILLS, kidsMode: false },
  },
  REACHY_MINI: {
    name: "Mimi",
    role: "Concierge",
    energy: 65,
    humor: 70,
    warmth: 80,
    catchphrase: "Welcome home! Let's make this stay magical.",
    hotelSkills: { ...DEFAULT_SKILLS, kidsMode: true },
  },
};

interface SavedBuddy {
  id: string;
  identity: BuddyIdentity;
  wish: string;
  result: ToyDesignResult;
  createdAt: string;
}

interface Props {
  onBack: () => void;
}

type Snapshot = { id: number; version: string; env: string; isActive: boolean };

export function MagicAtelier({ onBack }: Props) {
  const [step, setStep] = useState<'SELECT' | 'DREAM' | 'REVEAL'>('SELECT');
  const [selectedTemplate, setSelectedTemplate] = useState(TOY_TEMPLATES[0]);
  const [wish, setWish] = useState("");
  const [isMagicHappening, setIsMagicHappening] = useState(false);
  const [result, setResult] = useState<ToyDesignResult | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [policyDecision, setPolicyDecision] = useState<PolicyDecision | null>(null);
  const [policyStatus, setPolicyStatus] = useState<'idle' | 'checking' | 'checked'>('idle');
  const [policyError, setPolicyError] = useState<string | null>(null);
  
  // Buddy Identity State - sync with selected template
  const [buddyIdentity, setBuddyIdentity] = useState<BuddyIdentity>(
    DEFAULT_BUDDY_CONFIGS[selectedTemplate.id] || DEFAULT_BUDDY_CONFIGS.REACHY_MINI
  );

  // Sync buddy config when template changes
  useEffect(() => {
    setBuddyIdentity(DEFAULT_BUDDY_CONFIGS[selectedTemplate.id] || DEFAULT_BUDDY_CONFIGS.REACHY_MINI);
  }, [selectedTemplate.id]);

  // Companion Preview State
  const [companionPreview, setCompanionPreview] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    wearableStudioService.getActiveSnapshot()
      .then((snap) => {
        if (active) {
          setSnapshot(snap as Snapshot | null);
        }
      })
      .catch((error) => {
        console.warn("Failed to load snapshot", error);
        if (active) {
          setSnapshot(null);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  // Generate companion preview when buddy identity changes
  useEffect(() => {
    if (buddyIdentity.name && buddyIdentity.role) {
      const traits = [];
      if (buddyIdentity.energy > 70) traits.push("cheerful");
      else if (buddyIdentity.energy < 30) traits.push("calm");
      
      if (buddyIdentity.warmth > 70) traits.push("warm");
      else if (buddyIdentity.warmth < 30) traits.push("cool");
      
      if (buddyIdentity.humor > 70) traits.push("funny");
      else if (buddyIdentity.humor < 30) traits.push("serious");

      const skills = Object.values(buddyIdentity.hotelSkills).filter(Boolean).length;
      const preview = `Meet ${buddyIdentity.name} — your ${buddyIdentity.role} buddy.\n\nThis buddy is: ${traits.join(" + ") || "balanced"} + helpful${buddyIdentity.hotelSkills.kidsMode ? " + kid-safe" : ""}\nWill speak: ${buddyIdentity.warmth > 70 ? "warm and friendly" : "professional"} tone / ${buddyIdentity.humor > 70 ? "playful" : "respectful"} style\nRobot skills unlocked: ${skills}/5`;
      setCompanionPreview(preview);
    } else {
      setCompanionPreview(null);
    }
  }, [buddyIdentity]);

  const handleCastSpell = async () => {
    if (!wish.trim()) return;
    
    // Policy check before generating
    setPolicyStatus('checking');
    setPolicyError(null);
    setIsMagicHappening(true);
    
    try {
      // Build policy context for toy design
      const policyContext = {
        tags: [
          "scene=concierge_buddy_studio",
          "action=design_buddy",
          `buddy_type=${selectedTemplate.id}`,
          `buddy_name=${buddyIdentity.name}`,
        ],
        signals: {
          risk_score: Math.min(wish.length / 1000, 1),
          content_category: "buddy_design",
          age_rating: "kids",
          region: "global",
          device: "router",
        },
        values: {
          template: selectedTemplate.id,
          wish: wish.slice(0, 200),
          persona: "guest",
          buddyName: buddyIdentity.name,
          buddyRole: buddyIdentity.role,
        },
        snapshot: snapshot
          ? { snapshotId: snapshot.id, version: snapshot.version, env: snapshot.env }
          : undefined,
      };

      const decision = await wearableStudioService.evaluatePolicy(snapshot?.id, policyContext);
      setPolicyDecision(decision);
      setPolicyStatus('checked');

      if (decision.blocked) {
        setPolicyError(decision.reasons[0] || 'Policy blocked this request.');
        setIsMagicHappening(false);
        return;
      }

      // Build enhanced prompt with buddy identity for all templates
      const roleEmojis: Record<BuddyRole, string> = {
        Concierge: "🛎",
        Guide: "🧳",
        Dining: "🍽",
        Housekeeping: "🧺",
        Planner: "🎉"
      };
      
      const personalityDesc = [];
      if (buddyIdentity.energy > 70) personalityDesc.push("high-energy");
      else if (buddyIdentity.energy < 30) personalityDesc.push("calm and gentle");
      
      if (buddyIdentity.warmth > 70) personalityDesc.push("warm and sweet");
      else if (buddyIdentity.warmth < 30) personalityDesc.push("cool and professional");
      
      if (buddyIdentity.humor > 70) personalityDesc.push("playful and funny");
      else if (buddyIdentity.humor < 30) personalityDesc.push("serious and focused");

      const skillsList = [];
      if (buddyIdentity.hotelSkills.orderTowels) skillsList.push("order towels");
      if (buddyIdentity.hotelSkills.roomService) skillsList.push("book room service");
      if (buddyIdentity.hotelSkills.guideAmenities) skillsList.push("guide to amenities");
      if (buddyIdentity.hotelSkills.wakeUpReminder) skillsList.push("wake-up reminders");
      if (buddyIdentity.hotelSkills.kidsMode) skillsList.push("kid-friendly mode");

      // Core prompt prefix with buddy identity - ensures consistent character identity
      const promptPrefix = `You are designing a cute hotel robot friend named "${buddyIdentity.name}" with role "${roleEmojis[buddyIdentity.role]} ${buddyIdentity.role}". ` +
        `Personality: ${personalityDesc.join(", ") || "balanced"} (energy=${buddyIdentity.energy}/100, humor=${buddyIdentity.humor}/100, warmth=${buddyIdentity.warmth}/100). ` +
        `Catchphrase: "${buddyIdentity.catchphrase}". ` +
        `Skills: ${skillsList.join(", ") || "basic assistance"}. ` +
        `This buddy will greet guests during check-in, guide them in the hotel simulator, and help with DIY service requests. `;

      // Proceed with toy design - buddy identity is now consistently included for all templates
      const data = await geminiService.designToy(selectedTemplate.name, promptPrefix + wish);
      setResult(data);
      setStep('REVEAL');
    } catch (e) {
      console.error('Error in handleCastSpell:', e);
      setPolicyError(e instanceof Error ? e.message : "The magic fizzled out! Try again.");
    } finally {
      setIsMagicHappening(false);
      setPolicyStatus('idle');
    }
  };

  const handleReset = () => {
      setStep('SELECT');
      setWish("");
      setResult(null);
      setCompanionPreview(null);
  };

  const handleSaveBuddy = () => {
    if (!result) return;
    
    const savedBuddy: SavedBuddy = {
      id: `buddy_${Date.now()}`,
      identity: buddyIdentity,
      wish: wish,
      result: result,
      createdAt: new Date().toISOString(),
    };

    const savedBuddies = JSON.parse(localStorage.getItem('savedBuddies') || '[]');
    savedBuddies.push(savedBuddy);
    localStorage.setItem('savedBuddies', JSON.stringify(savedBuddies));
    
    alert(`Buddy "${buddyIdentity.name}" saved successfully!`);
  };

  const handleActivateBuddy = () => {
    if (!result) return;
    
    // Save the active buddy configuration for use in hotel simulator
    const activeBuddy = {
      id: `active_${Date.now()}`,
      templateId: selectedTemplate.id,
      identity: buddyIdentity,
      result: result,
      activatedAt: new Date().toISOString(),
    };

    // Store active buddy in localStorage for hotel simulator to access
    localStorage.setItem('activeBuddy', JSON.stringify(activeBuddy));
    
    // Also add to saved buddies list
    const savedBuddy: SavedBuddy = {
      id: `buddy_${Date.now()}`,
      identity: buddyIdentity,
      wish: wish,
      result: result,
      createdAt: new Date().toISOString(),
    };
    const savedBuddies = JSON.parse(localStorage.getItem('savedBuddies') || '[]');
    savedBuddies.push(savedBuddy);
    localStorage.setItem('savedBuddies', JSON.stringify(savedBuddies));

    // Show activation confirmation
    alert(`✅ ${buddyIdentity.name} Activated!\n\nYour ${buddyIdentity.role} companion is now ready to assist guests in the Hotel Simulator.\n\nBuddy configuration saved and ready to use.`);
    
    // TODO: Navigate to hotel simulator or trigger buddy activation callback
    // Example: onActivateBuddy?.(activeBuddy);
  };

  const getRoleEmoji = (role: BuddyRole): string => {
    const emojis: Record<BuddyRole, string> = {
      Concierge: "🛎",
      Guide: "🧳",
      Dining: "🍽",
      Housekeeping: "🧺",
      Planner: "🎉"
    };
    return emojis[role];
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
                <div className="p-1.5 bg-gradient-to-br from-purple-500 to-rose-500 rounded-lg text-white shadow-lg">
                    <Bot size={18} />
                </div>
                <div>
                    <h1 className="text-xl font-black tracking-tight text-rose-950">Concierge Buddy Studio</h1>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-purple-500">Build Your Hotel Companion</p>
                </div>
            </div>
         </div>
         <div className="hidden md:block px-3 py-1 bg-purple-100 rounded-full text-[10px] font-bold uppercase tracking-widest text-purple-600">
            Powered by Wonder-Tech™
         </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-8">
         <div className="max-w-5xl mx-auto">
            
            {/* STEP 1: SELECT */}
            {step === 'SELECT' && (
               <div className="animate-in fade-in slide-in-from-bottom-8 duration-500">
                  <h2 className="text-3xl font-black text-center mb-2 text-rose-950">Choose Your Base Kit</h2>
                  <p className="text-center text-rose-600 mb-8 font-medium">Select a companion to customize and bring to life</p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                     {TOY_TEMPLATES.map((t) => (
                        <button 
                           key={t.id}
                           onClick={() => { setSelectedTemplate(t); setStep('DREAM'); }}
                           className="group relative bg-white rounded-3xl p-6 border-2 border-rose-100 hover:border-purple-400 hover:shadow-xl hover:shadow-purple-200 hover:-translate-y-1 transition-all text-left"
                        >
                           {t.badge && (
                              <div className="absolute top-4 right-4 px-3 py-1 rounded-full bg-purple-600 text-white text-[10px] font-black uppercase tracking-widest shadow">
                                 {t.badge}
                              </div>
                           )}
                           
                           {t.media ? (
                              <div className="mb-4 w-full h-40 rounded-2xl overflow-hidden bg-rose-50 border border-rose-100 group-hover:border-purple-200 transition-colors">
                                 <img
                                    src={t.media.src}
                                    alt={t.shortName}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                 />
                              </div>
                           ) : (
                              <div className="text-6xl mb-4 group-hover:scale-110 transition-transform">{t.icon}</div>
                           )}
                           
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

            {/* STEP 2: DREAM (CUSTOMIZATION) */}
            {step === 'DREAM' && (
               <div className="flex flex-col items-center max-w-3xl mx-auto animate-in fade-in zoom-in-95 duration-500">
                  <div className="w-full bg-white rounded-[2rem] p-8 shadow-2xl shadow-rose-200 border border-rose-100 relative overflow-hidden">
                     {/* Decorative Blob */}
                     <div className="absolute -top-20 -right-20 w-60 h-60 bg-gradient-to-br from-purple-200 to-rose-200 rounded-full blur-3xl opacity-50" />
                     
                     <button onClick={() => setStep('SELECT')} className="absolute top-8 left-8 text-rose-400 hover:text-rose-600 font-bold text-xs uppercase tracking-widest">
                        &larr; Back
                     </button>

                     <div className="mt-8">
                        {/* Media Preview for all buddies */}
                        {selectedTemplate.id === "ROBOT_DOG" ? (
                           <div className="mb-5 rounded-2xl overflow-hidden border border-purple-200 shadow-sm">
                              <video
                                 src="/assets/dog.mp4"
                                 autoPlay
                                 loop
                                 muted
                                 playsInline
                                 className="w-full h-52 object-cover"
                              />
                           </div>
                        ) : selectedTemplate.media?.src && (
                           <div className="mb-5 rounded-2xl overflow-hidden border border-purple-200 shadow-sm">
                              <img
                                 src={selectedTemplate.id === "REACHY_MINI" ? "/assets/reachy/reachy_mini_hello.gif" : selectedTemplate.media.src}
                                 alt={selectedTemplate.shortName}
                                 className="w-full h-52 object-cover"
                              />
                           </div>
                        )}

                        <div className="text-center mb-6">
                           {!selectedTemplate.media && (
                              <div className="text-6xl mb-4">{selectedTemplate.icon}</div>
                           )}
                           <h2 className="text-3xl font-black text-rose-950 mb-2">
                              Design {buddyIdentity.name}
                           </h2>
                           <p className="text-purple-600 font-bold text-sm">
                              {getRoleEmoji(buddyIdentity.role)} {buddyIdentity.role} Companion
                           </p>
                        </div>

                        {/* Unified Buddy Config Panel */}
                        <div className="mb-6 bg-white/80 rounded-2xl p-5 border border-purple-200 shadow-sm text-left">
                           <div className="flex items-center justify-between mb-4">
                              <div className="flex items-center gap-2">
                                 <Bot size={16} className="text-purple-600" />
                                 <div className="font-black text-purple-800">Buddy Setup</div>
                                 <div className="text-[10px] uppercase tracking-widest font-bold text-purple-400">
                                    Customize your companion
                                 </div>
                              </div>

                              {selectedTemplate.badge && (
                                 <div className="px-3 py-1 rounded-full bg-purple-600 text-white text-[10px] font-black uppercase tracking-widest shadow">
                                    {selectedTemplate.badge}
                                 </div>
                              )}
                           </div>

                           <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                              {/* Name */}
                              <div>
                                 <label className="text-xs font-bold text-purple-800 uppercase tracking-wide">
                                    Buddy Name
                                 </label>
                                 <input
                                    value={buddyIdentity.name}
                                    onChange={(e) => setBuddyIdentity((prev) => ({ ...prev, name: e.target.value }))}
                                    className="mt-2 w-full border-2 border-purple-200 rounded-xl px-4 py-3 font-bold text-purple-900 bg-white focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
                                    placeholder="Rover"
                                 />
                              </div>

                              {/* Role */}
                              <div>
                                 <label className="text-xs font-bold text-purple-800 uppercase tracking-wide">
                                    Buddy Role
                                 </label>
                                 <select
                                    value={buddyIdentity.role}
                                    onChange={(e) => setBuddyIdentity((prev) => ({ ...prev, role: e.target.value as BuddyRole }))}
                                    className="mt-2 w-full border-2 border-purple-200 rounded-xl px-4 py-3 font-bold text-purple-900 bg-white focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
                                 >
                                    <option value="Concierge">🛎 Concierge</option>
                                    <option value="Guide">🧳 Travel Guide</option>
                                    <option value="Dining">🍽 Dining Helper</option>
                                    <option value="Housekeeping">🧺 Housekeeping Friend</option>
                                    <option value="Planner">🎉 Experience Planner</option>
                                 </select>
                              </div>
                           </div>

                           {/* Personality sliders */}
                           <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
                              {[
                                 { key: "energy", label: "Energy", left: "Calm", right: "Hyper" },
                                 { key: "humor", label: "Humor", left: "Serious", right: "Funny" },
                                 { key: "warmth", label: "Warmth", left: "Cool", right: "Sweet" },
                              ].map((s) => (
                                 <div key={s.key} className="bg-purple-50 rounded-xl p-4 border border-purple-100">
                                    <div className="flex items-center justify-between mb-2">
                                       <div className="text-xs font-black text-purple-800 uppercase tracking-wide">
                                          {s.label}
                                       </div>
                                       <div className="text-[10px] font-bold text-purple-500">
                                          {(buddyIdentity as any)[s.key]}/100
                                       </div>
                                    </div>
                                    <input
                                       type="range"
                                       min={0}
                                       max={100}
                                       value={(buddyIdentity as any)[s.key]}
                                       onChange={(e) =>
                                          setBuddyIdentity((prev) => ({
                                             ...prev,
                                             [s.key]: Number(e.target.value),
                                          }))
                                       }
                                       className="w-full mt-3 h-2 bg-purple-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                                    />
                                    <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-purple-400 mt-1">
                                       <span>{s.left}</span>
                                       <span>{s.right}</span>
                                    </div>
                                 </div>
                              ))}
                           </div>

                           {/* Catchphrase */}
                           <div className="mt-4">
                              <label className="text-xs font-bold text-purple-800 uppercase tracking-wide mb-2 block">
                                 Catchphrase
                              </label>
                              <input
                                 value={buddyIdentity.catchphrase}
                                 onChange={(e) => setBuddyIdentity((prev) => ({ ...prev, catchphrase: e.target.value }))}
                                 className="w-full border-2 border-purple-200 rounded-xl px-4 py-3 font-medium text-purple-900 bg-white focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
                                 placeholder='e.g. "Welcome home!"'
                              />
                           </div>

                           {/* Skills */}
                           <div className="mt-5">
                              <div className="text-xs font-black text-purple-800 uppercase tracking-wide mb-2">
                                 Robot Skills
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                 {[
                                    { key: "orderTowels", label: "🧺 Tidy-Up Sidekick" },
                                    { key: "roomService", label: "🍪 Snack & Sip Scout" },
                                    { key: "guideAmenities", label: "🗺️ Adventure Navigator" },
                                    { key: "wakeUpReminder", label: "⏰ Ready-Set-Go Timer" },
                                    { key: "kidsMode", label: "🎭 Playtime Pal Mode" },
                                 ].map((skill) => {
                                    const checked = buddyIdentity.hotelSkills[skill.key as keyof typeof buddyIdentity.hotelSkills];
                                    return (
                                       <button
                                          key={skill.key}
                                          onClick={() =>
                                             setBuddyIdentity((prev) => ({
                                                ...prev,
                                                hotelSkills: { ...prev.hotelSkills, [skill.key]: !checked },
                                             }))
                                          }
                                          className={`px-3 py-3 rounded-xl border text-sm font-bold text-left transition-all ${
                                             checked
                                                ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                                                : "bg-white border-purple-200 text-purple-800 hover:bg-purple-50"
                                          }`}
                                       >
                                          {skill.label}
                                       </button>
                                    );
                                 })}
                              </div>
                           </div>

                           {/* Preview summary */}
                           {companionPreview && (
                              <div className="mt-4 bg-white rounded-xl border border-purple-100 p-3">
                                 <div className="text-[10px] font-black uppercase tracking-widest text-purple-400 mb-1">
                                    Preview
                                 </div>
                                 <pre className="text-sm font-medium text-purple-900 whitespace-pre-wrap font-sans">
                                    {companionPreview}
                                 </pre>
                              </div>
                           )}
                        </div>
                        
                        {/* Wish Input */}
                        <div className="bg-rose-50 rounded-2xl p-6 mb-6 text-left border border-rose-100">
                           <label className="flex items-center gap-2 text-sm font-bold text-rose-800 uppercase tracking-wide mb-3">
                              <MessageCircle size={16} /> 
                              Additional Customization
                           </label>
                           <textarea
                              value={wish}
                              onChange={(e) => setWish(e.target.value)}
                              placeholder="Add any special features, colors, or behaviors you'd like..."
                              className="w-full h-32 bg-white border-2 border-rose-200 rounded-xl p-4 text-lg font-medium text-rose-900 placeholder:text-rose-300 focus:outline-none focus:border-purple-400 focus:ring-4 focus:ring-purple-100 transition-all resize-none"
                           />
                        </div>

                        {/* Policy Status Panel */}
                        <div className="mb-6 rounded-xl border border-rose-200 bg-white/80 p-4 shadow-sm">
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-[10px] uppercase tracking-widest font-bold text-rose-400">Policy Gate</div>
                            {policyStatus === 'checking' ? (
                              <div className="flex items-center gap-2 text-xs font-bold text-amber-600">
                                <ShieldAlert size={14} className="animate-pulse" />
                                Checking...
                              </div>
                            ) : policyDecision?.blocked ? (
                              <div className="flex items-center gap-2 text-xs font-bold text-rose-600">
                                <ShieldX size={14} />
                                Blocked
                              </div>
                            ) : policyDecision?.allowed ? (
                              <div className="flex items-center gap-2 text-xs font-bold text-emerald-600">
                                <ShieldCheck size={14} />
                                Allowed
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
                                <ShieldAlert size={14} />
                                Pending
                              </div>
                            )}
                          </div>
                          <div className="mt-3 space-y-2 text-xs text-rose-600 font-medium">
                            <div>
                              Snapshot: <span className="font-bold text-rose-800">{snapshot?.version || 'unavailable'}</span>
                            </div>
                            {policyError && (
                              <div className="text-xs text-rose-600 font-medium bg-rose-50 p-2 rounded-lg">
                                {policyError}
                              </div>
                            )}
                            {policyDecision?.reasons?.length ? (
                              <div className="text-[11px] text-rose-500">
                                {policyDecision.reasons.slice(0, 2).join(' · ')}
                              </div>
                            ) : policyStatus === 'idle' ? (
                              <div className="text-[11px] text-rose-400">Policy evaluation ready.</div>
                            ) : null}
                            {policyDecision?.ruleHits?.length ? (
                              <div className="text-[10px] text-rose-400 uppercase tracking-widest">
                                Hits: {policyDecision.ruleHits.slice(0, 3).map((hit) => hit.ruleName).join(', ')}
                              </div>
                            ) : null}
                          </div>
                        </div>

                        <button 
                           onClick={handleCastSpell}
                           disabled={!wish.trim() || isMagicHappening || (policyDecision?.blocked === true) || !buddyIdentity.name.trim()}
                           className="w-full py-5 rounded-2xl bg-gradient-to-r from-purple-600 to-rose-500 text-white font-black text-lg uppercase tracking-widest shadow-lg shadow-purple-200 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                        >
                           {isMagicHappening ? (
                              <>
                                 <Wand2 className="animate-spin" /> {policyStatus === 'checking' ? 'Checking Policy...' : 'Creating Your Buddy...'}
                              </>
                           ) : (
                              <>
                                 <Sparkles className="animate-pulse" /> Activate Companion
                              </>
                           )}
                        </button>
                     </div>
                  </div>
               </div>
            )}

            {/* STEP 3: REVEAL (Buddy Passport Card) */}
            {step === 'REVEAL' && result && (
               <div className="max-w-4xl mx-auto animate-in slide-in-from-bottom-12 duration-700">
                  
                  {/* Unified Buddy Passport Card for all buddies */}
                  <div className="bg-gradient-to-br from-purple-50 via-white to-rose-50 rounded-[2rem] p-8 shadow-2xl border-2 border-purple-200">
                     {/* Header */}
                     <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-4">
                           <div className="w-20 h-20 rounded-2xl overflow-hidden border-4 border-purple-300 shadow-lg bg-purple-100 flex items-center justify-center">
                              {selectedTemplate.id === "REACHY_MINI" ? (
                                 <img
                                    src="/assets/reachy/reachy_mini_hello.gif"
                                    alt={buddyIdentity.name}
                                    className="w-full h-full object-cover"
                                 />
                              ) : selectedTemplate.media ? (
                                 <img
                                    src={selectedTemplate.media.src}
                                    alt={buddyIdentity.name}
                                    className="w-full h-full object-cover"
                                 />
                              ) : (
                                 <span className="text-4xl">{selectedTemplate.icon}</span>
                              )}
                           </div>
                           <div>
                              <h2 className="text-3xl font-black text-purple-900 mb-1">{buddyIdentity.name}</h2>
                              <p className="text-sm font-bold text-purple-600 uppercase tracking-widest">
                                 {getRoleEmoji(buddyIdentity.role)} {buddyIdentity.role} Companion
                              </p>
                           </div>
                        </div>
                        <div className="text-right">
                           <div className="text-[10px] font-black uppercase tracking-widest text-purple-400 mb-1">Buddy ID</div>
                           <div className="text-xs font-bold text-purple-700">#{Date.now().toString().slice(-6)}</div>
                        </div>
                     </div>

                     {/* Generated Image */}
                     {result.imageUrl && (
                        <div className="mb-6 rounded-2xl overflow-hidden border-2 border-purple-200 shadow-lg">
                           <img src={result.imageUrl} alt={buddyIdentity.name} className="w-full h-64 object-cover" />
                        </div>
                     )}

                     {/* Identity Section */}
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                        <div className="bg-white rounded-xl p-4 border border-purple-100">
                           <div className="text-[10px] font-black uppercase tracking-widest text-purple-400 mb-2">Personality Quote</div>
                           <p className="text-sm font-bold text-purple-900 italic">"{result.blueprint?.personality || buddyIdentity.catchphrase}"</p>
                        </div>
                        <div className="bg-white rounded-xl p-4 border border-purple-100">
                           <div className="text-[10px] font-black uppercase tracking-widest text-purple-400 mb-2">Signature Catchphrase</div>
                           <p className="text-sm font-bold text-purple-900">"{buddyIdentity.catchphrase}"</p>
                        </div>
                     </div>

                     {/* Superpower */}
                     {result.blueprint?.superpower && (
                        <div className="bg-gradient-to-r from-purple-100 to-rose-100 rounded-xl p-4 mb-6 border border-purple-200">
                           <div className="text-[10px] font-black uppercase tracking-widest text-purple-600 mb-1">Superpower</div>
                           <p className="text-lg font-black text-purple-900">{result.blueprint.superpower}</p>
                        </div>
                     )}

                     {/* Robot Skills Unlocked */}
                     <div className="mb-6">
                        <div className="text-[10px] font-black uppercase tracking-widest text-purple-400 mb-3 flex items-center gap-2">
                           <CheckCircle size={14} className="text-purple-600" />
                           Robot Skills Unlocked
                        </div>
                        <div className="flex flex-wrap gap-2">
                           {Object.entries(buddyIdentity.hotelSkills)
                              .filter(([_, enabled]) => enabled)
                              .map(([key, _]) => {
                                 const skillLabels: Record<string, string> = {
                                    orderTowels: "🧺 Tidy-Up Sidekick",
                                    roomService: "🍪 Snack & Sip Scout",
                                    guideAmenities: "🗺️ Adventure Navigator",
                                    wakeUpReminder: "⏰ Ready-Set-Go Timer",
                                    kidsMode: "🎭 Playtime Pal Mode"
                                 };
                                 return (
                                    <span key={key} className="px-3 py-1.5 bg-purple-100 text-purple-800 rounded-full text-xs font-bold">
                                       {skillLabels[key]}
                                    </span>
                                 );
                              })}
                        </div>
                     </div>

                     {/* Accessories/Features */}
                     {result.blueprint?.accessoryList && result.blueprint.accessoryList.length > 0 && (
                        <div className="border-t-2 border-dashed border-purple-200 pt-6 mb-6">
                           <h3 className="font-bold text-purple-900 flex items-center gap-2 mb-4">
                              <Printer size={18} /> Custom Features & Accessories
                           </h3>
                           <ul className="space-y-2">
                              {result.blueprint.accessoryList.map((acc, i) => (
                                 <li key={i} className="flex items-center gap-3 text-sm font-medium text-purple-700 bg-purple-50/50 p-2 rounded-lg">
                                    <CheckCircle size={16} className="text-purple-600" />
                                    {acc}
                                 </li>
                              ))}
                           </ul>
                        </div>
                     )}

                     {/* Action Buttons */}
                     <div className="flex gap-4">
                        <button 
                           onClick={handleSaveBuddy}
                           className="flex-1 py-4 bg-white border-2 border-purple-300 text-purple-700 font-bold rounded-2xl hover:bg-purple-50 transition-colors uppercase tracking-widest text-xs flex items-center justify-center gap-2"
                        >
                           <Save size={16} /> Save Buddy
                        </button>
                        <button 
                           onClick={handleActivateBuddy}
                           className="flex-1 py-4 bg-gradient-to-r from-purple-600 to-rose-500 text-white font-bold rounded-2xl hover:from-purple-700 hover:to-rose-600 transition-colors uppercase tracking-widest text-xs shadow-lg shadow-purple-200 flex items-center justify-center gap-2"
                        >
                           <Play size={16} /> Activate in Hotel
                        </button>
                     </div>

                     <button 
                        onClick={handleReset}
                        className="w-full mt-4 py-3 bg-white border border-purple-200 text-purple-600 font-bold rounded-xl hover:bg-purple-50 transition-colors uppercase tracking-widest text-xs"
                     >
                        Create Another Buddy
                     </button>
                  </div>
               </div>
            )}

         </div>
      </div>
    </div>
  );
}
