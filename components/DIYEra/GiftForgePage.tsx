import React, { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import {
  ArrowLeft,
  Sparkles,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  CheckCircle2,
  X,
  Box,
  Printer,
  Download,
  Layers,
  Scissors,
  Image as ImageIcon,
  Wand2,
  Copy,
} from 'lucide-react';

import { wearableStudioService } from '../../services/wearableStudioService';
import { seedcoreService } from '../../services/seedcoreService';
import type { PolicyDecision } from '../../services/wearableStudioTypes';
import type { Snapshot } from '../../types';

/** ---------------------------
 *  Domain
 *  -------------------------- */
const MATERIALS = ['PLA', 'Resin', 'Metal', 'Wood', 'Textile'] as const;
type Material = (typeof MATERIALS)[number];

type GiftStatus = 'idle' | 'policy_check' | 'planning' | 'review' | 'submitting' | 'done' | 'error';

type GiftForgeRequest = {
  prompt: string;
  style: string;
  material: Material;
  sizeCm: number;
  color: string;
  persona: 'guest' | 'staff';
};

type GiftForgePlan = {
  executorUnitId: string; // e.g. unit:3d_printer_01
  steps: Array<{ name: string; type: 'action' | 'check' | 'notify'; params?: any }>;
  estimatedMinutes?: number;
};

type GiftForgeTicket = {
  ticketId: string;
  runId: string;
  snapshotId?: number;
  snapshotVersion?: string;
  request: GiftForgeRequest;
  policyDecision: PolicyDecision;
  plan: GiftForgePlan;
  createdAt: string;
};

type Toast = { message: string; taskId?: string; isError?: boolean } | null;

type State = {
  // inputs
  prompt: string;
  style: string;
  material: Material;
  sizeCm: number;
  color: string;

  // runtime
  status: GiftStatus;
  runId: string | null;
  policyDecision: PolicyDecision | null;
  plan: GiftForgePlan | null;
  ticket: GiftForgeTicket | null;

  // ui
  error: string | null;
  toast: Toast;
};

type Action =
  | { type: 'SET_FIELD'; field: keyof Pick<State, 'prompt' | 'style' | 'material' | 'sizeCm' | 'color'>; value: any }
  | { type: 'SET_STATUS'; status: GiftStatus }
  | { type: 'SET_RUN_ID'; runId: string | null }
  | { type: 'SET_POLICY'; decision: PolicyDecision | null }
  | { type: 'SET_PLAN'; plan: GiftForgePlan | null }
  | { type: 'SET_TICKET'; ticket: GiftForgeTicket | null }
  | { type: 'SET_ERROR'; error: string | null }
  | { type: 'SHOW_TOAST'; toast: Toast }
  | { type: 'RESET_FLOW' };

const initialState: State = {
  prompt: '',
  style: 'Minimalist',
  material: 'PLA',
  sizeCm: 12,
  color: 'White',

  status: 'idle',
  runId: null,
  policyDecision: null,
  plan: null,
  ticket: null,

  error: null,
  toast: null,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_FIELD':
      return { ...state, [action.field]: action.value };
    case 'SET_STATUS':
      return { ...state, status: action.status };
    case 'SET_RUN_ID':
      return { ...state, runId: action.runId };
    case 'SET_POLICY':
      return { ...state, policyDecision: action.decision };
    case 'SET_PLAN':
      return { ...state, plan: action.plan };
    case 'SET_TICKET':
      return { ...state, ticket: action.ticket };
    case 'SET_ERROR':
      return { ...state, error: action.error };
    case 'SHOW_TOAST':
      return { ...state, toast: action.toast };
    case 'RESET_FLOW':
      return {
        ...state,
        status: 'idle',
        runId: null,
        policyDecision: null,
        plan: null,
        ticket: null,
        error: null,
      };
    default:
      return state;
  }
}

/** ---------------------------
 *  Inspirations (Images + Prompt Presets)
 *  IMPORTANT: public/.. is served from root, so use /assets/...
 *  -------------------------- */
type Inspiration = {
  id: string;
  title: string;
  src: string;
  prompt: string;
  suggestedStyle?: string;
  suggestedMaterial?: Material;
  suggestedColor?: string;
  suggestedSizeCm?: number;
};

const FORGE_INSPIRATIONS: Inspiration[] = [
  {
    id: 'forge-01',
    title: 'Hotel Crest Token',
    src: '/assets/forges/01.png',
    prompt:
      'A premium hotel crest token for guests: a small palm-sized emblem with subtle engraving, clean geometry, and a hidden “room key” motif. Make it feel collectible, modern, and elegant.',
    suggestedStyle: 'Minimalist',
    suggestedMaterial: 'Metal',
    suggestedColor: 'Brushed Silver',
    suggestedSizeCm: 6,
  },
  {
    id: 'forge-02',
    title: 'Whimsical Bell Charm',
    src: '/assets/forges/02.png',
    prompt:
      'A whimsical bell-shaped charm inspired by vintage concierge bells, with rounded edges and a tactile top button. Add light decorative patterns that catch highlights but keep it simple.',
    suggestedStyle: 'Vintage',
    suggestedMaterial: 'Resin',
    suggestedColor: 'Ivory',
    suggestedSizeCm: 8,
  },
  {
    id: 'forge-03',
    title: 'Cyber Keychain Totem',
    src: '/assets/forges/03.png',
    prompt:
      'A cyberpunk keychain totem for a futuristic hotel: layered panels, micro-engraved lines, and a tiny holographic-style emblem area. Compact, bold silhouette, still printable.',
    suggestedStyle: 'Cyberpunk',
    suggestedMaterial: 'PLA',
    suggestedColor: 'Black',
    suggestedSizeCm: 7,
  },
  {
    id: 'forge-04',
    title: 'Botanical Room Tag',
    src: '/assets/forges/04.png',
    prompt:
      'A botanical room tag: an elegant plaque with a leaf-vein border, soft curves, and a small embossed number area. Should feel calming, organic, and premium.',
    suggestedStyle: 'Boho',
    suggestedMaterial: 'Wood',
    suggestedColor: 'Natural',
    suggestedSizeCm: 10,
  },
];

/** ---------------------------
 *  Planner (mock, swap later with PKG DAG)
 *  -------------------------- */
function buildMockPlan(request: GiftForgeRequest): GiftForgePlan {
  const executorUnitId = 'unit:3d_printer_01';
  const steps: GiftForgePlan['steps'] = [
    { name: 'Generate 3D model from prompt', type: 'action', params: { engine: 'mock', prompt: request.prompt, style: request.style } },
    { name: 'Slice model for printer', type: 'action', params: { material: request.material, sizeCm: request.sizeCm } },
    { name: 'Print object', type: 'action', params: { unit: executorUnitId, color: request.color } },
    { name: 'Quality check', type: 'check', params: { tolerance: 'standard' } },
    { name: 'Notify guest', type: 'notify' },
  ];
  return { executorUnitId, steps, estimatedMinutes: 60 };
}

/** ---------------------------
 *  Hooks
 *  -------------------------- */
function useToast(dispatch: React.Dispatch<Action>) {
  return useCallback(
    (message: string, opts?: { taskId?: string; isError?: boolean; ms?: number }) => {
      dispatch({ type: 'SHOW_TOAST', toast: { message, taskId: opts?.taskId, isError: opts?.isError } });
      window.setTimeout(() => dispatch({ type: 'SHOW_TOAST', toast: null }), opts?.ms ?? 5000);
    },
    [dispatch]
  );
}

/** ---------------------------
 *  Main Page
 *  -------------------------- */
interface Props {
  onBack: () => void;
}

export function GiftForgePage({ onBack }: Props) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [state, dispatch] = useReducer(reducer, initialState);

  const toast = useToast(dispatch);

  useEffect(() => {
    let active = true;
    wearableStudioService
      .getActiveSnapshot()
      .then((snap) => {
        if (active) setSnapshot(snap);
      })
      .catch((err) => console.warn('Failed to load snapshot', err));
    return () => {
      active = false;
    };
  }, []);

  const request: GiftForgeRequest = useMemo(
    () => ({
      prompt: state.prompt,
      style: state.style,
      material: state.material,
      sizeCm: Number(state.sizeCm) || 12,
      color: state.color,
      persona: 'guest',
    }),
    [state.prompt, state.style, state.material, state.sizeCm, state.color]
  );

  const isBusy = useMemo(() => ['policy_check', 'planning', 'submitting'].includes(state.status), [state.status]);

  const resetForNewPlan = useCallback(() => {
    dispatch({ type: 'SET_ERROR', error: null });
    dispatch({ type: 'SET_TICKET', ticket: null });
    dispatch({ type: 'SET_PLAN', plan: null });
    dispatch({ type: 'SET_POLICY', decision: null });
    dispatch({ type: 'SET_STATUS', status: 'idle' });
  }, []);

  const applyInspiration = useCallback(
    (insp: Inspiration) => {
      if (isBusy) return;
      dispatch({ type: 'SET_FIELD', field: 'prompt', value: insp.prompt });
      if (insp.suggestedStyle) dispatch({ type: 'SET_FIELD', field: 'style', value: insp.suggestedStyle });
      if (insp.suggestedMaterial) dispatch({ type: 'SET_FIELD', field: 'material', value: insp.suggestedMaterial });
      if (insp.suggestedColor) dispatch({ type: 'SET_FIELD', field: 'color', value: insp.suggestedColor });
      if (insp.suggestedSizeCm) dispatch({ type: 'SET_FIELD', field: 'sizeCm', value: insp.suggestedSizeCm });

      // Clear previous run artifacts so the UI feels deterministic
      dispatch({ type: 'SET_RUN_ID', runId: null });
      dispatch({ type: 'SET_PLAN', plan: null });
      dispatch({ type: 'SET_TICKET', ticket: null });
      dispatch({ type: 'SET_POLICY', decision: null });
      dispatch({ type: 'SET_ERROR', error: null });
      dispatch({ type: 'SET_STATUS', status: 'idle' });

      toast('Inspiration applied. You can Forge Plan now.');
    },
    [isBusy, toast]
  );

  const handlePlan = useCallback(async () => {
    if (!state.prompt.trim() || isBusy) return;

    const runId = wearableStudioService.createRunId();
    dispatch({ type: 'SET_RUN_ID', runId });
    dispatch({ type: 'SET_STATUS', status: 'policy_check' });
    dispatch({ type: 'SET_ERROR', error: null });
    dispatch({ type: 'SET_TICKET', ticket: null });
    dispatch({ type: 'SET_PLAN', plan: null });

    try {
      const policyContext = wearableStudioService.buildPolicyContext(
        {
          story: request.prompt,
          style: request.style,
          type: 'gift_object',
          size: String(request.sizeCm),
          persona: request.persona,
          constraints: [],
        } as any,
        snapshot || undefined,
        'gift_forge_plan'
      );

      policyContext.signals = {
        ...(policyContext.signals || {}),
        material: request.material,
        sizeCm: request.sizeCm,
        color: request.color,
        domain: 'gift_forge',
      } as any;

      const decision = await wearableStudioService.evaluatePolicy(snapshot?.id, policyContext);
      dispatch({ type: 'SET_POLICY', decision });

      if (decision.blocked) {
        dispatch({ type: 'SET_STATUS', status: 'error' });
        const reason = decision.reasons?.[0] || 'Policy blocked this request.';
        dispatch({ type: 'SET_ERROR', error: reason });
        toast(reason, { isError: true, ms: 6500 });
        return;
      }

      dispatch({ type: 'SET_STATUS', status: 'planning' });

      const plan = buildMockPlan(request);
      dispatch({ type: 'SET_PLAN', plan });
      dispatch({ type: 'SET_STATUS', status: 'review' });
    } catch (e) {
      console.error(e);
      dispatch({ type: 'SET_STATUS', status: 'error' });
      dispatch({ type: 'SET_ERROR', error: 'Failed to create a forge plan. Please try again.' });
      toast('Failed to create a forge plan. Please try again.', { isError: true });
    }
  }, [isBusy, request, snapshot, state.prompt, toast]);

  const handleSubmit = useCallback(async () => {
    if (!state.plan) {
      dispatch({ type: 'SET_ERROR', error: 'No plan available. Please create a plan first.' });
      return;
    }
    if (!state.policyDecision?.allowed) {
      dispatch({ type: 'SET_ERROR', error: 'Policy evaluation required. Please wait for policy check to complete.' });
      return;
    }
    if (isBusy) return;

    const ensuredRunId = state.runId || wearableStudioService.createRunId();
    if (!state.runId) dispatch({ type: 'SET_RUN_ID', runId: ensuredRunId });

    dispatch({ type: 'SET_STATUS', status: 'submitting' });
    dispatch({ type: 'SET_ERROR', error: null });

    try {
      const ticket: GiftForgeTicket = {
        ticketId: `SEEDCORE-GIFT-${ensuredRunId.slice(0, 8)}`,
        runId: ensuredRunId,
        snapshotId: snapshot?.id,
        snapshotVersion: snapshot?.version,
        request,
        policyDecision: state.policyDecision!,
        plan: state.plan,
        createdAt: new Date().toISOString(),
      };

      dispatch({ type: 'SET_TICKET', ticket });

      toast('Your gift has been sent to production!');

      // Non-blocking SeedCore task creation
      (async () => {
        try {
          const taskDescription = `Gift Forge: ${request.prompt.slice(0, 120)}. Material: ${request.material}. Size: ${request.sizeCm}cm.`;
          const task = await seedcoreService.createTask({
            type: 'action',
            description: taskDescription,
            params: {
              domain: 'gift_forge',
              ticketId: ticket.ticketId,
              runId: ticket.runId,
              snapshotId: snapshot?.id,
              namespace: 'hotel',
              request,
              plan: ticket.plan,
              executor_hint: ticket.plan.executorUnitId,
            },
          });

          if (task?.id) {
            toast('Your gift is being prepared for fabrication!', { taskId: String(task.id) });
          }
        } catch (err) {
          console.error('SeedCore task creation failed (non-critical):', err);
        }
      })();

      dispatch({ type: 'SET_STATUS', status: 'done' });
    } catch (e) {
      console.error(e);
      dispatch({ type: 'SET_STATUS', status: 'error' });
      dispatch({ type: 'SET_ERROR', error: 'Unable to submit your gift. Please try again.' });
      toast('Unable to submit your gift. Please try again.', { isError: true });
    }
  }, [isBusy, request, snapshot?.id, snapshot?.version, state.plan, state.policyDecision, state.runId, toast]);

  return (
    <div className="w-full h-full bg-[#FAFAFA] text-slate-900 flex flex-col">
      {/* TOAST */}
      <ToastPopup toast={state.toast} onClose={() => dispatch({ type: 'SHOW_TOAST', toast: null })} />

      {/* HEADER */}
      <HeaderBar isBusy={isBusy} onBack={onBack} />

      {/* LAYOUT */}
      <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12">
        {/* Left */}
        <aside className="lg:col-span-4 p-6 overflow-y-auto bg-[#F8FAFC] border-r border-slate-200">
          <div className="space-y-6 max-w-md mx-auto">
            <SectionTitle icon={<Wand2 size={14} />} title="Design Inputs" subtitle="Define intent, constraints, and finish" />

            <GiftForgeForm
              prompt={state.prompt}
              style={state.style}
              material={state.material}
              sizeCm={state.sizeCm}
              color={state.color}
              isBusy={isBusy}
              onChange={(field, value) => dispatch({ type: 'SET_FIELD', field, value })}
            />

            <ForgeInspirationGallery isBusy={isBusy} onApply={applyInspiration} />

            <PolicyStatusPanel snapshot={snapshot} decision={state.policyDecision} />

            {state.error && <InlineError message={state.error} />}

            <div className="flex gap-3">
              <PrimaryButton
                onClick={handlePlan}
                disabled={!state.prompt.trim() || isBusy}
                loading={isBusy && state.status !== 'submitting'}
                label={
                  state.status === 'policy_check'
                    ? 'Running Policy...'
                    : state.status === 'planning'
                      ? 'Planning Fabrication...'
                      : 'Forge Plan'
                }
              />
              <button
                type="button"
                onClick={resetForNewPlan}
                disabled={isBusy}
                className="px-4 py-4 rounded-2xl border border-slate-200 bg-white text-slate-600 text-xs font-black uppercase tracking-widest hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Clear plan & policy results"
              >
                Reset
              </button>
            </div>

            <HintCard />
          </div>
        </aside>

        {/* Right */}
        <main className="lg:col-span-8 bg-white relative p-8 flex flex-col items-center justify-center overflow-y-auto">
          <BackgroundGrid />

          {state.plan ? (
            <div className="w-full max-w-4xl animate-in fade-in slide-in-from-bottom-8 duration-700">
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start">
                <ForgePlanPreview plan={state.plan} />
                <div className="space-y-6">
                  <ForgeTicketCard plan={state.plan} runId={state.runId} ticket={state.ticket} request={request} />
                  <ForgeActionsBar
                    disabled={!state.policyDecision?.allowed || isBusy}
                    submitting={state.status === 'submitting'}
                    onSubmit={handleSubmit}
                  />
                </div>
              </div>
            </div>
          ) : (
            <EmptyCanvas />
          )}
        </main>
      </div>
    </div>
  );
}

/** ---------------------------
 *  UI: Header / Toast / Decorations
 *  -------------------------- */
function HeaderBar(props: { isBusy: boolean; onBack: () => void }) {
  const { isBusy, onBack } = props;
  return (
    <div className="flex-shrink-0 px-8 py-6 flex items-center justify-between bg-white border-b border-amber-100">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-2 rounded-full hover:bg-slate-100 text-slate-500 hover:text-amber-600 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Box className="text-amber-500" size={24} />
            Gift Forge
          </h1>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Craft Objects Into Reality</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="px-3 py-1 bg-amber-50 text-amber-700 text-[10px] font-bold uppercase tracking-widest rounded-full border border-amber-100">
          {isBusy ? 'Forging...' : 'Forge Ready'}
        </div>
      </div>
    </div>
  );
}

function BackgroundGrid() {
  return (
    <div
      className="absolute inset-0 opacity-[0.03] pointer-events-none"
      style={{ backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)', backgroundSize: '24px 24px' }}
    />
  );
}

function ToastPopup(props: { toast: Toast; onClose: () => void }) {
  if (!props.toast) return null;
  return (
    <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-right fade-in duration-300 pointer-events-auto">
      <div
        className={`rounded-xl shadow-xl p-4 max-w-md flex items-start gap-3 ${
          props.toast.isError ? 'bg-amber-50 border border-amber-200' : 'bg-emerald-50 border border-emerald-200'
        }`}
      >
        {props.toast.isError ? (
          <ShieldAlert className="text-amber-600 flex-shrink-0 mt-0.5" size={20} />
        ) : (
          <CheckCircle2 className="text-emerald-600 flex-shrink-0 mt-0.5" size={20} />
        )}
        <div className="flex-1">
          <p className={`text-sm font-semibold ${props.toast.isError ? 'text-amber-900' : 'text-emerald-900'}`}>{props.toast.message}</p>
          {props.toast.taskId && (
            <p className={`text-xs mt-2 opacity-70 ${props.toast.isError ? 'text-amber-600' : 'text-emerald-600'}`}>
              Reference: {props.toast.taskId.slice(0, 8)}...
            </p>
          )}
        </div>
        <button
          onClick={props.onClose}
          className={`transition-colors flex-shrink-0 ${
            props.toast.isError ? 'text-amber-600 hover:text-amber-800' : 'text-emerald-600 hover:text-emerald-800'
          }`}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

function SectionTitle(props: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div>
      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-600">
        {props.icon}
        {props.title}
      </div>
      {props.subtitle ? <div className="text-[11px] text-slate-400 mt-1">{props.subtitle}</div> : null}
    </div>
  );
}

function InlineError({ message }: { message: string }) {
  return <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-xl px-4 py-3">{message}</div>;
}

function HintCard() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Tip</div>
      <p className="text-xs text-slate-600 mt-2 leading-relaxed">
        Keep prompts <span className="font-bold text-slate-800">concrete</span>: shape + function + finish. You’ll get better plans and fewer policy hits.
      </p>
    </div>
  );
}

/** ---------------------------
 *  UI: Form + Inspiration Gallery
 *  -------------------------- */
function GiftForgeForm(props: {
  prompt: string;
  style: string;
  material: Material;
  sizeCm: number;
  color: string;
  isBusy: boolean;
  onChange: (field: any, value: any) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <label className="text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
          <Sparkles size={14} /> Gift Intent
        </label>
        <textarea
          value={props.prompt}
          onChange={(e) => props.onChange('prompt', e.target.value)}
          placeholder="E.g., a small golden keychain shaped like a dragon, with minimalist engravings..."
          className="w-full h-40 p-4 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 resize-none shadow-sm transition-all placeholder:text-slate-300 font-medium"
          disabled={props.isBusy}
        />
        <p className="text-[10px] text-slate-400 leading-relaxed">
          Describe the object you want to craft. Later, PKG facts will constrain materials, sizes, and delivery based on the hotel world model.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <SelectField
          label="Style"
          value={props.style}
          disabled={props.isBusy}
          onChange={(v) => props.onChange('style', v)}
          options={['Minimalist', 'Cyberpunk', 'Boho', 'Vintage', 'Abstract Art', 'Streetwear']}
        />
        <SelectField
          label="Material"
          value={props.material}
          disabled={props.isBusy}
          onChange={(v) => props.onChange('material', v)}
          options={[...MATERIALS]}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <NumberField
          label="Size (cm)"
          value={props.sizeCm}
          min={3}
          max={50}
          disabled={props.isBusy}
          onChange={(v) => props.onChange('sizeCm', v)}
        />
        <TextField label="Color" value={props.color} disabled={props.isBusy} onChange={(v) => props.onChange('color', v)} placeholder="White" />
      </div>
    </div>
  );
}

function SelectField(props: { label: string; value: any; options: string[]; disabled: boolean; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{props.label}</label>
      <select
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        className="w-full p-3 rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-700 focus:outline-none focus:border-amber-500 appearance-none"
        disabled={props.disabled}
      >
        {props.options.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </div>
  );
}

function NumberField(props: { label: string; value: number; min: number; max: number; disabled: boolean; onChange: (v: number) => void }) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{props.label}</label>
      <input
        type="number"
        min={props.min}
        max={props.max}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="w-full p-3 rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-700 focus:outline-none focus:border-amber-500"
        disabled={props.disabled}
      />
    </div>
  );
}

function TextField(props: { label: string; value: string; placeholder?: string; disabled: boolean; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{props.label}</label>
      <input
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        className="w-full p-3 rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-700 focus:outline-none focus:border-amber-500"
        disabled={props.disabled}
        placeholder={props.placeholder}
      />
    </div>
  );
}

function ForgeInspirationGallery(props: { isBusy: boolean; onApply: (insp: Inspiration) => void }) {
  const copyPrompt = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] uppercase tracking-widest font-black text-slate-400 flex items-center gap-2">
          <ImageIcon size={12} />
          Inspirations
        </div>
        <div className="text-[10px] font-bold text-slate-400">01–04</div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {FORGE_INSPIRATIONS.map((insp) => (
          <div key={insp.id} className="group rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm hover:shadow-md transition-shadow">
            <div className="aspect-[4/3] bg-slate-50 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={insp.src} alt={insp.title} className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform" />
            </div>

            <div className="p-3 space-y-2">
              <div className="text-xs font-black text-slate-800">{insp.title}</div>
              <div className="text-[10px] text-slate-400 leading-relaxed line-clamp-3">{insp.prompt}</div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={props.isBusy}
                  onClick={() => props.onApply(insp)}
                  className="flex-1 py-2 rounded-lg bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Apply
                </button>
                <button
                  type="button"
                  onClick={() => copyPrompt(insp.prompt)}
                  className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                  title="Copy prompt"
                >
                  <Copy size={14} />
                </button>
              </div>

              {(insp.suggestedMaterial || insp.suggestedStyle) && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {insp.suggestedStyle ? (
                    <span className="px-2 py-1 rounded-full bg-amber-50 border border-amber-100 text-[9px] font-black uppercase tracking-widest text-amber-700">
                      {insp.suggestedStyle}
                    </span>
                  ) : null}
                  {insp.suggestedMaterial ? (
                    <span className="px-2 py-1 rounded-full bg-slate-50 border border-slate-200 text-[9px] font-black uppercase tracking-widest text-slate-600">
                      {insp.suggestedMaterial}
                    </span>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 text-[10px] text-slate-400">
        Images live in <span className="font-mono">public/assets/forges/</span> and are referenced via <span className="font-mono">/assets/forges/0X.png</span>.
      </div>
    </div>
  );
}

/** ---------------------------
 *  UI: Policy Panel
 *  -------------------------- */
function PolicyStatusPanel(props: { snapshot: Snapshot | null; decision: PolicyDecision | null }) {
  const decision = props.decision;
  const badge = decision?.blocked
    ? { label: 'Blocked', icon: <ShieldX size={14} className="text-rose-600" />, color: 'text-rose-600' }
    : decision?.allowed
      ? { label: 'Allowed', icon: <ShieldCheck size={14} className="text-emerald-600" />, color: 'text-emerald-600' }
      : { label: 'Pending', icon: <ShieldAlert size={14} className="text-amber-600" />, color: 'text-amber-600' };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-widest font-black text-slate-400">Policy Gate</div>
        <div className={`flex items-center gap-2 text-xs font-black ${badge.color}`}>
          {badge.icon}
          {badge.label}
        </div>
      </div>

      <div className="mt-3 space-y-2 text-xs text-slate-600 font-medium">
        <div>
          Snapshot: <span className="font-black text-slate-800">{props.snapshot?.version || 'unavailable'}</span>
        </div>
        {decision?.reasons?.length ? (
          <div className="text-[11px] text-slate-500">{decision.reasons.slice(0, 2).join(' · ')}</div>
        ) : (
          <div className="text-[11px] text-slate-400">Policy evaluation ready.</div>
        )}
        {decision?.ruleHits?.length ? (
          <div className="text-[10px] text-slate-400 uppercase tracking-widest">
            Hits: {decision.ruleHits.slice(0, 3).map((hit: any) => hit.ruleName).join(', ')}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** ---------------------------
 *  UI: Buttons + Preview + Ticket + Actions
 *  -------------------------- */
function PrimaryButton(props: { onClick: () => void; disabled: boolean; loading: boolean; label: string }) {
  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      className="w-full py-5 bg-gradient-to-r from-amber-600 to-yellow-500 text-white rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-amber-200 hover:shadow-amber-300 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
    >
      {props.loading ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
      {props.label}
    </button>
  );
}

function ForgePlanPreview({ plan }: { plan: GiftForgePlan }) {
  return (
    <div className="bg-white p-4 rounded-3xl shadow-2xl border border-slate-100">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Fabrication Plan</div>
        <div className="px-3 py-1 bg-amber-50 text-amber-700 text-[10px] font-black uppercase tracking-widest rounded-full border border-amber-100">
          {plan.estimatedMinutes ? `~${plan.estimatedMinutes} min` : 'Estimated'}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="text-xs font-black text-slate-800 flex items-center gap-2">
          <Box size={16} className="text-amber-600" />
          Executor: <span className="font-mono text-slate-700">{plan.executorUnitId}</span>
        </div>

        <ol className="mt-4 space-y-2">
          {plan.steps.map((s, idx) => (
            <li key={idx} className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-white border border-slate-200 flex items-center justify-center text-[10px] font-black text-slate-600">
                {idx + 1}
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-slate-800">{s.name}</div>
                <div className="text-[10px] uppercase tracking-widest text-slate-400 font-black">{s.type}</div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function ForgeTicketCard(props: { plan: GiftForgePlan; runId: string | null; ticket: GiftForgeTicket | null; request: GiftForgeRequest }) {
  const { ticket, runId, plan, request } = props;

  return (
    <div className="bg-[#FFFDF5] p-6 rounded-xl border border-amber-100 shadow-sm relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500 via-yellow-500 to-emerald-500" />

      <h3 className="font-black text-2xl text-slate-900 mb-1">Production Ticket</h3>
      <p className="text-[10px] font-mono uppercase tracking-widest text-slate-400 mb-6">
        #{ticket?.ticketId || `RUN-${runId?.slice(0, 8) || 'pending'}`}
      </p>

      <div className="space-y-4">
        <div>
          <span className="text-[9px] font-black uppercase text-slate-400 block mb-1">Gift Intent</span>
          <p className="text-sm font-serif italic text-slate-700 leading-relaxed">"{request.prompt}"</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 bg-white rounded-lg border border-slate-100">
            <div className="flex items-center gap-2 mb-1 text-amber-500">
              <Layers size={12} /> <span className="text-[9px] font-black uppercase">Material</span>
            </div>
            <span className="text-xs font-black text-slate-700">{request.material}</span>
          </div>
          <div className="p-3 bg-white rounded-lg border border-slate-100">
            <div className="flex items-center gap-2 mb-1 text-emerald-500">
              <Scissors size={12} /> <span className="text-[9px] font-black uppercase">Size</span>
            </div>
            <span className="text-xs font-black text-slate-700">{request.sizeCm} cm</span>
          </div>
        </div>

        <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
          <span className="text-[9px] font-black uppercase text-slate-400 block mb-1">Executor</span>
          <span className="text-xs font-mono text-slate-600">{plan.executorUnitId}</span>
        </div>
      </div>
    </div>
  );
}

function ForgeActionsBar(props: { disabled: boolean; submitting: boolean; onSubmit: () => void }) {
  const { disabled, submitting, onSubmit } = props;

  return (
    <div className="flex gap-3">
      <button
        onClick={() => {
          if (disabled || submitting) return;
          onSubmit();
        }}
        type="button"
        className={`flex-1 py-4 rounded-xl font-black uppercase tracking-widest text-xs transition-colors flex items-center justify-center gap-2 ${
          disabled || submitting ? 'bg-slate-400 text-slate-200 cursor-not-allowed opacity-60' : 'bg-slate-900 text-white hover:bg-slate-800'
        }`}
        title={disabled ? 'Policy must allow submission' : 'Send to fabrication'}
      >
        {submitting ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />} Send to Fabrication
      </button>

      <button
        className="px-6 py-4 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors"
        disabled={submitting}
        type="button"
        title="Download ticket (coming soon)"
        onClick={() => {
          // Later: export ticket as PDF/JSON
        }}
      >
        <Download size={18} />
      </button>
    </div>
  );
}

function EmptyCanvas() {
  return (
    <div className="text-center opacity-40">
      <div className="w-32 h-32 bg-slate-100 rounded-full mx-auto mb-6 flex items-center justify-center border-4 border-slate-50">
        <Box size={48} className="text-slate-300" />
      </div>
      <h3 className="text-xl font-black text-slate-900 uppercase tracking-widest mb-2">Forge Empty</h3>
      <p className="max-w-xs mx-auto text-sm text-slate-500 font-medium">Describe your gift on the left—or apply an inspiration—to begin fabrication planning.</p>
    </div>
  );
}
