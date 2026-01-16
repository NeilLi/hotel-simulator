import React, { useEffect, useReducer, useState } from 'react';
import { ArrowLeft, Sparkles, Shirt, Wand2, Download, Printer, Scissors, Layers, Loader2, ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react';
import { wearableStudioService } from '../../services/wearableStudioService';
import { PolicyDecision, WearableDesignDraft, WearableIntent, WearableTicket } from '../../services/wearableStudioTypes';
import { Snapshot } from '../../types';

const STYLES_LIST = ["Minimalist", "Cyberpunk", "Boho", "Vintage", "Abstract Art", "Streetwear"];
const SIZES_LIST = ["XS", "S", "M", "L", "XL", "XXL"];
const TYPES_LIST = ["T-Shirt", "Hoodie", "Jacket", "Tote Bag"];

interface Props {
  onBack: () => void;
}

type StudioStatus = 'idle' | 'policy_check' | 'generating' | 'review' | 'submitting' | 'done' | 'error';

type StudioState = {
  story: string;
  style: string;
  size: string;
  type: string;
  status: StudioStatus;
  runId: string | null;
  policyDecision: PolicyDecision | null;
  designDraft: WearableDesignDraft | null;
  ticket: WearableTicket | null;
  error: string | null;
};

type StudioAction =
  | { type: 'SET_FIELD'; field: 'story' | 'style' | 'size' | 'type'; value: string }
  | { type: 'SET_STATUS'; status: StudioStatus }
  | { type: 'SET_POLICY'; decision: PolicyDecision | null }
  | { type: 'SET_DESIGN'; design: WearableDesignDraft | null }
  | { type: 'SET_RUN_ID'; runId: string | null }
  | { type: 'SET_TICKET'; ticket: WearableTicket | null }
  | { type: 'SET_ERROR'; error: string | null };

const initialState: StudioState = {
  story: '',
  style: STYLES_LIST[0],
  size: SIZES_LIST[2],
  type: TYPES_LIST[0],
  status: 'idle',
  runId: null,
  policyDecision: null,
  designDraft: null,
  ticket: null,
  error: null,
};

function reducer(state: StudioState, action: StudioAction): StudioState {
  switch (action.type) {
    case 'SET_FIELD':
      return { ...state, [action.field]: action.value };
    case 'SET_STATUS':
      return { ...state, status: action.status };
    case 'SET_POLICY':
      return { ...state, policyDecision: action.decision };
    case 'SET_DESIGN':
      return { ...state, designDraft: action.design };
    case 'SET_RUN_ID':
      return { ...state, runId: action.runId };
    case 'SET_TICKET':
      return { ...state, ticket: action.ticket };
    case 'SET_ERROR':
      return { ...state, error: action.error };
    default:
      return state;
  }
}

export function WearableStoryStudio({ onBack }: Props) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    let active = true;
    wearableStudioService.getActiveSnapshot()
      .then((snap) => {
        if (active) setSnapshot(snap);
      })
      .catch((error) => {
        console.warn("Failed to load snapshot", error);
      });
    return () => {
      active = false;
    };
  }, []);

  const intent: WearableIntent = {
    story: state.story,
    style: state.style,
    type: state.type,
    size: state.size,
    persona: 'guest',
    constraints: [],
  };

  const isBusy = ['policy_check', 'generating', 'submitting'].includes(state.status);

  const handleGenerate = async () => {
    if (!state.story.trim() || isBusy) return;

    const runId = wearableStudioService.createRunId();
    dispatch({ type: 'SET_RUN_ID', runId });
    dispatch({ type: 'SET_STATUS', status: 'policy_check' });
    dispatch({ type: 'SET_ERROR', error: null });
    dispatch({ type: 'SET_DESIGN', design: null });
    dispatch({ type: 'SET_TICKET', ticket: null });

    try {
      const policyContext = wearableStudioService.buildPolicyContext(intent, snapshot || undefined, 'generate_design');
      const policyDecision = await wearableStudioService.evaluatePolicy(snapshot?.id, policyContext);
      dispatch({ type: 'SET_POLICY', decision: policyDecision });

      if (policyDecision.blocked) {
        await wearableStudioService.appendMemory({
          tier: 'event_working',
          category: 'wearable_design_attempt',
          content: state.story.slice(0, 280),
          metadata: {
            intent,
            policyDecision,
            snapshot,
            runId,
            source_modality: 'text',
          },
        }, runId);
        dispatch({ type: 'SET_STATUS', status: 'error' });
        dispatch({ type: 'SET_ERROR', error: policyDecision.reasons[0] || 'Policy blocked this request.' });
        return;
      }

      dispatch({ type: 'SET_STATUS', status: 'generating' });
      const request = await wearableStudioService.buildLLMRequest(intent, policyDecision, snapshot || undefined);
      const design = await wearableStudioService.designWearable(request);
      dispatch({ type: 'SET_DESIGN', design });
      dispatch({ type: 'SET_STATUS', status: 'review' });

      await wearableStudioService.appendMemory({
        tier: 'event_working',
        category: 'wearable_design_attempt',
        content: state.story.slice(0, 280),
        metadata: {
          intent,
          policyDecision,
          snapshot,
          runId,
          design: {
            designConcept: design.designConcept,
            fabricType: design.fabricType,
            safetyTags: design.safetyTags,
          },
          source_modality: 'text',
        },
      }, runId);
    } catch (e) {
      console.error(e);
      dispatch({ type: 'SET_STATUS', status: 'error' });
      dispatch({ type: 'SET_ERROR', error: 'Failed to generate design. Please try again.' });
    }
  };

  const handleSubmit = async () => {
    if (!state.designDraft || !state.policyDecision?.allowed || isBusy) return;

    dispatch({ type: 'SET_STATUS', status: 'submitting' });
    dispatch({ type: 'SET_ERROR', error: null });

    try {
      const policyContext = wearableStudioService.buildPolicyContext(intent, snapshot || undefined, 'submit_mfg');
      policyContext.signals = {
        ...policyContext.signals,
        fabricType: state.designDraft.fabricType,
        safetyTags: state.designDraft.safetyTags,
        printPlacement: state.designDraft.printSpec.placement,
      };

      const submitDecision = await wearableStudioService.evaluatePolicy(snapshot?.id, policyContext);
      dispatch({ type: 'SET_POLICY', decision: submitDecision });

      if (submitDecision.blocked) {
        dispatch({ type: 'SET_STATUS', status: 'error' });
        dispatch({ type: 'SET_ERROR', error: submitDecision.reasons[0] || 'Policy blocked manufacturing.' });
        return;
      }

      const ticket: WearableTicket = {
        ticketId: `SEEDCORE-MFG-${state.runId?.slice(0, 8) || Math.floor(Math.random() * 10000)}`,
        runId: state.runId || wearableStudioService.createRunId(),
        snapshotId: snapshot?.id,
        snapshotVersion: snapshot?.version,
        intent,
        policyDecision: submitDecision,
        design: state.designDraft,
        createdAt: new Date().toISOString(),
      };

      await wearableStudioService.submitTicket(ticket);
      dispatch({ type: 'SET_TICKET', ticket });
      dispatch({ type: 'SET_STATUS', status: 'done' });

      await wearableStudioService.appendMemory({
        tier: 'knowledge_base',
        category: 'wearable_design_ticket',
        content: ticket.ticketId,
        metadata: {
          intent,
          policyDecision: submitDecision,
          ticket,
          snapshot,
          runId: ticket.runId,
          design: {
            designConcept: ticket.design.designConcept,
            fabricType: ticket.design.fabricType,
          },
        },
      }, ticket.runId);
    } catch (e) {
      console.error(e);
      dispatch({ type: 'SET_STATUS', status: 'error' });
      dispatch({ type: 'SET_ERROR', error: 'Failed to submit to manufacturing.' });
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
              {isBusy ? "AI Processing..." : "Studio Ready"}
           </div>
        </div>
      </div>

      {/* --- MAIN CONTENT GRID --- */}
      <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12">
         
         {/* LEFT: INPUT PANEL */}
        <div className="lg:col-span-4 p-8 overflow-y-auto bg-[#F8FAFC] border-r border-slate-200">
            <div className="space-y-8 max-w-md mx-auto">
               <WearableStoryForm
                 story={state.story}
                 style={state.style}
                 type={state.type}
                 size={state.size}
                 isBusy={isBusy}
                 onStoryChange={(value) => dispatch({ type: 'SET_FIELD', field: 'story', value })}
                 onStyleChange={(value) => dispatch({ type: 'SET_FIELD', field: 'style', value })}
                 onTypeChange={(value) => dispatch({ type: 'SET_FIELD', field: 'type', value })}
                 onSizeChange={(value) => dispatch({ type: 'SET_FIELD', field: 'size', value })}
               />

               <PolicyStatusPanel snapshot={snapshot} decision={state.policyDecision} status={state.status} />

               {state.error && (
                 <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-xl px-4 py-3">
                   {state.error}
                 </div>
               )}

               <hr className="border-slate-200" />

               <button
                  onClick={handleGenerate}
                  disabled={!state.story.trim() || isBusy}
                  className="w-full py-5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl font-bold uppercase tracking-widest shadow-xl shadow-blue-200 hover:shadow-blue-300 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
               >
                  {isBusy && state.status !== 'submitting' ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                  {state.status === 'policy_check' ? "Running Policy..." : state.status === 'generating' ? "Weaving Reality..." : "Generate Wearable"}
               </button>
            </div>
         </div>

         {/* RIGHT: PREVIEW PANEL */}
         <div className="lg:col-span-8 bg-white relative p-8 flex flex-col items-center justify-center overflow-y-auto">
             {/* Background Pattern */}
             <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
             
            {state.designDraft ? (
                <div className="w-full max-w-3xl animate-in fade-in slide-in-from-bottom-8 duration-700">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                        
                        <DesignPreview design={state.designDraft} type={state.type} />

                        <div className="space-y-6">
                           <ProductionTicket
                             design={state.designDraft}
                             runId={state.runId}
                             ticket={state.ticket}
                           />
                           <ActionsBar
                             disabled={!state.policyDecision?.allowed || isBusy}
                             submitting={state.status === 'submitting'}
                             onSubmit={handleSubmit}
                           />
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

function WearableStoryForm(props: {
  story: string;
  style: string;
  type: string;
  size: string;
  isBusy: boolean;
  onStoryChange: (value: string) => void;
  onStyleChange: (value: string) => void;
  onTypeChange: (value: string) => void;
  onSizeChange: (value: string) => void;
}) {
  return (
    <>
      <div className="space-y-3">
        <label className="text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
          <Wand2 size={14} /> The Narrative
        </label>
        <textarea
          value={props.story}
          onChange={(e) => props.onStoryChange(e.target.value)}
          placeholder="E.g., I traveled to a southeast island with my girlfriend. We watched the sunset turn the ocean purple and gold..."
          className="w-full h-40 p-4 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none shadow-sm transition-all placeholder:text-slate-300 font-medium"
          disabled={props.isBusy}
        />
        <p className="text-[10px] text-slate-400 leading-relaxed">
          Our AI Weaver interprets your memories to generate a unique textile pattern and design concept.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Item Type</label>
          <select
            value={props.type}
            onChange={(e) => props.onTypeChange(e.target.value)}
            className="w-full p-3 rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-700 focus:outline-none focus:border-blue-500 appearance-none"
            disabled={props.isBusy}
          >
            {TYPES_LIST.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Aesthetic</label>
          <select
            value={props.style}
            onChange={(e) => props.onStyleChange(e.target.value)}
            className="w-full p-3 rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-700 focus:outline-none focus:border-blue-500 appearance-none"
            disabled={props.isBusy}
          >
            {STYLES_LIST.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Size / Cut</label>
        <div className="flex gap-2">
          {SIZES_LIST.map((s) => (
            <button
              key={s}
              onClick={() => props.onSizeChange(s)}
              disabled={props.isBusy}
              className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all ${
                props.size === s
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function PolicyStatusPanel(props: { snapshot: Snapshot | null; decision: PolicyDecision | null; status: StudioStatus }) {
  const decision = props.decision;
  const statusBadge = decision?.blocked
    ? { label: 'Blocked', icon: <ShieldX size={14} className="text-rose-600" />, color: 'text-rose-600' }
    : decision?.allowed
    ? { label: 'Allowed', icon: <ShieldCheck size={14} className="text-emerald-600" />, color: 'text-emerald-600' }
    : { label: 'Pending', icon: <ShieldAlert size={14} className="text-amber-600" />, color: 'text-amber-600' };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-widest font-bold text-slate-400">Policy Gate</div>
        <div className={`flex items-center gap-2 text-xs font-bold ${statusBadge.color}`}>
          {statusBadge.icon}
          {statusBadge.label}
        </div>
      </div>
      <div className="mt-3 space-y-2 text-xs text-slate-600 font-medium">
        <div>
          Snapshot: <span className="font-bold text-slate-800">{props.snapshot?.version || 'unavailable'}</span>
        </div>
        {decision?.reasons?.length ? (
          <div className="text-[11px] text-slate-500">
            {decision.reasons.slice(0, 2).join(' · ')}
          </div>
        ) : (
          <div className="text-[11px] text-slate-400">Policy evaluation ready.</div>
        )}
        {decision?.ruleHits?.length ? (
          <div className="text-[10px] text-slate-400 uppercase tracking-widest">
            Hits: {decision.ruleHits.slice(0, 3).map((hit) => hit.ruleName).join(', ')}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DesignPreview({ design, type }: { design: WearableDesignDraft; type: string }) {
  const [view, setView] = useState<'production' | 'placement'>('production');

  const getGarmentSVG = () => {
    const printAreaId = `print-area-${Math.random().toString(36).slice(2, 11)}`;
    const printSrc = design.printImageUrl || design.imageUrl || null;
    
    if (type.toLowerCase().includes('hoodie')) {
      return (
        <svg
          viewBox="0 0 400 550"
          className="w-full h-full"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <clipPath id={printAreaId}>
              <path d="M 120 180 L 280 180 L 280 260 L 120 260 Z" />
            </clipPath>
          </defs>
          {/* Hoodie Shape */}
          <path
            d="M 100 100 L 100 140 Q 100 160 120 160 L 140 160 L 140 220 Q 140 240 120 240 L 120 520 Q 120 540 140 540 L 260 540 Q 280 540 280 520 L 280 240 Q 280 220 260 220 L 260 160 L 280 160 Q 300 160 300 140 L 300 100 Q 300 80 280 80 L 260 80 L 260 60 Q 260 40 240 40 L 160 40 Q 140 40 140 60 L 140 80 L 120 80 Q 100 80 100 100 Z"
            fill="#ffffff"
            stroke="#e2e8f0"
            strokeWidth="2"
          />
          {/* Hood */}
          <path
            d="M 120 100 Q 100 80 100 60 Q 120 40 140 60 L 140 100 Q 140 120 120 100 Z M 280 100 Q 300 80 300 60 Q 280 40 260 60 L 260 100 Q 260 120 280 100 Z"
            fill="#f8fafc"
            stroke="#e2e8f0"
            strokeWidth="2"
          />
          {printSrc && (
            <image
              href={printSrc}
              x="120"
              y="180"
              width="160"
              height="80"
              clipPath={`url(#${printAreaId})`}
              preserveAspectRatio="xMidYMid slice"
              opacity="0.95"
            />
          )}
        </svg>
      );
    } else if (type.toLowerCase().includes('jacket')) {
      return (
        <svg
          viewBox="0 0 400 550"
          className="w-full h-full"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <clipPath id={printAreaId}>
              <path d="M 120 160 L 280 160 L 280 240 L 120 240 Z" />
            </clipPath>
          </defs>
          {/* Jacket Shape */}
          <path
            d="M 100 80 L 100 120 Q 100 140 120 140 L 140 140 L 140 200 Q 140 220 120 220 L 120 520 Q 120 540 140 540 L 260 540 Q 280 540 280 520 L 280 220 Q 280 200 260 200 L 260 140 L 280 140 Q 300 140 300 120 L 300 80 Q 300 60 280 60 L 260 60 L 260 40 Q 260 20 240 20 L 160 20 Q 140 20 140 40 L 140 60 L 120 60 Q 100 60 100 80 Z"
            fill="#ffffff"
            stroke="#e2e8f0"
            strokeWidth="2"
          />
          {/* Zipper */}
          <line x1="200" y1="80" x2="200" y2="220" stroke="#94a3b8" strokeWidth="3" />
          {printSrc && (
            <image
              href={printSrc}
              x="120"
              y="160"
              width="160"
              height="80"
              clipPath={`url(#${printAreaId})`}
              preserveAspectRatio="xMidYMid slice"
              opacity="0.95"
            />
          )}
        </svg>
      );
    } else if (type.toLowerCase().includes('tote')) {
      return (
        <svg
          viewBox="0 0 400 400"
          className="w-full h-full"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <clipPath id={printAreaId}>
              <path d="M 80 120 L 320 120 L 320 280 L 80 280 Z" />
            </clipPath>
          </defs>
          {/* Tote Bag Shape */}
          <rect x="80" y="100" width="240" height="200" rx="8" fill="#ffffff" stroke="#e2e8f0" strokeWidth="2" />
          {/* Handles */}
          <path d="M 120 100 Q 120 60 160 60 Q 200 60 200 100" stroke="#e2e8f0" strokeWidth="3" fill="none" />
          <path d="M 200 100 Q 200 60 240 60 Q 280 60 280 100" stroke="#e2e8f0" strokeWidth="3" fill="none" />
          {printSrc && (
            <image
              href={printSrc}
              x="80"
              y="120"
              width="240"
              height="160"
              clipPath={`url(#${printAreaId})`}
              preserveAspectRatio="xMidYMid slice"
              opacity="0.95"
            />
          )}
        </svg>
      );
    } else {
      // Default T-Shirt
      return (
        <svg
          viewBox="0 0 400 500"
          className="w-full h-full"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <clipPath id={printAreaId}>
              <path d="M 120 140 L 280 140 L 280 220 L 120 220 Z" />
            </clipPath>
          </defs>
          {/* T-Shirt Shape */}
          <path
            d="M 100 80 L 100 120 Q 100 140 120 140 L 140 140 L 140 200 Q 140 220 120 220 L 120 480 Q 120 500 140 500 L 260 500 Q 280 500 280 480 L 280 220 Q 280 200 260 200 L 260 140 L 280 140 Q 300 140 300 120 L 300 80 Q 300 60 280 60 L 260 60 L 260 40 Q 260 20 240 20 L 160 20 Q 140 20 140 40 L 140 60 L 120 60 Q 100 60 100 80 Z"
            fill="#ffffff"
            stroke="#e2e8f0"
            strokeWidth="2"
            className="drop-shadow-md"
          />
          {printSrc && (
            <image
              href={printSrc}
              x="120"
              y="140"
              width="160"
              height="80"
              clipPath={`url(#${printAreaId})`}
              preserveAspectRatio="xMidYMid slice"
              opacity="0.95"
            />
          )}
          {/* Sleeve Details */}
          <circle cx="120" cy="100" r="8" fill="#cbd5e1" opacity="0.3" />
          <circle cx="280" cy="100" r="8" fill="#cbd5e1" opacity="0.3" />
        </svg>
      );
    }
  };

  return (
    <div
      className={[
        // Production keeps the "card" feel; Placement should be bare (no background block).
        view === 'placement'
          ? 'bg-transparent p-0 border-0 shadow-none rotate-0'
          : 'bg-white p-4 rounded-3xl shadow-2xl border border-slate-100 rotate-1 hover:rotate-0 transition-transform duration-500',
      ].join(' ')}
    >
      {design.mockupImageUrl || design.imageUrl ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Preview</div>
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
              <button
                onClick={() => setView('production')}
                className={`px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest rounded-lg transition-colors ${
                  view === 'production' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Production
              </button>
              <button
                onClick={() => setView('placement')}
                className={`px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest rounded-lg transition-colors ${
                  view === 'placement' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Placement
              </button>
            </div>
          </div>

          {view === 'production' ? (
            <div className="relative w-full aspect-[3/4] rounded-2xl overflow-hidden bg-white border border-slate-100">
              <img
                src={design.mockupImageUrl || design.imageUrl || undefined}
                alt="Production mockup"
                className="w-full h-full object-contain p-4"
              />
              <div className="absolute top-3 left-3 bg-emerald-600/90 text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full">
                Production Mockup
              </div>
            </div>
          ) : (
            <div className="w-full">
              <div className="mx-auto w-full max-w-2xl">
                <img
                  src={design.printImageUrl || design.imageUrl || undefined}
                  alt="Print artwork"
                  className="w-full h-auto object-contain"
                />
              </div>
              <div className="mt-2 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500">
                {design.printSpec?.placement || 'FRONT'}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="w-full aspect-[3/4] bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 font-mono text-xs">
          Image Generation Pending
        </div>
      )}
    </div>
  );
}

function ProductionTicket({ design, runId, ticket }: { design: WearableDesignDraft; runId: string | null; ticket: WearableTicket | null }) {
  return (
    <div className="bg-[#FFFDF5] p-6 rounded-xl border border-amber-100 shadow-sm relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-amber-500" />

      <h3 className="font-black text-2xl text-slate-900 mb-1">Production Ticket</h3>
      <p className="text-[10px] font-mono uppercase tracking-widest text-slate-400 mb-6">
        #{ticket?.ticketId || `RUN-${runId?.slice(0, 8) || 'pending'}`}
      </p>

      <div className="space-y-4">
        <div>
          <span className="text-[9px] font-bold uppercase text-slate-400 block mb-1">Design Concept</span>
          <p className="text-sm font-serif italic text-slate-700 leading-relaxed">
            "{design.designConcept}"
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 bg-white rounded-lg border border-slate-100">
            <div className="flex items-center gap-2 mb-1 text-blue-500"><Layers size={12} /> <span className="text-[9px] font-bold uppercase">Material</span></div>
            <span className="text-xs font-bold text-slate-700">{design.fabricType}</span>
          </div>
          <div className="p-3 bg-white rounded-lg border border-slate-100">
            <div className="flex items-center gap-2 mb-1 text-amber-500"><Scissors size={12} /> <span className="text-[9px] font-bold uppercase">Thread</span></div>
            <span className="text-xs font-bold text-slate-700">{design.threadCount} TC</span>
          </div>
        </div>

        <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
          <span className="text-[9px] font-bold uppercase text-slate-400 block mb-1">Care Instructions</span>
          <span className="text-xs font-mono text-slate-600">{design.careInstructions}</span>
        </div>
      </div>
    </div>
  );
}

function ActionsBar({ disabled, submitting, onSubmit }: { disabled: boolean; submitting: boolean; onSubmit: () => void }) {
  return (
    <div className="flex gap-3">
      <button
        onClick={onSubmit}
        disabled={disabled}
        className="flex-1 py-4 bg-slate-900 text-white rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />} Send to Mfg
      </button>
      <button
        className="px-6 py-4 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors"
        disabled={submitting}
      >
        <Download size={18} />
      </button>
    </div>
  );
}
