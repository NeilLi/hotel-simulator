import React, { useEffect, useReducer, useState, useRef } from 'react';
import { ArrowLeft, Sparkles, Shirt, Wand2, Download, Printer, Scissors, Layers, Loader2, ShieldAlert, ShieldCheck, ShieldX, CheckCircle2, X, Eye, Box } from 'lucide-react';
import { wearableStudioService } from '../../services/wearableStudioService';
import { seedcoreService } from '../../services/seedcoreService';
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
  notification: { message: string; taskId?: string; isError?: boolean } | null;
  showPreview: boolean;
  previewSnapshot: string | null;
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
  | { type: 'SET_PREVIEW'; show: boolean; snapshot?: string | null };

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
      return { ...state, showPreview: action.show, previewSnapshot: action.snapshot || null };
    default:
      return state;
  }
}

// Mock RenderService: Simulates SeedCore emission processing for 3D Digital Twin
class MockRenderService {
  /**
   * Mock: Process SeedCore emissions and generate precision mockup
   * In production, this would use Three.js to render 3D scene
   */
  async processEmission(subtaskType: string, params: any, design: WearableDesignDraft, type: string): Promise<string> {
    if (subtaskType === 'generate_precision_mockups') {
      return await this.renderDigitalTwin(params, design, type);
    }
    throw new Error(`Unknown subtask type: ${subtaskType}`);
  }

  private async renderDigitalTwin(params: any, design: WearableDesignDraft, type: string): Promise<string> {
    // Enhanced: Combine placement (print artwork) and production (mockup) images
    // In production, this would:
    // 1. Load 3D garment model (GLTF)
    // 2. Apply artwork texture with precision placement
    // 3. Apply warp profile and scale
    // 4. Render scene and capture snapshot
    
    const { artwork_uri, placement_anchor, scale, warp_profile } = params;
    
    // Use production mockup as base (white garment template)
    const mockupUrl = design.mockupImageUrl || design.imageUrl;
    const printUrl = design.printImageUrl || design.imageUrl;
    
    return new Promise((resolve) => {
      // Load both images
      const mockupImg = new Image();
      const printImg = new Image();
      let mockupLoaded = false;
      let printLoaded = false;
      
      const tryRender = () => {
        if (!mockupLoaded || !printLoaded) return;
        
        // Get actual image dimensions (naturalWidth/Height are read-only, use width/height)
        const mockupWidth = (mockupImg as any).naturalWidth || mockupImg.width || 800;
        const mockupHeight = (mockupImg as any).naturalHeight || mockupImg.height || 1000;
        const printWidth = (printImg as any).naturalWidth || printImg.width || 0;
        const printHeight = (printImg as any).naturalHeight || printImg.height || 0;
        
        // Create canvas matching mockup dimensions with transparency support
        const canvas = document.createElement('canvas');
        canvas.width = mockupWidth;
        canvas.height = mockupHeight;
        const ctx = canvas.getContext('2d', { alpha: true })!;
        
        // Step 1: Draw production mockup (white garment template) as base
        // Use fallback image if available, otherwise use mockupImg
        const baseImg = (mockupImg as any).__fallbackImg || mockupImg;
        ctx.drawImage(baseImg, 0, 0, canvas.width, canvas.height);
        
        // Step 2: Calculate placement position based on anchor (only if print image exists)
        if (printWidth > 0 && printHeight > 0) {
          const scaledWidth = printWidth * scale;
          const scaledHeight = printHeight * scale;
          
          let placementX = 0;
          let placementY = 0;
          
          if (placement_anchor === 'center_chest' || placement_anchor?.includes('front')) {
            // Center horizontally, upper third vertically for chest placement
            placementX = (canvas.width / 2) - (scaledWidth / 2);
            placementY = (canvas.height * 0.35) - (scaledHeight / 2);
          } else if (placement_anchor === 'center_back' || placement_anchor?.includes('back')) {
            // Center horizontally, middle vertically for back placement
            placementX = (canvas.width / 2) - (scaledWidth / 2);
            placementY = (canvas.height * 0.5) - (scaledHeight / 2);
          } else {
            // Default: center
            placementX = (canvas.width / 2) - (scaledWidth / 2);
            placementY = (canvas.height / 2) - (scaledHeight / 2);
          }
          
          // Step 3: Overlay print artwork onto mockup with precision placement
          // Process print image to ensure transparent background
          ctx.save();
          
          // Create a temporary canvas to process the print image and remove white backgrounds
          const printCanvas = document.createElement('canvas');
          printCanvas.width = printWidth;
          printCanvas.height = printHeight;
          const printCtx = printCanvas.getContext('2d', { 
            willReadFrequently: true,
            alpha: true // Ensure transparency support
          })!;
          
          // Draw the print image with transparency preserved
          printCtx.drawImage(printImg, 0, 0);
          
          // Process pixels to make white/light backgrounds transparent
          // This ensures the print artwork blends seamlessly with the garment
          const imageData = printCtx.getImageData(0, 0, printCanvas.width, printCanvas.height);
          const data = imageData.data;
          
          // Thresholds for white background removal
          const whiteThreshold = 235; // RGB values above this will be made transparent
          const veryWhiteThreshold = 250; // Very white pixels become fully transparent
          
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            let alpha = data[i + 3];
            
            // Skip if already fully transparent
            if (alpha === 0) continue;
            
            // Calculate average brightness
            const avg = (r + g + b) / 3;
            
            // Check if pixel is white/light (potential background)
            const isWhite = r > whiteThreshold && g > whiteThreshold && b > whiteThreshold;
            
            if (isWhite) {
              if (avg > veryWhiteThreshold) {
                // Very white pixels (likely background) - make fully transparent
                data[i + 3] = 0;
              } else {
                // Near-white pixels - gradually fade to transparent
                // This preserves subtle design elements while removing backgrounds
                const whiteness = (avg - whiteThreshold) / (veryWhiteThreshold - whiteThreshold);
                data[i + 3] = Math.max(0, Math.floor(alpha * (1 - whiteness * 0.95)));
              }
            }
            // Otherwise, preserve original pixel (including existing transparency)
          }
          
          // Put processed image data back
          printCtx.putImageData(imageData, 0, 0);
          
          // Now overlay the processed print artwork onto mockup
          // Use source-over to preserve transparency
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 1.0; // Full opacity for the design (transparency already handled)
          
          // Draw the processed print image at calculated position
          ctx.drawImage(
            printCanvas,
            placementX,
            placementY,
            scaledWidth,
            scaledHeight
          );
          
          ctx.restore();
        }
        
        // Step 4: Add metadata overlay (optional, can be removed for cleaner preview)
        ctx.save();
        ctx.fillStyle = 'rgba(59, 130, 246, 0.9)';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText(`Anchor: ${placement_anchor}`, 12, 28);
        ctx.fillText(`Scale: ${scale}`, 12, 46);
        ctx.fillText(`Warp: ${warp_profile}`, 12, 64);
        ctx.restore();
        
        resolve(canvas.toDataURL('image/png'));
      };
      
      // Load mockup image (production - white garment template)
      mockupImg.crossOrigin = 'anonymous';
      mockupImg.onload = () => {
        mockupLoaded = true;
        tryRender();
      };
      mockupImg.onerror = () => {
        // Fallback: create white garment base if mockup fails
        const fallbackCanvas = document.createElement('canvas');
        fallbackCanvas.width = 800;
        fallbackCanvas.height = 1000;
        const fallbackCtx = fallbackCanvas.getContext('2d')!;
        fallbackCtx.fillStyle = '#ffffff';
        fallbackCtx.fillRect(0, 0, fallbackCanvas.width, fallbackCanvas.height);
        
        // Draw simple garment outline
        fallbackCtx.strokeStyle = '#e2e8f0';
        fallbackCtx.lineWidth = 2;
        fallbackCtx.beginPath();
        fallbackCtx.moveTo(200, 100);
        fallbackCtx.lineTo(200, 900);
        fallbackCtx.lineTo(600, 900);
        fallbackCtx.lineTo(600, 100);
        fallbackCtx.closePath();
        fallbackCtx.stroke();
        
        // Use fallback canvas directly - create image from it
        const fallbackDataUrl = fallbackCanvas.toDataURL('image/png');
        const fallbackImg = new Image();
        fallbackImg.onload = () => {
          // Store fallback image reference for rendering
          mockupImg.width = fallbackCanvas.width;
          mockupImg.height = fallbackCanvas.height;
          (mockupImg as any).__fallbackImg = fallbackImg;
          mockupLoaded = true;
          tryRender();
        };
        fallbackImg.src = fallbackDataUrl;
      };
      
      // Load print artwork (placement image)
      printImg.crossOrigin = 'anonymous';
      printImg.onload = () => {
        printLoaded = true;
        tryRender();
      };
      printImg.onerror = () => {
        // If print image fails, still render mockup only
        printLoaded = true;
        printImg.width = 0;
        printImg.height = 0;
        tryRender();
      };
      
      // Start loading images
      if (mockupUrl) {
        mockupImg.src = mockupUrl;
      } else {
        // Trigger error handler to create fallback
        const errorEvent = new Event('error');
        mockupImg.dispatchEvent(errorEvent);
      }
      
      if (printUrl) {
        printImg.src = printUrl;
      } else {
        // No print URL - render mockup only
        printLoaded = true;
        printImg.width = 0;
        printImg.height = 0;
      }
    });
  }
}

// Mock SeedCore API: Simulates SeedCore emission response
async function mockSeedCoreEvaluate(design: WearableDesignDraft, intent: WearableIntent): Promise<any> {
  // Simulate SeedCore policy evaluation and emission generation
  return {
    policy_decision: {
      allowed: true,
      reason: "Design meets all safety and quality standards"
    },
    emissions: [
      {
        subtask_type: "generate_precision_mockups",
        position: 0,
        params: {
          artwork_uri: design.printImageUrl || design.imageUrl || '',
          placement_anchor: design.printSpec?.placement?.toLowerCase().includes('front') ? 'center_chest' : 'center_back',
          scale: 0.45,
          warp_profile: design.fabricType.toLowerCase().includes('cotton') ? 'loose_cotton' : 'standard'
        }
      },
      {
        subtask_type: "fabricate_part",
        position: 1,
        params: {
          machine_id: "robot_arm_01",
          ink_set: "cmyk_v4"
        }
      }
    ]
  };
}

export function WearableStoryStudio({ onBack }: Props) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [state, dispatch] = useReducer(reducer, initialState);
  const renderService = useRef(new MockRenderService());

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
      const design = await wearableStudioService.designWearable(request, runId);
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

  const handlePreview = async () => {
    if (!state.designDraft) {
      dispatch({ type: 'SET_ERROR', error: 'No design draft available. Please generate a design first.' });
      return;
    }

    dispatch({ type: 'SET_STATUS', status: 'generating' });
    dispatch({ type: 'SET_PREVIEW', show: true, snapshot: null });

    try {
      // Mock SeedCore evaluation
      const seedcoreResponse = await mockSeedCoreEvaluate(state.designDraft, intent);
      
      if (!seedcoreResponse.policy_decision.allowed) {
        dispatch({ type: 'SET_ERROR', error: seedcoreResponse.policy_decision.reason });
        dispatch({ type: 'SET_PREVIEW', show: false });
        return;
      }

      // Process emissions through mock RenderService
      let previewSnapshot: string | null = null;
      
      for (const emission of seedcoreResponse.emissions) {
        if (emission.subtask_type === 'generate_precision_mockups') {
          previewSnapshot = await renderService.current.processEmission(
            emission.subtask_type,
            emission.params,
            state.designDraft,
            state.type
          );
          break;
        }
      }

      dispatch({ type: 'SET_PREVIEW', show: true, snapshot: previewSnapshot });
      dispatch({ type: 'SET_STATUS', status: 'review' });
    } catch (error) {
      console.error('Preview generation failed:', error);
      dispatch({ type: 'SET_ERROR', error: 'Failed to generate preview. Please try again.' });
      dispatch({ type: 'SET_PREVIEW', show: false });
      dispatch({ type: 'SET_STATUS', status: 'error' });
    }
  };

  const handleSubmit = async () => {
    console.log('[WearableStudio] handleSubmit called', {
      hasDesignDraft: !!state.designDraft,
      policyAllowed: state.policyDecision?.allowed,
      isBusy,
    });

    if (!state.designDraft) {
      dispatch({ type: 'SET_ERROR', error: 'No design draft available. Please generate a design first.' });
      return;
    }

    if (!state.policyDecision?.allowed) {
      dispatch({ type: 'SET_ERROR', error: 'Policy evaluation required. Please wait for policy check to complete.' });
      return;
    }

    if (isBusy) {
      return;
    }

    dispatch({ type: 'SET_STATUS', status: 'submitting' });
    dispatch({ type: 'SET_ERROR', error: null });
    dispatch({ type: 'SET_NOTIFICATION', notification: null });

    try {
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
      
      // Show initial success notification
      dispatch({ 
        type: 'SET_NOTIFICATION', 
        notification: { 
          message: `Your design has been sent to production!`,
        } 
      });

      // Try to create SeedCore task (non-blocking - ticket is already created)
      // Wrap in IIFE to make it async and non-blocking
      (async () => {
        try {
          // Prefer print image URL (should be GCS URL after upload), fallback to mockup
          const printImageUrl = state.designDraft.printImageUrl || state.designDraft.imageUrl;
          const mockupImageUrl = state.designDraft.mockupImageUrl || state.designDraft.imageUrl;
          const imageUrl = printImageUrl || mockupImageUrl;
          
          let taskCreated = false;
          
          // Try vision task first if we have a valid GCS URL
          if (imageUrl && !imageUrl.startsWith('data:')) {
            try {
              const sceneDescription = `Wearable design: ${state.designDraft.designConcept}. Type: ${intent.type}, Style: ${intent.style}, Size: ${intent.size}. Fabric: ${state.designDraft.fabricType}. Print placement: ${state.designDraft.printSpec.placement}.`;
              
              const task = await seedcoreService.createVisionTask(
                sceneDescription,
                imageUrl,
                'action',
                {
                  confidence: 1.0,
                  location_context: 'wearable_studio',
                  camera_id: 'wearable_design_studio',
                  detected_objects: {
                    ticketId: ticket.ticketId,
                    runId: ticket.runId,
                    designConcept: state.designDraft.designConcept,
                    fabricType: state.designDraft.fabricType,
                    printSpec: state.designDraft.printSpec,
                    intent: intent,
                  },
                }
              );

              if (task && task.id) {
                try {
                  const taskIdStr = String(task.id);
                  const shortId = taskIdStr.length > 8 ? taskIdStr.substring(0, 8) + '...' : taskIdStr;
                  dispatch({ 
                    type: 'SET_NOTIFICATION', 
                    notification: { 
                      message: `Your wearable is being prepared for manufacturing!`,
                      taskId: taskIdStr 
                    } 
                  });
                  taskCreated = true;
                } catch (idError) {
                  console.error('Error processing task ID:', idError, task);
                  // Keep the existing notification, don't overwrite
                  taskCreated = true;
                }
              } else {
                console.warn('SeedCore vision task response invalid:', task);
              }
            } catch (visionError: any) {
              console.warn('Vision task creation failed, trying regular task:', visionError);
              
              // Check if it's a server initialization error - if so, don't try fallback
              const errorMessage = visionError?.message || String(visionError);
              const isServerError = 
                errorMessage === 'SERVER_NOT_INITIALIZED' ||
                errorMessage === 'SERVER_NOT_RUNNING' ||
                (typeof errorMessage === 'string' && (
                  errorMessage.includes('snapshot_id') ||
                  errorMessage.includes('null value') ||
                  errorMessage.includes('violates not-null constraint') ||
                  errorMessage.includes('Failed to fetch') ||
                  errorMessage.includes('ECONNREFUSED')
                ));
              
              if (isServerError) {
                // Re-throw to be caught by outer catch block
                throw visionError;
              }
              // Fall through to regular task for other errors
            }
          }
          
          // Fallback to regular task if vision task wasn't created
          if (!taskCreated) {
            const taskDescription = `Manufacture wearable: ${state.designDraft.designConcept}. Type: ${intent.type}, Style: ${intent.style}, Size: ${intent.size}.`;
            const taskParams: Record<string, any> = {
              ticketId: ticket.ticketId,
              runId: ticket.runId,
              design: state.designDraft,
              intent: intent,
            };
            
            if (imageUrl && !imageUrl.startsWith('data:')) {
              taskParams.imageUrl = imageUrl;
            }

            const task = await seedcoreService.createTask({
              type: 'action',
              description: taskDescription,
              params: taskParams,
            });

            if (task && task.id) {
              try {
                const taskIdStr = String(task.id);
                const shortId = taskIdStr.length > 8 ? taskIdStr.substring(0, 8) + '...' : taskIdStr;
                dispatch({ 
                  type: 'SET_NOTIFICATION', 
                  notification: { 
                    message: `Your wearable is being prepared for manufacturing!`,
                    taskId: taskIdStr 
                  } 
                });
              } catch (idError) {
                console.error('Error processing task ID:', idError, task);
                // Keep existing notification
              }
            } else {
              console.warn('SeedCore task response invalid:', task);
              // Keep existing notification
            }
          }

          // Auto-hide notification after 5 seconds (only if no error occurred)
          // Error handling will set its own timeout
          if (taskCreated || (!taskCreated && imageUrl)) {
            setTimeout(() => {
              dispatch({ type: 'SET_NOTIFICATION', notification: null });
            }, 5000);
          }
        } catch (seedcoreError: any) {
          // SeedCore is optional - ticket is already created
          console.error('SeedCore task creation failed (non-critical):', seedcoreError);
          
          // Check for server initialization errors
          const errorMessage = seedcoreError?.message || String(seedcoreError);
          const isServerError = 
            errorMessage === 'SERVER_NOT_INITIALIZED' ||
            errorMessage === 'SERVER_NOT_RUNNING' ||
            (typeof errorMessage === 'string' && (
              errorMessage.includes('snapshot_id') ||
              errorMessage.includes('null value') ||
              errorMessage.includes('violates not-null constraint') ||
              errorMessage.includes('Failed to fetch') ||
              errorMessage.includes('ECONNREFUSED')
            ));
          
          if (isServerError) {
            // Show user-friendly message about server not being started
            dispatch({ 
              type: 'SET_NOTIFICATION', 
              notification: { 
                message: `Server not initialized. Please ensure the database server is running and properly configured.`,
                isError: true,
              } 
            });
            // Auto-hide after 8 seconds for server errors (longer than normal)
            setTimeout(() => {
              dispatch({ type: 'SET_NOTIFICATION', notification: null });
            }, 8000);
          } else {
            // Update notification to be more user-friendly for other errors
            dispatch({ 
              type: 'SET_NOTIFICATION', 
              notification: { 
                message: `Your design has been sent to production!`,
              } 
            });
            // Auto-hide after 5 seconds
            setTimeout(() => {
              dispatch({ type: 'SET_NOTIFICATION', notification: null });
            }, 5000);
          }
        }
      })();

      // Set status to done (duplicate removed)
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
      console.error('Error in handleSubmit:', e);
      dispatch({ type: 'SET_STATUS', status: 'error' });
      const errorMessage = e instanceof Error ? e.message : 'Failed to submit to manufacturing.';
      dispatch({ type: 'SET_ERROR', error: errorMessage });
      
      // Also show error notification
      dispatch({ 
        type: 'SET_NOTIFICATION', 
        notification: { 
          message: `Unable to submit your design. Please try again.`,
        } 
      });
      setTimeout(() => {
        dispatch({ type: 'SET_NOTIFICATION', notification: null });
      }, 5000);
    }
  };

  return (
    <div className="w-full h-full bg-[#FAFAFA] text-slate-900 flex flex-col">
      {/* --- PREVIEW MODAL --- */}
      {state.showPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300 p-2 md:p-4">
          <div className="relative w-full max-w-6xl h-[95vh] bg-white rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col">
            {/* Header - Compact */}
            <div className="flex-shrink-0 flex items-center justify-between p-4 md:p-5 border-b border-slate-200 bg-gradient-to-r from-blue-50 to-indigo-50">
              <div className="flex items-center gap-2 md:gap-3">
                <Box className="text-blue-600" size={20} />
                <div>
                  <h2 className="text-lg md:text-xl font-black text-slate-900">3D Digital Twin Preview</h2>
                  <p className="text-[10px] md:text-xs text-slate-500 font-medium">SeedCore Precision Mockup</p>
                </div>
              </div>
              <button
                onClick={() => dispatch({ type: 'SET_PREVIEW', show: false })}
                className="p-2 rounded-full hover:bg-white/80 text-slate-500 hover:text-slate-900 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Preview Content */}
            <div className="flex-1 overflow-y-auto p-3 md:p-4">
              {state.previewSnapshot ? (
                <div className="h-full flex flex-col gap-3 md:gap-4">
                  {/* Rendered Preview - Maximized for image display */}
                  <div className="flex-1 flex flex-col min-h-0 bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl md:rounded-2xl p-3 md:p-4 border border-slate-200">
                    <div className="flex-shrink-0 flex items-center justify-between mb-2 md:mb-3">
                      <div className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-slate-400">Rendered Snapshot</div>
                      <div className="px-2 md:px-3 py-0.5 md:py-1 bg-emerald-100 text-emerald-700 text-[10px] md:text-xs font-bold rounded-full">
                        Pre-Production QA Ready
                      </div>
                    </div>
                    {/* Image Container - Maximized space for larger image */}
                    <div className="flex-1 flex items-center justify-center min-h-0 overflow-auto">
                      <div className="w-full h-full flex items-center justify-center">
                        <img
                          src={state.previewSnapshot}
                          alt="3D Digital Twin Preview"
                          className="max-w-[95%] max-h-[95%] w-auto h-auto object-contain rounded-lg md:rounded-xl shadow-2xl border-2 md:border-4 border-white"
                          style={{ imageRendering: 'auto' }}
                        />
                      </div>
                    </div>
                    {/* Metadata overlay - Compact at bottom */}
                    <div className="flex-shrink-0 mt-2 md:mt-3 flex flex-wrap gap-1.5 md:gap-2 text-[10px] md:text-xs">
                      <div className="px-2 md:px-3 py-1 md:py-1.5 bg-blue-600/90 text-white rounded-md md:rounded-lg font-semibold">
                        Anchor: {state.designDraft?.printSpec?.placement?.toLowerCase() || 'center_chest'}
                      </div>
                      <div className="px-2 md:px-3 py-1 md:py-1.5 bg-blue-600/90 text-white rounded-md md:rounded-lg font-semibold">
                        Scale: 0.45
                      </div>
                      <div className="px-2 md:px-3 py-1 md:py-1.5 bg-blue-600/90 text-white rounded-md md:rounded-lg font-semibold">
                        Warp: {state.designDraft?.fabricType.toLowerCase().includes('cotton') ? 'loose_cotton' : 'standard'}
                      </div>
                    </div>
                  </div>

                  {/* Emission Details - Very compact, minimal space */}
                  <div className="flex-shrink-0 grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div className="p-2 bg-blue-50 rounded-lg border border-blue-100">
                      <div className="text-[9px] font-bold uppercase tracking-widest text-blue-600 mb-0.5">Placement Anchor</div>
                      <div className="text-[10px] font-semibold text-slate-900">
                        {state.designDraft?.printSpec?.placement || 'center_chest'}
                      </div>
                    </div>
                    <div className="p-2 bg-indigo-50 rounded-lg border border-indigo-100">
                      <div className="text-[9px] font-bold uppercase tracking-widest text-indigo-600 mb-0.5">Scale Factor</div>
                      <div className="text-[10px] font-semibold text-slate-900">0.45</div>
                    </div>
                    <div className="p-2 bg-purple-50 rounded-lg border border-purple-100">
                      <div className="text-[9px] font-bold uppercase tracking-widest text-purple-600 mb-0.5">Warp Profile</div>
                      <div className="text-[10px] font-semibold text-slate-900">
                        {state.designDraft?.fabricType.toLowerCase().includes('cotton') ? 'loose_cotton' : 'standard'}
                      </div>
                    </div>
                    <div className="p-2 bg-emerald-50 rounded-lg border border-emerald-100">
                      <div className="text-[9px] font-bold uppercase tracking-widest text-emerald-600 mb-0.5">Status</div>
                      <div className="text-[10px] font-semibold text-slate-900">Ready</div>
                    </div>
                  </div>

                  {/* Info Note - Compact */}
                  <div className="flex-shrink-0 p-2 md:p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <p className="text-[10px] md:text-xs text-slate-600 leading-relaxed">
                      <strong className="font-bold">Mock SeedCore Integration:</strong> This preview simulates the SeedCore emission processing flow. 
                      In production, this would render a full 3D scene using Three.js with precise UV mapping and warp profiles 
                      for deterministic manufacturing alignment.
                    </p>
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

      {/* --- NOTIFICATION POPUP --- */}
      {state.notification && (
        <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-right fade-in duration-300 pointer-events-auto">
          <div className={`rounded-xl shadow-xl p-4 max-w-md flex items-start gap-3 ${
            state.notification.isError 
              ? 'bg-amber-50 border border-amber-200' 
              : 'bg-emerald-50 border border-emerald-200'
          }`}>
            {state.notification.isError ? (
              <ShieldAlert className="text-amber-600 flex-shrink-0 mt-0.5" size={20} />
            ) : (
              <CheckCircle2 className="text-emerald-600 flex-shrink-0 mt-0.5" size={20} />
            )}
            <div className="flex-1">
              <p className={`text-sm font-semibold ${
                state.notification.isError ? 'text-amber-900' : 'text-emerald-900'
              }`}>
                {state.notification.message}
              </p>
              {state.notification.taskId && (
                <p className={`text-xs mt-2 opacity-70 ${
                  state.notification.isError ? 'text-amber-600' : 'text-emerald-600'
                }`}>
                  Reference: {state.notification.taskId.slice(0, 8)}...
                </p>
              )}
            </div>
            <button
              onClick={() => dispatch({ type: 'SET_NOTIFICATION', notification: null })}
              className={`transition-colors flex-shrink-0 ${
                state.notification.isError 
                  ? 'text-amber-600 hover:text-amber-800' 
                  : 'text-emerald-600 hover:text-emerald-800'
              }`}
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

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
         <div className="lg:col-span-8 bg-white relative flex flex-col overflow-hidden">
             {/* Background Pattern - pointer-events-none so it doesn't block clicks */}
             <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
             
            {state.designDraft ? (
                <div className="flex-1 overflow-y-auto p-8">
                    <div className="w-full max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-8 duration-700">
                        {/* Top Action Bar - Preview Button */}
                        <div className="mb-6 flex justify-end">
                            <PreviewButton
                                onClick={handlePreview}
                                disabled={!state.designDraft || isBusy}
                            />
                        </div>

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
                                 onSubmit={() => {
                                   console.log('[WearableStudio] ActionsBar onSubmit called', {
                                     policyDecision: state.policyDecision,
                                     allowed: state.policyDecision?.allowed,
                                     isBusy,
                                   });
                                   handleSubmit().catch((error) => {
                                     console.error('[WearableStudio] Unhandled error in handleSubmit:', error);
                                   });
                                 }}
                               />
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
  const [view, setView] = useState<'production' | 'placement'>('placement');

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

function PreviewButton({ 
  onClick, 
  disabled 
}: { 
  onClick: () => void; 
  disabled: boolean;
}) {
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

function ActionsBar({ disabled, submitting, onSubmit }: { disabled: boolean; submitting: boolean; onSubmit: () => void }) {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    console.log('[ActionsBar] click fired', {
      defaultPrevented: e.defaultPrevented,
      disabled,
      submitting,
      target: e.target,
      currentTarget: e.currentTarget,
      buttonElement: e.currentTarget as HTMLButtonElement,
      pointerEvents: window.getComputedStyle(e.currentTarget as HTMLElement).pointerEvents,
    });

    // Check what element is actually at the click position
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const elementAtPoint = document.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2
    );
    console.log('[ActionsBar] Element at click position:', elementAtPoint, 'is button?', elementAtPoint === e.currentTarget);

    // Temporarily remove preventDefault/stopPropagation for debugging
    // e.preventDefault();
    // e.stopPropagation();

    if (disabled || submitting) {
      console.log('[ActionsBar] blocked by state - disabled:', disabled, 'submitting:', submitting);
      return;
    }

    console.log('[ActionsBar] Calling onSubmit...');
    Promise.resolve(onSubmit())
      .then(() => console.log('[ActionsBar] onSubmit resolved'))
      .catch((err) => console.error('[ActionsBar] onSubmit rejected', err));
  };

  return (
    <div className="flex gap-3">
      <button
        onClick={handleClick}
        disabled={false} // Temporarily disable the disabled attribute to allow clicks for debugging
        type="button"
        className={`flex-1 py-4 rounded-xl font-bold uppercase tracking-widest text-xs transition-colors flex items-center justify-center gap-2 ${
          disabled || submitting
            ? 'bg-slate-400 text-slate-200 cursor-not-allowed opacity-60'
            : 'bg-slate-900 text-white hover:bg-slate-800'
        }`}
        title={disabled ? `Button disabled - Policy: ${disabled ? 'not allowed' : 'allowed'}, Busy: ${submitting}` : 'Send to manufacturing'}
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
