import { GoogleGenAI, Type } from "@google/genai";
import { fetchSnapshots, fetchUnifiedMemory } from "./database";
import {
  MemoryEvent,
  PolicyDecision,
  WearableDesignDraft,
  WearableDesignDraftSchema,
  WearableIntent,
  WearableIntentSchema,
  WearableTicket,
} from "./wearableStudioTypes";

const API_BASE_URL = import.meta.env.VITE_DB_PROXY_URL || "http://localhost:3001";

const LLM_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    designConcept: { type: Type.STRING },
    fabricType: { type: Type.STRING },
    threadCount: { type: Type.NUMBER },
    careInstructions: { type: Type.STRING },
    printSpec: {
      type: Type.OBJECT,
      properties: {
        palette: { type: Type.ARRAY, items: { type: Type.STRING } },
        placement: { type: Type.STRING },
        repeat: { type: Type.STRING },
        dpi: { type: Type.NUMBER },
      },
      required: ["palette", "placement", "repeat", "dpi"],
    },
    safetyTags: { type: Type.ARRAY, items: { type: Type.STRING } },
    complianceNotes: { type: Type.ARRAY, items: { type: Type.STRING } },
    printPrompt: { type: Type.STRING },
    mockupPrompt: { type: Type.STRING },
  },
  required: [
    "designConcept",
    "fabricType",
    "threadCount",
    "careInstructions",
    "printSpec",
    "safetyTags",
    "complianceNotes",
    "printPrompt",
    "mockupPrompt",
  ],
};

const SYSTEM_INSTRUCTION = `Return STRICT JSON only. No markdown. No extra keys.
When generating design specifications, STRICTLY follow all user constraints:
- Style (aesthetic): Must match the user-selected style exactly
- Type (garment): Must match the user-selected garment type exactly
- Size: Must match the user-selected size exactly
- Placement: Must respect the specified print placement location
- Ensure printPrompt generates artwork suitable for the exact placement and garment type
- Ensure mockupPrompt generates a plain white garment template (NO design, NO print)`;

const ZERO_SHOT_IMAGE_MODEL = "gemini-2.5-flash-image";
const DESIGN_MODEL = "gemini-3-flash-preview";

const safeJsonParse = (text: string) => {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error("Invalid JSON response from model.");
  }
};

const createRunId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `run_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
};

const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Uploads a design image to Google Cloud Storage via the server API.
 * Handles both data URLs (base64) and regular URLs.
 */
async function uploadDesignToGCS(imageUrl: string, runId: string, suffix: 'print' | 'mockup'): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/api/designs/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageUrl, runId, suffix }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(`Failed to upload design to GCS: ${error.error || response.statusText}`);
  }

  const result = await response.json();
  return result.url;
}

const buildMockupPrompt = (intent: WearableIntent, draft: WearableDesignDraft) => {
  // Generate a plain white T-shirt template WITHOUT any design/paint
  // This ensures consistent placement of the print artwork separately
  return `High-end studio product photography of a plain white ${intent.type} in size ${intent.size}.
Style: ${intent.style} cut and fit.
Fabric: ${draft.fabricType} (white/off-white color only).
CRITICAL: NO design, NO print, NO graphics, NO patterns, NO artwork, NO paint on the garment.
Show ONLY a clean, plain white garment template.
Show the ENTIRE garment in-frame with generous margin (do not crop sleeves, collar, or hem).
Centered flat-lay (or front-facing hanger shot). Premium lighting, realistic fabric folds, accurate shadows.
White or light grey seamless background. No hands, no models, no props. No text, no watermarks.
The garment must be completely blank and white - ready for print placement.`;
};

const buildPrintPrompt = (intent: WearableIntent, draft: WearableDesignDraft) => {
  const palette = draft.printSpec.palette.join(", ");
  const placement = draft.printSpec.placement || 'FRONT';
  const repeat = draft.printSpec.repeat || 'single';
  
  return `Create ONLY the apparel print artwork (no garment, no scene, no product photo).
Design concept: ${draft.designConcept}.
Style: ${intent.style}.
Item type: ${intent.type}.
Size: ${intent.size}.
Print placement: ${placement}.
Repeat pattern: ${repeat}.
Color palette: ${palette}.
Requirements:
- Isolated graphic on a TRANSPARENT background (or pure white if transparency isn't possible)
- No sky, ocean, rooms, gradients, scenic backdrops, or large rectangular color blocks
- Centered composition, clean edges, print-ready look (screenprint/DTG)
- Design must match the ${intent.style} aesthetic style
- Design must be appropriate for ${intent.type} and size ${intent.size}
- Print placement area: ${placement} (ensure design fits this placement area)
- No text, no watermarks.
- The artwork should be ready to be placed on a plain white garment template.`;
};

export const wearableStudioService = {
  createRunId,
  async getActiveSnapshot() {
    const snapshots = await fetchSnapshots();
    const active = snapshots.find((snap) => snap.isActive) || snapshots[0];
    return active || null;
  },
  buildPolicyContext(
    intent: WearableIntent,
    snapshot?: { id: number; version: string; env: string },
    action: string = "generate_design"
  ) {
    return {
      tags: [
        "scene=wearable_story_studio",
        `action=${action}`,
        `wearable_type=${intent.type}`,
        `wearable_style=${intent.style}`,
      ],
      signals: {
        risk_score: Math.min(intent.story.length / 1000, 1),
        content_category: "wearable_story",
        age_rating: "general",
        region: "global",
        device: "router",
      },
      values: {
        size: intent.size,
        persona: intent.persona || "guest",
      },
      snapshot: snapshot
        ? { snapshotId: snapshot.id, version: snapshot.version, env: snapshot.env }
        : undefined,
    };
  },
  async evaluatePolicy(snapshotId: number | undefined, context: any): Promise<PolicyDecision> {
    if (!snapshotId) {
      return {
        allowed: true,
        blocked: false,
        requiredOverrides: [],
        reasons: ["No active snapshot, skipping policy evaluation."],
        ruleHits: [],
      };
    }

    const response = await fetch(`${API_BASE_URL}/api/policy/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snapshotId, context }),
    });

    if (!response.ok) {
      throw new Error(`Policy evaluation failed: ${response.statusText}`);
    }

    return response.json();
  },
  async buildLLMRequest(intent: WearableIntent, policyDecision: PolicyDecision, snapshot?: any) {
    const validatedIntent = WearableIntentSchema.parse(intent);
    const memoryHints = await fetchUnifiedMemory(4).catch(() => []);

    return {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseSchema: LLM_RESPONSE_SCHEMA,
      payload: {
        intent: validatedIntent,
        policy: {
          allowed: policyDecision.allowed,
          requiredOverrides: policyDecision.requiredOverrides,
          reasons: policyDecision.reasons,
        },
        snapshot,
        memoryHints: memoryHints.map((item) => ({
          tier: item.memoryTier,
          category: item.category,
          content: item.content,
        })),
        outputContract: "JSON_ONLY",
        constraints: {
          style: validatedIntent.style,
          type: validatedIntent.type,
          size: validatedIntent.size,
          story: validatedIntent.story,
          requiresPlainWhiteMockup: true,
          requiresSeparatePrintArtwork: true,
          instructions: "The mockupPrompt MUST generate a plain white garment template with NO design. The printPrompt MUST generate standalone print artwork suitable for placement on the white template.",
        },
      },
    };
  },
  async designWearable(request: { systemInstruction: string; responseSchema: any; payload: any }, runId?: string) {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: DESIGN_MODEL,
      contents: JSON.stringify(request.payload),
      config: {
        systemInstruction: request.systemInstruction,
        responseMimeType: "application/json",
        responseSchema: request.responseSchema,
        temperature: 0.35,
      },
    });

    if (!response?.text) {
      throw new Error("No response from design model.");
    }

    const parsed = safeJsonParse(response.text);
    const validated = WearableDesignDraftSchema.parse(parsed);

    const intent = request.payload.intent as WearableIntent;
    const designRunId = runId || createRunId();

    // 1) Print artwork (design-grade)
    let printImageUrl: string | null = null;
    const printPrompt = validated.printPrompt || validated.imagePrompt || buildPrintPrompt(intent, validated);
    if (printPrompt) {
      try {
        const printResponse = await ai.models.generateContent({
          model: ZERO_SHOT_IMAGE_MODEL,
          contents: { parts: [{ text: printPrompt }] },
          config: { imageConfig: { aspectRatio: "1:1" } },
        });

        if (printResponse.candidates?.[0]?.content?.parts) {
          for (const part of printResponse.candidates[0].content.parts) {
            if (part.inlineData?.data) {
              const tempDataUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
              // Upload to GCS and get permanent URL
              try {
                printImageUrl = await uploadDesignToGCS(tempDataUrl, designRunId, 'print');
              } catch (uploadError) {
                console.warn("Failed to upload print image to GCS, using data URL", uploadError);
                printImageUrl = tempDataUrl; // Fallback to data URL
              }
              break;
            }
          }
        }
      } catch (error) {
        console.warn("Wearable print image generation failed", error);
      }
    }

    // 2) Production mockup (end-user grade)
    let mockupImageUrl: string | null = null;
    const mockupPrompt = validated.mockupPrompt || buildMockupPrompt(intent, validated);
    if (mockupPrompt) {
      try {
        const mockupResponse = await ai.models.generateContent({
          model: ZERO_SHOT_IMAGE_MODEL,
          contents: { parts: [{ text: mockupPrompt }] },
          // Production mockups benefit from a taller frame to keep the full garment in view.
          config: { imageConfig: { aspectRatio: "3:4" } },
        });

        if (mockupResponse.candidates?.[0]?.content?.parts) {
          for (const part of mockupResponse.candidates[0].content.parts) {
            if (part.inlineData?.data) {
              const tempDataUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
              // Upload to GCS and get permanent URL
              try {
                mockupImageUrl = await uploadDesignToGCS(tempDataUrl, designRunId, 'mockup');
              } catch (uploadError) {
                console.warn("Failed to upload mockup image to GCS, using data URL", uploadError);
                mockupImageUrl = tempDataUrl; // Fallback to data URL
              }
              break;
            }
          }
        }
      } catch (error) {
        console.warn("Wearable mockup image generation failed", error);
      }
    }

    // Back-compat: expose a reasonable default for existing UI consumers
    const imageUrl = mockupImageUrl || printImageUrl || null;
    const imagePrompt = mockupPrompt || printPrompt || undefined;

    return {
      ...validated,
      printPrompt,
      mockupPrompt,
      printImageUrl,
      mockupImageUrl,
      imageUrl,
      imagePrompt,
    };
  },
  async appendMemory(event: MemoryEvent, runId?: string) {
    const response = await fetch(`${API_BASE_URL}/api/memory/append`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...event, runId }),
    });

    if (!response.ok) {
      throw new Error(`Failed to append memory: ${response.statusText}`);
    }

    return response.json();
  },
  async submitTicket(ticket: WearableTicket) {
    const response = await fetch(`${API_BASE_URL}/api/mfg/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ticket),
    });

    if (!response.ok) {
      throw new Error(`Failed to submit ticket: ${response.statusText}`);
    }

    return response.json();
  },
  buildTicket(intent: WearableIntent, decision: PolicyDecision, draft: WearableDesignDraft, snapshot?: any): WearableTicket {
    return {
      ticketId: `SEEDCORE-MFG-${Math.floor(Math.random() * 100000)}`,
      runId: createRunId(),
      snapshotId: snapshot?.id,
      snapshotVersion: snapshot?.version,
      intent,
      policyDecision: decision,
      design: draft,
      createdAt: new Date().toISOString(),
    };
  },
  buildFallbackImagePrompt,
};

function buildFallbackImagePrompt(intent: WearableIntent, draft: WearableDesignDraft) {
  return buildMockupPrompt(intent, draft);
}
