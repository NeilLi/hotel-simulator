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

const SYSTEM_INSTRUCTION = `Return STRICT JSON only. No markdown. No extra keys.`;

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

const buildMockupPrompt = (intent: WearableIntent, draft: WearableDesignDraft) => {
  const palette = draft.printSpec.palette.join(", ");
  return `High-end studio product photography of a ${intent.style} ${intent.type} in size ${intent.size}.
Design concept: ${draft.designConcept}.
Fabric: ${draft.fabricType}. Print placement: ${draft.printSpec.placement}. Repeat: ${draft.printSpec.repeat}.
Palette: ${palette}.
Show the ENTIRE garment in-frame with generous margin (do not crop sleeves, collar, or hem).
Centered flat-lay (or front-facing hanger shot). Premium lighting, realistic fabric folds, accurate shadows.
White or light grey seamless background. No hands, no models, no props. No text, no watermarks.`;
};

const buildPrintPrompt = (intent: WearableIntent, draft: WearableDesignDraft) => {
  const palette = draft.printSpec.palette.join(", ");
  return `Create ONLY the apparel print artwork (no garment, no scene, no product photo).
Design concept: ${draft.designConcept}.
Palette: ${palette}.
Requirements:
- Isolated graphic on a TRANSPARENT background (or pure white if transparency isn't possible)
- No sky, ocean, rooms, gradients, scenic backdrops, or large rectangular color blocks
- Centered composition, clean edges, print-ready look (screenprint/DTG)
- No text, no watermarks.`;
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
      },
    };
  },
  async designWearable(request: { systemInstruction: string; responseSchema: any; payload: any }) {
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
              printImageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
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
              mockupImageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
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
