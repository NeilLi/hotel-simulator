import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Download,
  Eye,
  History,
  Layers,
  Loader2,
  Printer,
  Scissors,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Shirt,
  Sparkles,
  Wand2,
  X,
  Box,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from 'lucide-react';

import { wearableStudioService } from '../../services/wearableStudioService';
import { seedcoreService, type PKGEvaluateResponse } from '../../services/seedcoreService';
import type { PolicyDecision, WearableDesignDraft, WearableIntent, WearableTicket } from '../../services/wearableStudioTypes';
import type { Snapshot } from '../../types';
import { MockRenderService, type RenderEmissionParams, svgFallbackDataUrl } from '../../services/digitalTwinRenderer';
import { buildMfgPKGRequest, buildPreviewPKGRequest } from '../../services/pkgRequests';

const API_BASE_URL = import.meta.env.VITE_DB_PROXY_URL || 'http://localhost:3001';

type StudioStatus = 'idle' | 'policy_check' | 'generating' | 'review' | 'submitting' | 'done' | 'error';

const STYLES_LIST = ['Minimalist', 'Cyberpunk', 'Boho', 'Vintage', 'Abstract Art', 'Streetwear'] as const;
const SIZES_LIST = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const;
const TYPES_LIST = ['T-Shirt', 'Hoodie', 'Jacket', 'Tote Bag'] as const;

interface Props {
  onBack: () => void;
}

interface DesignUpload {
  id: number;
  runId: string;
  suffix: 'print' | 'mockup';
  url: string;
  gcsPath: string;
  applied: boolean;
  appliedAt: string | null;
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

interface DesignHistory {
  print: DesignUpload | null;
  mockup: DesignUpload | null;
  history: DesignUpload[];
}

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
  notification: { message: string; taskId?: string; isError?: boolean } | null;

  showPreview: boolean;
  previewSnapshot: string | null;
  previewPKGResponse: PKGEvaluateResponse | null;

  designHistory: DesignHistory | null;
  loadingHistory: boolean;
};

type StudioAction =
  | { type: 'SET_FIELD'; field: 'story' | 'style' | 'size' | 'type'; value: string }
  | { type: 'SET_STATUS'; status: StudioStatus }
  | { type: 'SET_POLICY'; decision: PolicyDecision | null }
  | { type: 'SET_DESIGN'; design: WearableDesignDraft | null }
  | { type: 'SET_RUN_ID'; runId: string | null }
  | { type: 'SET_TICKET'; ticket: WearableTicket | null }
  | { type: 'SET_ERROR'; error: string | null }
  | { type: 'SET_NOTIFICATION'; notification: { message: string; taskId?: string; isError?: boolean } | null }
  | { type: 'SET_PREVIEW'; show: boolean; snapshot?: string | null; pkgResponse?: PKGEvaluateResponse | null }
  | { type: 'SET_DESIGN_HISTORY'; history: DesignHistory | null }
  | { type: 'SET_LOADING_HISTORY'; loading: boolean }
  | { type: 'UPDATE_DESIGN_APPLIED'; runId: string; suffix: 'print' | 'mockup'; applied: boolean }
  | { type: 'RECONSTRUCT_DESIGN_FROM_HISTORY' };

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
  notification: null,

  showPreview: false,
  previewSnapshot: null,
  previewPKGResponse: null,

  designHistory: null,
  loadingHistory: false,
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
    case 'SET_NOTIFICATION':
      return { ...state, notification: action.notification };
    case 'SET_PREVIEW':
      return { 
        ...state, 
        showPreview: action.show, 
        previewSnapshot: action.snapshot ?? null,
        previewPKGResponse: action.pkgResponse ?? (action.show ? state.previewPKGResponse : null)
      };
    case 'SET_DESIGN_HISTORY':
      return { ...state, designHistory: action.history };
    case 'SET_LOADING_HISTORY':
      return { ...state, loadingHistory: action.loading };
    case 'UPDATE_DESIGN_APPLIED': {
      if (!state.designHistory) return state;

      const now = action.applied ? new Date().toISOString() : null;

      const updated: DesignHistory = {
        ...state.designHistory,
        print:
          action.suffix === 'print' && state.designHistory.print?.runId === action.runId
            ? { ...state.designHistory.print, applied: action.applied, appliedAt: now }
            : state.designHistory.print,
        mockup:
          action.suffix === 'mockup' && state.designHistory.mockup?.runId === action.runId
            ? { ...state.designHistory.mockup, applied: action.applied, appliedAt: now }
            : state.designHistory.mockup,
        history: (state.designHistory.history || []).map((h) =>
          h.runId === action.runId && h.suffix === action.suffix ? { ...h, applied: action.applied, appliedAt: now } : h
        ),
      };

      return { ...state, designHistory: updated };
    }
    case 'RECONSTRUCT_DESIGN_FROM_HISTORY': {
      if (!state.designHistory || state.designDraft) return state;

      const hasAppliedPrint = state.designHistory.print?.applied;
      const hasAppliedMockup = state.designHistory.mockup?.applied;

      if (!hasAppliedPrint && !hasAppliedMockup) return state;

      // Reconstruct a minimal designDraft from history
      const printUrl = state.designHistory.print?.url || null;
      const mockupUrl = state.designHistory.mockup?.url || null;
      const printMetadata = state.designHistory.print?.metadata || {};
      const mockupMetadata = state.designHistory.mockup?.metadata || {};

      // Try to extract design info from metadata, or use defaults
      const reconstructedDesign: WearableDesignDraft = {
        designConcept: printMetadata.designConcept || mockupMetadata.designConcept || 'Design from history',
        fabricType: printMetadata.fabricType || mockupMetadata.fabricType || 'Cotton',
        threadCount: printMetadata.threadCount || mockupMetadata.threadCount || 200,
        careInstructions: printMetadata.careInstructions || mockupMetadata.careInstructions || 'Machine wash cold',
        printSpec: printMetadata.printSpec || {
          palette: ['#000000'],
          placement: printMetadata.placement || 'FRONT',
          repeat: 'no-repeat',
          dpi: 300,
        },
        safetyTags: printMetadata.safetyTags || mockupMetadata.safetyTags || [],
        complianceNotes: printMetadata.complianceNotes || mockupMetadata.complianceNotes || [],
        printImageUrl: printUrl,
        mockupImageUrl: mockupUrl,
        imageUrl: printUrl || mockupUrl || null,
      };

      return { ...state, designDraft: reconstructedDesign };
    }
    default:
      return state;
  }
}

function safeDateTime(s: string) {
  try {
    return new Date(s).toLocaleString();
  } catch {
    return s;
  }
}

/* ---------------------------------------------
 * Main Component
 * ------------------------------------------- */

export function WearableStoryStudio({ onBack }: Props) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [state, dispatch] = useReducer(reducer, initialState);
  const renderServiceRef = useRef(new MockRenderService());

  const intent: WearableIntent = useMemo(
    () => ({
      story: state.story,
      style: state.style,
      type: state.type,
      size: state.size,
      persona: 'guest',
      constraints: [],
    }),
    [state.story, state.style, state.type, state.size]
  );

  const isBusy = useMemo(() => ['policy_check', 'generating', 'submitting'].includes(state.status), [state.status]);

  const notify = useCallback((message: string, opts?: { isError?: boolean; taskId?: string; ttlMs?: number }) => {
    dispatch({ type: 'SET_NOTIFICATION', notification: { message, isError: opts?.isError, taskId: opts?.taskId } });
    const ttl = opts?.ttlMs ?? (opts?.isError ? 8000 : 5000);
    window.setTimeout(() => dispatch({ type: 'SET_NOTIFICATION', notification: null }), ttl);
  }, []);

  // Restore last runId from localStorage on mount
  useEffect(() => {
    const lastRunId = localStorage.getItem('wearable:lastRunId');
    if (lastRunId) {
      dispatch({ type: 'SET_RUN_ID', runId: lastRunId });
    }
  }, []);

  // Snapshot load
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

  // Cleanup render service on unmount
  useEffect(() => {
    return () => {
      renderServiceRef.current.dispose();
    };
  }, []);

  // History fetcher (abort-safe)
  const fetchDesignHistory = useCallback(
    async (runId: string, signal?: AbortSignal) => {
      dispatch({ type: 'SET_LOADING_HISTORY', loading: true });
      try {
        const res = await fetch(`${API_BASE_URL}/api/designs/run/${runId}`, { signal });
        if (!res.ok) {
          dispatch({ type: 'SET_DESIGN_HISTORY', history: { print: null, mockup: null, history: [] } });
          return;
        }
        const data = (await res.json()) as DesignHistory;
        dispatch({ type: 'SET_DESIGN_HISTORY', history: data });
      } catch (e) {
        if ((e as any)?.name === 'AbortError') return;
        dispatch({ type: 'SET_DESIGN_HISTORY', history: { print: null, mockup: null, history: [] } });
      } finally {
        dispatch({ type: 'SET_LOADING_HISTORY', loading: false });
      }
    },
    []
  );

  // Log runId changes for debugging
  useEffect(() => {
    console.log('[WearableStudio] runId changed:', state.runId);
  }, [state.runId]);

  // Fetch history whenever runId changes
  useEffect(() => {
    if (!state.runId) {
      dispatch({ type: 'SET_DESIGN_HISTORY', history: null });
      return;
    }
    console.log('[DesignHistory] Fetching history for runId:', state.runId);
    const ac = new AbortController();
    fetchDesignHistory(state.runId, ac.signal);
    return () => ac.abort();
  }, [state.runId, fetchDesignHistory]);

  // Reconstruct designDraft from history when history is loaded with applied items
  useEffect(() => {
    if (state.designHistory && !state.designDraft) {
      const hasAppliedPrint = state.designHistory.print?.applied;
      const hasAppliedMockup = state.designHistory.mockup?.applied;

      if (hasAppliedPrint || hasAppliedMockup) {
        dispatch({ type: 'RECONSTRUCT_DESIGN_FROM_HISTORY' });
      }
    }
  }, [state.designHistory, state.designDraft]);

  // Helper: refresh history shortly after uploads
  const refreshHistorySoon = useCallback(
    (runId: string, delayMs = 2000) => {
      window.setTimeout(() => {
        const ac = new AbortController();
        fetchDesignHistory(runId, ac.signal);
      }, delayMs);
    },
    [fetchDesignHistory]
  );

  const handleGenerate = useCallback(async () => {
    if (!state.story.trim() || isBusy) return;

    const runId = wearableStudioService.createRunId();
    dispatch({ type: 'SET_RUN_ID', runId });
    localStorage.setItem('wearable:lastRunId', runId);
    dispatch({ type: 'SET_STATUS', status: 'policy_check' });
    dispatch({ type: 'SET_ERROR', error: null });
    dispatch({ type: 'SET_DESIGN', design: null });
    dispatch({ type: 'SET_TICKET', ticket: null });

    try {
      const policyContext = wearableStudioService.buildPolicyContext(intent, snapshot || undefined, 'generate_design');
      const policyDecision = await wearableStudioService.evaluatePolicy(snapshot?.id, policyContext);
      dispatch({ type: 'SET_POLICY', decision: policyDecision });

      if (policyDecision.blocked) {
        await wearableStudioService.appendMemory(
          {
            tier: 'event_working',
            category: 'wearable_design_attempt',
            content: state.story.slice(0, 280),
            metadata: { intent, policyDecision, snapshot, runId, source_modality: 'text' },
          },
          runId
        );

        dispatch({ type: 'SET_STATUS', status: 'error' });
        dispatch({ type: 'SET_ERROR', error: policyDecision.reasons?.[0] || 'Policy blocked this request.' });
        return;
      }

      dispatch({ type: 'SET_STATUS', status: 'generating' });

      const request = await wearableStudioService.buildLLMRequest(intent, policyDecision, snapshot || undefined);
      const design = await wearableStudioService.designWearable(request, runId);

      dispatch({ type: 'SET_DESIGN', design });
      dispatch({ type: 'SET_STATUS', status: 'review' });

      // Refresh design history after generation/upload pipeline finishes
      refreshHistorySoon(runId, 2000);

      await wearableStudioService.appendMemory(
        {
          tier: 'event_working',
          category: 'wearable_design_attempt',
          content: state.story.slice(0, 280),
          metadata: {
            intent,
            policyDecision,
            snapshot,
            runId,
            design: { designConcept: design.designConcept, fabricType: design.fabricType, safetyTags: design.safetyTags },
            source_modality: 'text',
          },
        },
        runId
      );
    } catch (e) {
      dispatch({ type: 'SET_STATUS', status: 'error' });
      dispatch({ type: 'SET_ERROR', error: 'Failed to generate design. Please try again.' });
    }
  }, [state.story, isBusy, intent, snapshot, refreshHistorySoon]);

  const handlePreview = useCallback(async () => {
    if (!state.designDraft) {
      dispatch({ type: 'SET_ERROR', error: 'No design draft available. Please generate a design first.' });
      return;
    }

    dispatch({ type: 'SET_STATUS', status: 'generating' });
    dispatch({ type: 'SET_PREVIEW', show: true, snapshot: null, pkgResponse: null });
    dispatch({ type: 'SET_ERROR', error: null });

    try {
      // 1) PKG evaluate
      const pkgReq = buildPreviewPKGRequest(state.designDraft, intent, state.runId, snapshot);
      const pkgResponse = await seedcoreService.evaluatePKGAsync(pkgReq);

      if (!pkgResponse?.decision?.allowed) {
        dispatch({ type: 'SET_ERROR', error: `Policy Refusal: ${pkgResponse?.decision?.reason || 'Safety criteria not met.'}` });
        dispatch({ type: 'SET_PREVIEW', show: false, pkgResponse: null });
        dispatch({ type: 'SET_STATUS', status: 'error' });
        // Convert PKG response to PolicyDecision format and set it
        const policyDecision: PolicyDecision = {
          allowed: false,
          blocked: true,
          requiredOverrides: [],
          reasons: [pkgResponse?.decision?.reason || 'Safety criteria not met.'],
          ruleHits: pkgResponse?.provenance?.rules?.map((r: any) => ({
            ruleId: r.rule_id || r.id || '',
            ruleName: r.ruleName || r.name || r.rule_name || '',
            priority: r.priority || 0,
          })) || [],
        };
        dispatch({ type: 'SET_POLICY', decision: policyDecision });
        return;
      }

      // Convert PKG response to PolicyDecision format and update state
      // This ensures handleSubmit can check policyDecision when called from preview panel
      const policyDecision: PolicyDecision = {
        allowed: true,
        blocked: false,
        requiredOverrides: [],
        reasons: [],
        ruleHits: pkgResponse?.provenance?.rules?.map((r: any) => ({
          ruleId: r.rule_id || r.id || '',
          ruleName: r.ruleName || r.name || r.rule_name || '',
          priority: r.priority || 0,
        })) || [],
      };
      dispatch({ type: 'SET_POLICY', decision: policyDecision });
      dispatch({ type: 'SET_ERROR', error: null }); // Clear any previous policy errors

      // 2) Find render emission
      // Handle both possible response structures: emissions.subtasks or result.subtasks
      // Also check for both 'type' and 'subtask_type' fields for backward compatibility
      const subtasks = 
        pkgResponse?.emissions?.subtasks || 
        (pkgResponse as any)?.result?.subtasks || 
        [];
      
      const renderSubtask = subtasks.find((s: any) => 
        s?.type === 'generate_precision_mockups' || 
        s?.subtask_type === 'generate_precision_mockups' ||
        s?.name === 'generate_precision_mockups'
      );
      
      if (!renderSubtask) {
        console.warn('[Preview] No render subtask found. Available subtasks:', subtasks);
        console.warn('[Preview] Full PKG response:', JSON.stringify(pkgResponse, null, 2));
        
        // If policy allowed but no render instructions, proceed with direct rendering
        // (as per comment: "seedcore api don't need to emit instruction, we can implement the render on hotel simulator side directly")
        console.log('[Preview] Proceeding with direct rendering without PKG emission instructions');
      }

      const params = (renderSubtask?.params || {}) as RenderEmissionParams;
      const subtaskType = renderSubtask?.type || renderSubtask?.subtask_type || renderSubtask?.name || 'generate_precision_mockups';

      // Backward compatible fallbacks
      const emissionParams: RenderEmissionParams = {
        artwork_uri: params.artwork_uri || state.designDraft.printImageUrl || state.designDraft.imageUrl || '',
        placement_anchor:
          params.placement_anchor ||
          (state.designDraft.printSpec?.placement?.toLowerCase().includes('front') ? 'center_chest' : 'center_back'),
        scale: typeof params.scale === 'number' ? params.scale : 0.38,
        warp_profile:
          params.warp_profile || (state.designDraft.fabricType.toLowerCase().includes('cotton') ? 'loose_cotton' : 'standard'),
      };

      // 3) Render (proceed even if no renderSubtask found, as per hotel simulator side implementation)
      const previewSnapshot = await renderServiceRef.current.processEmission(
        subtaskType,
        emissionParams,
        state.designDraft
      );

      dispatch({ type: 'SET_PREVIEW', show: true, snapshot: previewSnapshot, pkgResponse });
      dispatch({ type: 'SET_STATUS', status: 'review' });
    } catch (e: any) {
      const msg = e?.message || String(e);
      let userMessage = 'Failed to generate preview. Please try again.';

      if (msg === 'PKG_NOT_AVAILABLE' || msg === 'SERVER_NOT_RUNNING' || msg === 'SERVER_NOT_INITIALIZED') {
        userMessage = 'Policy evaluation system is unavailable. Please ensure the SeedCore server is running.';
      }
      if (msg.includes('POLICY_BLOCKED')) {
        userMessage = `Policy blocked preview: ${e?.ruleName || msg}`;
      }

      dispatch({ type: 'SET_ERROR', error: userMessage });
      dispatch({ type: 'SET_PREVIEW', show: false, pkgResponse: null });
      dispatch({ type: 'SET_STATUS', status: 'error' });
    }
  }, [state.designDraft, state.runId, intent, snapshot]);

  const handleSubmit = useCallback(async () => {
    if (!state.designDraft) {
      dispatch({ type: 'SET_ERROR', error: 'No design draft available. Please generate a design first.' });
      return;
    }

    // Check policy decision - prefer previewPKGResponse if in preview mode, otherwise use policyDecision
    const effectivePolicyDecision = state.previewPKGResponse?.decision 
      ? {
          allowed: state.previewPKGResponse.decision.allowed,
          blocked: !state.previewPKGResponse.decision.allowed,
        }
      : state.policyDecision;

    if (!effectivePolicyDecision?.allowed) {
      dispatch({ type: 'SET_ERROR', error: 'Policy evaluation required. Please wait for policy check to complete.' });
      return;
    }

    if (isBusy) return;

    dispatch({ type: 'SET_STATUS', status: 'submitting' });
    dispatch({ type: 'SET_ERROR', error: null });
    dispatch({ type: 'SET_NOTIFICATION', notification: null });

    try {
      // Re-check policy for manufacturing
      const policyContext = wearableStudioService.buildPolicyContext(intent, snapshot || undefined, 'submit_mfg');
      policyContext.signals = {
        ...policyContext.signals,
        fabricType: state.designDraft.fabricType,
        safetyTags: state.designDraft.safetyTags,
        printPlacement: state.designDraft.printSpec.placement,
      } as any;

      const submitDecision = await wearableStudioService.evaluatePolicy(snapshot?.id, policyContext);
      dispatch({ type: 'SET_POLICY', decision: submitDecision });

      if (submitDecision.blocked) {
        dispatch({ type: 'SET_STATUS', status: 'error' });
        dispatch({ type: 'SET_ERROR', error: submitDecision.reasons?.[0] || 'Policy blocked manufacturing.' });
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

      dispatch({ type: 'SET_TICKET', ticket });

      // Evaluate PKG and create SeedCore tasks for manufacturing
      const pkgReq = buildMfgPKGRequest(ticket, state.designDraft!, intent, snapshot);
      const pkgRes = await seedcoreService.evaluatePKGAsync(pkgReq);

      if (!pkgRes.decision.allowed) {
        dispatch({ type: 'SET_STATUS', status: 'error' });
        dispatch({ type: 'SET_ERROR', error: `Policy blocked manufacturing: ${pkgRes.decision.reason || 'Safety criteria not met.'}` });
        notify(`Policy blocked manufacturing: ${pkgRes.decision.reason || 'blocked'}`, { isError: true, ttlMs: 9000 });
        return;
      }

      // Create SeedCore task for manufacturing
      const mfgTask = await seedcoreService.createTask({
        type: 'action',
        description: `Manufacture wearable: ${intent.type} - ${intent.style} style for ${intent.size}`,
        domain: 'wearable_manufacturing',
        snapshot_id: snapshot?.id,
        params: {
          ticket_id: ticket.ticketId,
          run_id: ticket.runId,
          intent: intent,
          design: state.designDraft,
          policy_decision: submitDecision,
          snapshot_id: snapshot?.id,
          snapshot_version: snapshot?.version,
        },
        run_immediately: true,
      });

      // Execute emissions to create subtasks
      const createdTasks = await seedcoreService.executeEmissions(pkgRes.emissions, {
        runImmediately: true,
        domain: 'wearable_manufacturing',
      });

      if (createdTasks.length > 0) {
        const first = createdTasks[0];
        notify(
          `Your wearable is being prepared for manufacturing! ${createdTasks.length} task${createdTasks.length > 1 ? 's' : ''} created.`,
          { taskId: String(first.task.id), ttlMs: 6000 }
        );
      } else {
        notify('Your design has been sent to production!', { ttlMs: 3500 });
      }

      dispatch({ type: 'SET_STATUS', status: 'done' });

      await wearableStudioService.appendMemory(
        {
          tier: 'knowledge_base',
          category: 'wearable_design_ticket',
          content: ticket.ticketId,
          metadata: {
            intent,
            policyDecision: submitDecision,
            ticket,
            snapshot,
            runId: ticket.runId,
            design: { designConcept: ticket.design.designConcept, fabricType: ticket.design.fabricType },
          },
        },
        ticket.runId
      );
    } catch (e: any) {
      dispatch({ type: 'SET_STATUS', status: 'error' });
      dispatch({ type: 'SET_ERROR', error: e?.message || 'Failed to submit to manufacturing.' });
      notify('Unable to submit your design. Please try again.', { isError: true, ttlMs: 7000 });
    }
  }, [state.designDraft, state.policyDecision, state.runId, isBusy, intent, snapshot, notify]);

  return (
    <div className="w-full h-full bg-[#FAFAFA] text-slate-900 flex flex-col">
      {/* PREVIEW MODAL */}
      {state.showPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300 p-2 md:p-4">
          <div className="relative w-full max-w-6xl h-[95vh] bg-white rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col">
            <div className="flex-shrink-0 flex items-center justify-between p-4 md:p-5 border-b border-slate-200 bg-gradient-to-r from-blue-50 to-indigo-50">
              <div className="flex items-center gap-2 md:gap-3">
                <Box className="text-blue-600" size={20} />
                <div>
                  <h2 className="text-lg md:text-xl font-black text-slate-900">3D Digital Twin Preview</h2>
                  <p className="text-[10px] md:text-xs text-slate-500 font-medium">SeedCore Precision Mockup</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {state.previewPKGResponse && (
                  <div className={`px-3 py-1.5 rounded-full text-[10px] md:text-xs font-bold flex items-center gap-1.5 ${
                    state.previewPKGResponse.decision?.allowed
                      ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                      : 'bg-rose-100 text-rose-700 border border-rose-200'
                  }`}>
                    {state.previewPKGResponse.decision?.allowed ? (
                      <>
                        <CheckCircle2 size={14} />
                        PKG: Allowed
                      </>
                    ) : (
                      <>
                        <ShieldX size={14} />
                        PKG: Blocked
                      </>
                    )}
                  </div>
                )}
                <button
                  onClick={() => dispatch({ type: 'SET_PREVIEW', show: false, pkgResponse: null })}
                  className="p-2 rounded-full hover:bg-white/80 text-slate-500 hover:text-slate-900 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 md:p-4">
              {state.previewSnapshot ? (
                <div className="h-full flex flex-col gap-3 md:gap-4">
                  <div className="flex-1 flex flex-col min-h-0 bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl md:rounded-2xl p-3 md:p-4 border border-slate-200">
                    <div className="flex-shrink-0 flex items-center justify-between mb-2 md:mb-3">
                      <div className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-slate-400">Rendered Snapshot</div>
                      <div className="px-2 md:px-3 py-0.5 md:py-1 bg-emerald-100 text-emerald-700 text-[10px] md:text-xs font-bold rounded-full">
                        Pre-Production QA Ready
                      </div>
                    </div>

                    <ZoomablePreviewImage imageSrc={state.previewSnapshot} />

                    <div className="flex-shrink-0 mt-2 md:mt-3 flex flex-wrap gap-1.5 md:gap-2 text-[10px] md:text-xs">
                      <div className="px-2 md:px-3 py-1 md:py-1.5 bg-blue-600/90 text-white rounded-md md:rounded-lg font-semibold">
                        Anchor: {state.designDraft?.printSpec?.placement?.toLowerCase() || 'center_chest'}
                      </div>
                      <div className="px-2 md:px-3 py-1 md:py-1.5 bg-blue-600/90 text-white rounded-md md:rounded-lg font-semibold">
                        Scale: 0.38
                      </div>
                      <div className="px-2 md:px-3 py-1 md:py-1.5 bg-blue-600/90 text-white rounded-md md:rounded-lg font-semibold">
                        Warp: {state.designDraft?.fabricType.toLowerCase().includes('cotton') ? 'loose_cotton' : 'standard'}
                      </div>
                    </div>
                  </div>

                  <div className="flex-shrink-0 grid grid-cols-2 md:grid-cols-4 gap-2">
                    <InfoTile title="Placement Anchor" value={state.designDraft?.printSpec?.placement || 'center_chest'} tone="blue" />
                    <InfoTile title="Scale Factor" value="0.38" tone="indigo" />
                    <InfoTile
                      title="Warp Profile"
                      value={state.designDraft?.fabricType.toLowerCase().includes('cotton') ? 'loose_cotton' : 'standard'}
                      tone="purple"
                    />
                    <InfoTile title="Status" value="Ready" tone="emerald" />
                  </div>

                  <div className="flex-shrink-0 p-2 md:p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <p className="text-[10px] md:text-xs text-slate-600 leading-relaxed">
                      <strong className="font-bold">Mock SeedCore Integration:</strong> This preview simulates the SeedCore emission processing flow.
                      In production, this would render a full 3D scene using Three.js with precise UV mapping and warp profiles for deterministic
                      manufacturing alignment.
                    </p>
                  </div>

                  <div className="flex-shrink-0 mt-4">
                    <ActionsBar
                      disabled={
                        !state.previewSnapshot || 
                        isBusy || 
                        !state.designDraft ||
                        !(state.previewPKGResponse?.decision?.allowed || state.policyDecision?.allowed)
                      }
                      submitting={state.status === 'submitting'}
                      onSubmit={handleSubmit}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-20">
                  <Loader2 className="text-blue-600 animate-spin mb-4" size={48} />
                  <p className="text-sm font-semibold text-slate-600">Generating 3D Digital Twin...</p>
                  <p className="text-xs text-slate-400 mt-2">Processing SeedCore emissions</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* NOTIFICATION */}
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

      {/* HEADER */}
      <div className="flex-shrink-0 px-8 py-6 flex items-center justify-between bg-white border-b border-blue-100">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 rounded-full hover:bg-slate-100 text-slate-500 hover:text-blue-600 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <Shirt className="text-blue-500" size={24} />
              Wearable Story Studio
            </h1>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Commemorate Moments into Matter</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="px-3 py-1 bg-blue-50 text-blue-600 text-[10px] font-bold uppercase tracking-widest rounded-full border border-blue-100">
            {isBusy ? 'AI Processing...' : 'Studio Ready'}
          </div>
        </div>
      </div>

      {/* MAIN GRID */}
      <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12">
        {/* LEFT: INPUT */}
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
              {state.status === 'policy_check' ? 'Running Policy...' : state.status === 'generating' ? 'Weaving Reality...' : 'Generate Wearable'}
            </button>
          </div>
        </div>

        {/* RIGHT: PREVIEW + HISTORY */}
        <div className="lg:col-span-8 bg-white relative flex flex-col overflow-hidden">
          <div
            className="absolute inset-0 opacity-[0.03] pointer-events-none"
            style={{ backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)', backgroundSize: '24px 24px' }}
          />

          <div className="flex-1 overflow-y-auto p-8">
            <div className="w-full max-w-5xl mx-auto">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Workspace */}
                <div className="lg:col-span-2 space-y-6">
                  {state.designDraft || (state.designHistory && (state.designHistory.print?.applied || state.designHistory.mockup?.applied)) ? (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                      <div className="mb-6 flex justify-end">
                        <PreviewButton 
                          onClick={handlePreview} 
                          disabled={isBusy || !state.designDraft} 
                        />
                      </div>

                      {state.designDraft ? (
                        <>
                          <DesignPreview design={state.designDraft} type={state.type} />
                        </>
                      ) : state.designHistory ? (
                        <DesignPreviewFromHistory 
                          history={state.designHistory} 
                          type={state.type} 
                        />
                      ) : null}
                    </div>
                  ) : (
                    <div className="h-96 flex flex-col items-center justify-center bg-slate-50/50 rounded-[40px] border-2 border-dashed border-slate-200">
                      <div className="p-6 rounded-full bg-white shadow-sm mb-4">
                        <Shirt size={48} className="text-slate-200" />
                      </div>
                      <h3 className="text-slate-400 font-black uppercase text-sm tracking-widest">Awaiting Story Generation</h3>
                    </div>
                  )}
                </div>

                {/* Sidebar */}
                <div className="lg:col-span-1 space-y-6">
                  <DesignHistoryPanel
                    history={state.designHistory}
                    loading={state.loadingHistory}
                    runId={state.runId}
                    onApply={async (runId, suffix, applied) => {
                      try {
                        const res = await fetch(`${API_BASE_URL}/api/designs/${runId}/${suffix}/apply`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ applied }),
                        });

                        if (!res.ok) {
                          notify('Failed to update design status', { isError: true, ttlMs: 7000 });
                          return;
                        }

                        dispatch({ type: 'UPDATE_DESIGN_APPLIED', runId, suffix, applied });
                        notify(`${suffix === 'print' ? 'Placement' : 'Production'} design ${applied ? 'applied' : 'unapplied'} successfully`, {
                          ttlMs: 3200,
                        });
                      } catch {
                        notify('Failed to update design status', { isError: true, ttlMs: 7000 });
                      }
                    }}
                  />

                  {state.ticket && state.designDraft && <ProductionTicket design={state.designDraft} runId={state.runId} ticket={state.ticket} />}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------
 * Subcomponents
 * ------------------------------------------- */

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
              <option key={t} value={t}>
                {t}
              </option>
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
              <option key={s} value={s}>
                {s}
              </option>
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
                props.size === s ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
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

  const statusBadge =
    props.status === 'policy_check'
      ? { label: 'Evaluating...', icon: <Loader2 size={14} className="animate-spin text-indigo-600" />, color: 'text-indigo-600' }
      : decision?.blocked
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

        {props.status === 'policy_check' ? (
          <div className="text-[11px] text-indigo-500 font-medium">Cognitive Brain processing your request...</div>
        ) : decision?.reasons?.length ? (
          <div className="text-[11px] text-slate-500">{decision.reasons.slice(0, 2).join(' · ')}</div>
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

function ZoomablePreviewImage({ imageSrc }: { imageSrc: string | null }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const MIN_ZOOM = 0.5;
  const MAX_ZOOM = 5;
  const ZOOM_STEP = 0.25;

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev + ZOOM_STEP, MAX_ZOOM));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => {
      const newZoom = Math.max(prev - ZOOM_STEP, MIN_ZOOM);
      if (newZoom === 1) {
        setPan({ x: 0, y: 0 });
      }
      return newZoom;
    });
  }, []);

  const handleReset = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    setZoom((prev) => {
      const newZoom = Math.max(MIN_ZOOM, Math.min(prev + delta, MAX_ZOOM));
      if (newZoom === 1) {
        setPan({ x: 0, y: 0 });
      }
      return newZoom;
    });
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoom <= 1) return;
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ 
      x: e.clientX - pan.x, 
      y: e.clientY - pan.y 
    });
  }, [zoom, pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || zoom <= 1) return;
    e.preventDefault();
    const newPan = {
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    };
    setPan(newPan);
  }, [isDragging, zoom, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    const handleGlobalMouseUp = () => setIsDragging(false);
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!isDragging || zoom <= 1) return;
      const newPan = {
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      };
      setPan(newPan);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleGlobalMouseMove);
        window.removeEventListener('mouseup', handleGlobalMouseUp);
      };
    }
  }, [isDragging, zoom, dragStart]);

  if (!imageSrc) return null;

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      {/* Zoom Controls */}
      <div className="absolute top-2 right-2 z-10 flex flex-col gap-1 bg-white/90 backdrop-blur-sm rounded-lg p-1 shadow-lg border border-slate-200">
        <button
          onClick={handleZoomIn}
          disabled={zoom >= MAX_ZOOM}
          className="p-2 rounded-md hover:bg-slate-100 text-slate-700 hover:text-slate-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Zoom In (Ctrl/Cmd + Scroll)"
        >
          <ZoomIn size={16} />
        </button>
        <button
          onClick={handleZoomOut}
          disabled={zoom <= MIN_ZOOM}
          className="p-2 rounded-md hover:bg-slate-100 text-slate-700 hover:text-slate-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Zoom Out (Ctrl/Cmd + Scroll)"
        >
          <ZoomOut size={16} />
        </button>
        <button
          onClick={handleReset}
          disabled={zoom === 1 && pan.x === 0 && pan.y === 0}
          className="p-2 rounded-md hover:bg-slate-100 text-slate-700 hover:text-slate-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Reset Zoom"
        >
          <RotateCcw size={16} />
        </button>
      </div>

      {/* Zoom Level Indicator */}
      {zoom !== 1 && (
        <div className="absolute top-2 left-2 z-10 px-2 py-1 bg-white/90 backdrop-blur-sm rounded-md text-[10px] font-bold text-slate-700 shadow-lg border border-slate-200">
          {Math.round(zoom * 100)}%
        </div>
      )}

      {/* Image Container */}
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center min-h-0 overflow-hidden relative"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{
          cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
        }}
      >
        <div
          className="w-full h-full flex items-center justify-center transition-transform duration-200 ease-out"
          style={{
            transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
            transformOrigin: 'center center',
          }}
        >
          <img
            ref={imageRef}
            src={imageSrc}
            alt="3D Digital Twin Preview"
            className="max-w-[95%] max-h-[95%] w-auto h-auto object-contain rounded-lg md:rounded-xl shadow-2xl border-2 md:border-4 border-white select-none"
            style={{ imageRendering: 'auto' }}
            draggable={false}
          />
        </div>
      </div>
    </div>
  );
}

function DesignPreview({ design, type }: { design: WearableDesignDraft; type: string }) {
  const [view, setView] = useState<'production' | 'placement'>('placement');

  return (
    <div
      className={[
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
                onClick={() => setView('placement')}
                className={`px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest rounded-lg transition-colors ${
                  view === 'placement' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Placement
              </button>
              <button
                onClick={() => setView('production')}
                className={`px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest rounded-lg transition-colors ${
                  view === 'production' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Production
              </button>
            </div>
          </div>

          {view === 'placement' ? (
            <div className="w-full">
              <div className="mx-auto w-full max-w-2xl">
                <img src={design.printImageUrl || design.imageUrl || undefined} alt="Print artwork" className="w-full h-auto object-contain" />
              </div>
              <div className="mt-2 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500">
                {design.printSpec?.placement || 'FRONT'}
              </div>
            </div>
          ) : (
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

function DesignPreviewFromHistory({ history, type }: { history: DesignHistory; type: string }) {
  const hasPrint = history.print?.applied && history.print?.url;
  const hasMockup = history.mockup?.applied && history.mockup?.url;
  
  // Default to placement if available, otherwise production
  const [view, setView] = useState<'production' | 'placement'>(() => 
    hasPrint ? 'placement' : 'production'
  );
  
  // Ensure view is valid based on available designs
  const currentView = (view === 'placement' && !hasPrint) ? 'production' : 
                      (view === 'production' && !hasMockup) ? 'placement' : 
                      view;

  if (!hasPrint && !hasMockup) {
    return (
      <div className="w-full aspect-[3/4] bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 font-mono text-xs">
        No applied designs available
      </div>
    );
  }

  return (
    <div
      className={[
        currentView === 'placement'
          ? 'bg-transparent p-0 border-0 shadow-none rotate-0'
          : 'bg-white p-4 rounded-3xl shadow-2xl border border-slate-100 rotate-1 hover:rotate-0 transition-transform duration-500',
      ].join(' ')}
    >
      <div className="space-y-3">
        {(hasPrint && hasMockup) && (
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Preview</div>
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
              {hasPrint && (
                <button
                  onClick={() => setView('placement')}
                  className={`px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest rounded-lg transition-colors ${
                    currentView === 'placement' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Placement
                </button>
              )}
              {hasMockup && (
                <button
                  onClick={() => setView('production')}
                  className={`px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest rounded-lg transition-colors ${
                    currentView === 'production' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Production
                </button>
              )}
            </div>
          </div>
        )}

        {currentView === 'placement' && hasPrint ? (
          <div className="w-full">
            <div className="mx-auto w-full max-w-2xl">
              <img 
                src={history.print!.url} 
                alt="Print artwork" 
                className="w-full h-auto object-contain"
                onError={(e) => ((e.target as HTMLImageElement).src = svgFallbackDataUrl(400, 300))}
              />
            </div>
            <div className="mt-2 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500">
              {history.print!.metadata?.placement || history.print!.metadata?.printSpec?.placement || 'FRONT'}
            </div>
          </div>
        ) : hasMockup ? (
          <div className="relative w-full aspect-[3/4] rounded-2xl overflow-hidden bg-white border border-slate-100">
            <img
              src={history.mockup!.url}
              alt="Production mockup"
              className="w-full h-full object-contain p-4"
              onError={(e) => ((e.target as HTMLImageElement).src = svgFallbackDataUrl(400, 500))}
            />
            <div className="absolute top-3 left-3 bg-emerald-600/90 text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full">
              Production Mockup
            </div>
          </div>
        ) : null}
      </div>
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
          <p className="text-sm font-serif italic text-slate-700 leading-relaxed">"{design.designConcept}"</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 bg-white rounded-lg border border-slate-100">
            <div className="flex items-center gap-2 mb-1 text-blue-500">
              <Layers size={12} /> <span className="text-[9px] font-bold uppercase">Material</span>
            </div>
            <span className="text-xs font-bold text-slate-700">{design.fabricType}</span>
          </div>
          <div className="p-3 bg-white rounded-lg border border-slate-100">
            <div className="flex items-center gap-2 mb-1 text-amber-500">
              <Scissors size={12} /> <span className="text-[9px] font-bold uppercase">Thread</span>
            </div>
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

function PreviewButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      type="button"
      className={`px-6 py-3 rounded-xl font-bold uppercase tracking-widest text-xs transition-all flex items-center justify-center gap-2 ${
        disabled
          ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
          : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-200 hover:shadow-blue-300 border border-blue-500 hover:scale-105 active:scale-95'
      }`}
      title={disabled ? 'Generate a design first to preview' : 'Preview 3D Digital Twin'}
    >
      <Eye size={18} />
      Preview 3D Digital Twin
    </button>
  );
}

function DesignHistoryPanel({
  history,
  loading,
  runId,
  onApply,
}: {
  history: DesignHistory | null;
  loading: boolean;
  runId: string | null;
  onApply: (runId: string, suffix: 'print' | 'mockup', applied: boolean) => Promise<void>;
}) {
  // Show empty state when no runId yet
  if (!runId) {
    return (
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <History size={16} className="text-slate-500" />
          <h3 className="text-sm font-bold uppercase tracking-widest text-slate-700">Design History</h3>
        </div>
        <p className="text-xs text-slate-400">
          Generate your first design to start tracking placement/production uploads.
        </p>
      </div>
    );
  }

  const historyArray = history?.history && Array.isArray(history.history) ? history.history : [];
  const hasHistory = !!(history?.print || history?.mockup || historyArray.length > 0);

  if (loading) {
    return (
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2 text-slate-400">
          <Loader2 size={14} className="animate-spin" />
          <span className="text-xs font-semibold">Loading design history...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <History size={16} className="text-slate-500" />
        <h3 className="text-sm font-bold uppercase tracking-widest text-slate-700">Design History</h3>
      </div>

      {!hasHistory ? (
        <div className="py-4 text-center">
          <p className="text-xs text-slate-400">No design history yet. Uploads will appear here after generation.</p>
          <p className="text-[10px] text-slate-300 mt-2">Run: {runId.slice(0, 8)}…</p>
        </div>
      ) : (
        <div className="space-y-3">
          {history?.print && <DesignHistoryItem design={history.print} label="Placement" onApply={onApply} />}
          {history?.mockup && <DesignHistoryItem design={history.mockup} label="Production" onApply={onApply} />}

          {historyArray.length > 0 && (
            <div className="pt-3 border-t border-slate-100">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                Previous Versions ({historyArray.length})
              </div>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {historyArray
                  .filter((item) => item && item.runId && item.suffix && item.id)
                  .map((item) => (
                    <DesignHistoryItem
                      key={`${item.runId}-${item.suffix}-${item.id}`}
                      design={item}
                      label={item.suffix === 'print' ? 'Placement' : 'Production'}
                      compact
                      onApply={onApply}
                    />
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const DesignHistoryItem: React.FC<{
  design: DesignUpload;
  label: string;
  compact?: boolean;
  onApply: (runId: string, suffix: 'print' | 'mockup', applied: boolean) => Promise<void>;
}> = ({ design, label, compact = false, onApply }) => {
  const [isApplying, setIsApplying] = useState(false);

  const handleApply = async () => {
    setIsApplying(true);
    try {
      await onApply(design.runId, design.suffix, !design.applied);
    } finally {
      setIsApplying(false);
    }
  };

  if (compact) {
    return (
      <div className="flex items-center justify-between p-2 bg-slate-50 rounded-lg border border-slate-100">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <img
            src={design.url}
            alt={label}
            className="w-12 h-12 object-cover rounded border border-slate-200"
            onError={(e) => ((e.target as HTMLImageElement).src = svgFallbackDataUrl(48, 48))}
          />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-bold text-slate-700 truncate">{label}</div>
            <div className="text-[9px] text-slate-400">{safeDateTime(design.createdAt)}</div>
          </div>
        </div>
        <button
          onClick={handleApply}
          disabled={isApplying}
          className={`px-2 py-1 text-[9px] font-bold rounded transition-colors ${
            design.applied ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          {isApplying ? <Loader2 size={10} className="animate-spin" /> : design.applied ? <Check size={10} /> : 'Apply'}
        </button>
      </div>
    );
  }

  return (
    <div className="p-3 bg-gradient-to-br from-slate-50 to-white rounded-lg border border-slate-200">
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="text-xs font-bold text-slate-900">{label}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">{safeDateTime(design.createdAt)}</div>
        </div>
        {design.applied && (
          <div className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[9px] font-bold rounded-full flex items-center gap-1">
            <Check size={10} />
            Applied
          </div>
        )}
      </div>

      <div className="mb-2">
        <img
          src={design.url}
          alt={label}
          className="w-full h-32 object-contain rounded border border-slate-200 bg-white"
          onError={(e) => ((e.target as HTMLImageElement).src = svgFallbackDataUrl(200, 128))}
        />
      </div>

      <button
        onClick={handleApply}
        disabled={isApplying}
        className={`w-full py-2 px-3 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2 ${
          design.applied ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-blue-600 text-white hover:bg-blue-700'
        }`}
      >
        {isApplying ? (
          <>
            <Loader2 size={12} className="animate-spin" />
            {design.applied ? 'Unapplying...' : 'Applying...'}
          </>
        ) : design.applied ? (
          <>
            <X size={12} />
            Unapply
          </>
        ) : (
          <>
            <Check size={12} />
            Apply Design
          </>
        )}
      </button>
    </div>
  );
};

function ActionsBar({ disabled, submitting, onSubmit }: { disabled: boolean; submitting: boolean; onSubmit: () => void }) {
  return (
    <div className="flex gap-3">
      <button
        onClick={onSubmit}
        disabled={disabled || submitting}
        type="button"
        className={`flex-1 py-4 rounded-xl font-bold uppercase tracking-widest text-xs transition-colors flex items-center justify-center gap-2 ${
          disabled || submitting ? 'bg-slate-400 text-slate-200 cursor-not-allowed opacity-60' : 'bg-slate-900 text-white hover:bg-slate-800'
        }`}
        title={disabled ? 'Blocked by policy or busy state' : 'Send to manufacturing'}
      >
        {submitting ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />} Send to Mfg
      </button>

      <button
        className="px-6 py-4 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors"
        disabled={submitting}
        title="Download (coming soon)"
        type="button"
      >
        <Download size={18} />
      </button>
    </div>
  );
}

function InfoTile({ title, value, tone }: { title: string; value: string; tone: 'blue' | 'indigo' | 'purple' | 'emerald' }) {
  const toneMap: Record<string, { bg: string; border: string; text: string }> = {
    blue: { bg: 'bg-blue-50', border: 'border-blue-100', text: 'text-blue-600' },
    indigo: { bg: 'bg-indigo-50', border: 'border-indigo-100', text: 'text-indigo-600' },
    purple: { bg: 'bg-purple-50', border: 'border-purple-100', text: 'text-purple-600' },
    emerald: { bg: 'bg-emerald-50', border: 'border-emerald-100', text: 'text-emerald-600' },
  };

  const t = toneMap[tone];

  return (
    <div className={`p-2 rounded-lg border ${t.bg} ${t.border}`}>
      <div className={`text-[9px] font-bold uppercase tracking-widest ${t.text} mb-0.5`}>{title}</div>
      <div className="text-[10px] font-semibold text-slate-900">{value}</div>
    </div>
  );
}
