import React, { useEffect, useReducer, useState } from 'react';
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
} from 'lucide-react';

import { wearableStudioService } from '../../services/wearableStudioService';
import { seedcoreService } from '../../services/seedcoreService';
import type { PolicyDecision } from '../../services/wearableStudioTypes';
import type { Snapshot } from '../../types';

interface Props {
  onBack: () => void;
}

/** ----- Gift Forge Domain (future PKG compatible) ----- */
const MATERIALS = ['PLA', 'Resin', 'Metal', 'Wood', 'Textile'] as const;
type Material = typeof MATERIALS[number];


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

  error: string | null;
  notification: { message: string; taskId?: string; isError?: boolean } | null;
};

type Action =
  | { type: 'SET_FIELD'; field: keyof Pick<State, 'prompt' | 'style' | 'material' | 'sizeCm' | 'color'>; value: any }
  | { type: 'SET_STATUS'; status: GiftStatus }
  | { type: 'SET_RUN_ID'; runId: string | null }
  | { type: 'SET_POLICY'; decision: PolicyDecision | null }
  | { type: 'SET_PLAN'; plan: GiftForgePlan | null }
  | { type: 'SET_TICKET'; ticket: GiftForgeTicket | null }
  | { type: 'SET_ERROR'; error: string | null }
  | { type: 'SET_NOTIFICATION'; notification: State['notification'] };

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
  notification: null,
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
    case 'SET_NOTIFICATION':
      return { ...state, notification: action.notification };
    default:
      return state;
  }
}

/** ----- Mock Planner (replace later with PKG subtasks DAG) ----- */
function buildMockPlan(request: GiftForgeRequest): GiftForgePlan {
  // Future: select executor using governed facts (unit:3d_printer_01 capabilities & constraints)
  const executorUnitId = 'unit:3d_printer_01';

  const steps: GiftForgePlan['steps'] = [
    {
      name: 'Generate 3D model from prompt',
      type: 'action',
      params: { engine: 'mock', prompt: request.prompt, style: request.style },
    },
    { name: 'Slice model for printer', type: 'action', params: { material: request.material, sizeCm: request.sizeCm } },
    { name: 'Print object', type: 'action', params: { unit: executorUnitId, color: request.color } },
    { name: 'Quality check', type: 'check', params: { tolerance: 'standard' } },
    { name: 'Notify guest', type: 'notify' },
  ];

  const estimatedMinutes = 60;

  return { executorUnitId, steps, estimatedMinutes };
}

/** ----- Main Page ----- */
export function GiftForgePage({ onBack }: Props) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [state, dispatch] = useReducer(reducer, initialState);

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

  const request: GiftForgeRequest = {
    prompt: state.prompt,
    style: state.style,
    material: state.material,
    sizeCm: Number(state.sizeCm) || 12,
    color: state.color,
    persona: 'guest',
  };

  const isBusy = ['policy_check', 'planning', 'submitting'].includes(state.status);

  const showToast = (message: string, opts?: { taskId?: string; isError?: boolean; ms?: number }) => {
    dispatch({ type: 'SET_NOTIFICATION', notification: { message, taskId: opts?.taskId, isError: opts?.isError } });
    setTimeout(() => dispatch({ type: 'SET_NOTIFICATION', notification: null }), opts?.ms ?? 5000);
  };

  const handlePlan = async () => {
    if (!state.prompt.trim() || isBusy) return;

    const runId = wearableStudioService.createRunId();
    dispatch({ type: 'SET_RUN_ID', runId });
    dispatch({ type: 'SET_STATUS', status: 'policy_check' });
    dispatch({ type: 'SET_ERROR', error: null });
    dispatch({ type: 'SET_TICKET', ticket: null });
    dispatch({ type: 'SET_PLAN', plan: null });

    try {
      // Policy gate: reuse existing policy evaluator pipeline
      const policyContext = wearableStudioService.buildPolicyContext(
        {
          // minimal intent-like object; policy service typically reads from signals/tags
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

      // Provide signals that are useful for rules
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
        dispatch({ type: 'SET_ERROR', error: decision.reasons?.[0] || 'Policy blocked this request.' });
        showToast(decision.reasons?.[0] || 'Request blocked by policy.', { isError: true, ms: 6500 });
        return;
      }

      dispatch({ type: 'SET_STATUS', status: 'planning' });

      // Planner: mock for now, later swap to PKG DAG generation
      const plan = buildMockPlan(request);
      dispatch({ type: 'SET_PLAN', plan });
      dispatch({ type: 'SET_STATUS', status: 'review' });
    } catch (e) {
      console.error(e);
      dispatch({ type: 'SET_STATUS', status: 'error' });
      dispatch({ type: 'SET_ERROR', error: 'Failed to create a forge plan. Please try again.' });
      showToast('Failed to create a forge plan. Please try again.', { isError: true });
    }
  };

  const handleSubmit = async () => {
    if (!state.plan) {
      dispatch({ type: 'SET_ERROR', error: 'No plan available. Please create a plan first.' });
      return;
    }
    if (!state.policyDecision?.allowed) {
      dispatch({ type: 'SET_ERROR', error: 'Policy evaluation required. Please wait for policy check to complete.' });
      return;
    }
    if (!state.runId) {
      dispatch({ type: 'SET_RUN_ID', runId: wearableStudioService.createRunId() });
    }
    if (isBusy) return;

    dispatch({ type: 'SET_STATUS', status: 'submitting' });
    dispatch({ type: 'SET_ERROR', error: null });

    try {
      const ticket: GiftForgeTicket = {
        ticketId: `SEEDCORE-GIFT-${(state.runId || wearableStudioService.createRunId()).slice(0, 8)}`,
        runId: state.runId || wearableStudioService.createRunId(),
        snapshotId: snapshot?.id,
        snapshotVersion: snapshot?.version,
        request,
        policyDecision: state.policyDecision!,
        plan: state.plan,
        createdAt: new Date().toISOString(),
      };

      dispatch({ type: 'SET_TICKET', ticket });

      // User-friendly success (like Wearable Studio)
      showToast('Your gift has been sent to production!');

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
            const taskIdStr = String(task.id);
            showToast('Your gift is being prepared for fabrication!', { taskId: taskIdStr });
          }
        } catch (err) {
          console.error('SeedCore task creation failed (non-critical):', err);
          // Keep the initial success toast; optionally show a mild warning:
          // showToast('Production queued. Live tracking will appear once the system is available.', { isError: true, ms: 6500 });
        }
      })();

      dispatch({ type: 'SET_STATUS', status: 'done' });
    } catch (e) {
      console.error(e);
      dispatch({ type: 'SET_STATUS', status: 'error' });
      dispatch({ type: 'SET_ERROR', error: 'Unable to submit your gift. Please try again.' });
      showToast('Unable to submit your gift. Please try again.', { isError: true });
    }
  };

  return (
    <div className="w-full h-full bg-[#FAFAFA] text-slate-900 flex flex-col">
      {/* --- NOTIFICATION POPUP --- */}
      {state.notification && (
        <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-right fade-in duration-300 pointer-events-auto">
          <div
            className={`rounded-xl shadow-xl p-4 max-w-md flex items-start gap-3 ${
              state.notification.isError ? 'bg-amber-50 border border-amber-200' : 'bg-emerald-50 border border-emerald-200'
            }`}
          >
            {state.notification.isError ? (
              <ShieldAlert className="text-amber-600 flex-shrink-0 mt-0.5" size={20} />
            ) : (
              <CheckCircle2 className="text-emerald-600 flex-shrink-0 mt-0.5" size={20} />
            )}
            <div className="flex-1">
              <p className={`text-sm font-semibold ${state.notification.isError ? 'text-amber-900' : 'text-emerald-900'}`}>
                {state.notification.message}
              </p>
              {state.notification.taskId && (
                <p className={`text-xs mt-2 opacity-70 ${state.notification.isError ? 'text-amber-600' : 'text-emerald-600'}`}>
                  Reference: {state.notification.taskId.slice(0, 8)}...
                </p>
              )}
            </div>
            <button
              onClick={() => dispatch({ type: 'SET_NOTIFICATION', notification: null })}
              className={`transition-colors flex-shrink-0 ${
                state.notification.isError ? 'text-amber-600 hover:text-amber-800' : 'text-emerald-600 hover:text-emerald-800'
              }`}
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* --- HEADER --- */}
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

      {/* --- MAIN CONTENT GRID --- */}
      <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12">
        {/* LEFT: INPUT PANEL */}
        <div className="lg:col-span-4 p-6 overflow-y-auto bg-[#F8FAFC] border-r border-slate-200">
          <div className="space-y-6 max-w-md mx-auto">
            <GiftForgeForm
              prompt={state.prompt}
              style={state.style}
              material={state.material}
              sizeCm={state.sizeCm}
              color={state.color}
              isBusy={isBusy}
              onChange={(field, value) => dispatch({ type: 'SET_FIELD', field, value })}
            />

            <PolicyStatusPanel snapshot={snapshot} decision={state.policyDecision} status={state.status} />

            {state.error && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-xl px-4 py-3">{state.error}</div>
            )}

            <hr className="border-slate-200" />

            <button
              onClick={handlePlan}
              disabled={!state.prompt.trim() || isBusy}
              className="w-full py-5 bg-gradient-to-r from-amber-600 to-yellow-500 text-white rounded-2xl font-bold uppercase tracking-widest shadow-xl shadow-amber-200 hover:shadow-amber-300 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
            >
              {isBusy && state.status !== 'submitting' ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
              {state.status === 'policy_check'
                ? 'Running Policy...'
                : state.status === 'planning'
                ? 'Planning Fabrication...'
                : 'Forge Plan'}
            </button>
          </div>
        </div>

        {/* RIGHT: REVIEW PANEL */}
        <div className="lg:col-span-8 bg-white relative p-8 flex flex-col items-center justify-center overflow-y-auto">
          <div
            className="absolute inset-0 opacity-[0.03] pointer-events-none"
            style={{ backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)', backgroundSize: '24px 24px' }}
          />

          {state.plan ? (
            <div className="w-full max-w-3xl animate-in fade-in slide-in-from-bottom-8 duration-700">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
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
        </div>
      </div>
    </div>
  );
}

/** ----- UI Components ----- */
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
    <>
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
        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Style</label>
          <select
            value={props.style}
            onChange={(e) => props.onChange('style', e.target.value)}
            className="w-full p-3 rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-700 focus:outline-none focus:border-amber-500 appearance-none"
            disabled={props.isBusy}
          >
            {['Minimalist', 'Cyberpunk', 'Boho', 'Vintage', 'Abstract Art', 'Streetwear'].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Material</label>
          <select
            value={props.material}
            onChange={(e) => props.onChange('material', e.target.value)}
            className="w-full p-3 rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-700 focus:outline-none focus:border-amber-500 appearance-none"
            disabled={props.isBusy}
          >
            {MATERIALS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Size (cm)</label>
          <input
            type="number"
            min={3}
            max={50}
            value={props.sizeCm}
            onChange={(e) => props.onChange('sizeCm', Number(e.target.value))}
            className="w-full p-3 rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-700 focus:outline-none focus:border-amber-500"
            disabled={props.isBusy}
          />
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Color</label>
          <input
            value={props.color}
            onChange={(e) => props.onChange('color', e.target.value)}
            className="w-full p-3 rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-700 focus:outline-none focus:border-amber-500"
            disabled={props.isBusy}
            placeholder="White"
          />
        </div>
      </div>

    </>
  );
}

function PolicyStatusPanel(props: { snapshot: Snapshot | null; decision: PolicyDecision | null; status: GiftStatus }) {
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

function ForgePlanPreview({ plan }: { plan: GiftForgePlan }) {
  return (
    <div className="bg-white p-4 rounded-3xl shadow-2xl border border-slate-100">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Fabrication Plan</div>
        <div className="px-3 py-1 bg-amber-50 text-amber-700 text-[10px] font-bold uppercase tracking-widest rounded-full border border-amber-100">
          {plan.estimatedMinutes ? `~${plan.estimatedMinutes} min` : 'Estimated'}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="text-xs font-bold text-slate-800 flex items-center gap-2">
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
                <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">{s.type}</div>
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
          <span className="text-[9px] font-bold uppercase text-slate-400 block mb-1">Gift Intent</span>
          <p className="text-sm font-serif italic text-slate-700 leading-relaxed">"{request.prompt}"</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 bg-white rounded-lg border border-slate-100">
            <div className="flex items-center gap-2 mb-1 text-amber-500">
              <Layers size={12} /> <span className="text-[9px] font-bold uppercase">Material</span>
            </div>
            <span className="text-xs font-bold text-slate-700">{request.material}</span>
          </div>
          <div className="p-3 bg-white rounded-lg border border-slate-100">
            <div className="flex items-center gap-2 mb-1 text-emerald-500">
              <Scissors size={12} /> <span className="text-[9px] font-bold uppercase">Size</span>
            </div>
            <span className="text-xs font-bold text-slate-700">{request.sizeCm} cm</span>
          </div>
        </div>

        <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
          <span className="text-[9px] font-bold uppercase text-slate-400 block mb-1">Executor</span>
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
        className={`flex-1 py-4 rounded-xl font-bold uppercase tracking-widest text-xs transition-colors flex items-center justify-center gap-2 ${
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
      <h3 className="text-xl font-bold text-slate-900 uppercase tracking-widest mb-2">Forge Empty</h3>
      <p className="max-w-xs mx-auto text-sm text-slate-500 font-medium">Describe your gift on the left to begin fabrication planning.</p>
    </div>
  );
}
