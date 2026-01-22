import { z } from "zod";

export const WearableIntentSchema = z.object({
  story: z.string().min(1),
  style: z.string(),
  type: z.string(),
  size: z.string(),
  persona: z.string().optional().default("guest"),
  constraints: z.array(z.string()).optional().default([]),
});

export type WearableIntent = z.infer<typeof WearableIntentSchema>;

export const WearableDesignDraftSchema = z.object({
  designConcept: z.string(),
  fabricType: z.string(),
  threadCount: z.number().int().min(100).max(1200),
  careInstructions: z.string(),
  printSpec: z.object({
    palette: z.array(z.string()).min(1),
    placement: z.string(),
    repeat: z.string(),
    dpi: z.number().int().min(72).max(1200),
  }),
  safetyTags: z.array(z.string()),
  complianceNotes: z.array(z.string()),
  // Two-stage image strategy:
  // - printPrompt/printImageUrl: "design-grade" artwork (for placement preview)
  // - mockupPrompt/mockupImageUrl: "production-grade" product mockup (end-user preview)
  printPrompt: z.string().optional(),
  mockupPrompt: z.string().optional(),
  printImageUrl: z.string().nullable().optional(),
  mockupImageUrl: z.string().nullable().optional(),

  // Back-compat (older runs)
  imagePrompt: z.string().optional(),
  imageUrl: z.string().url().nullable().optional(),
});

export type WearableDesignDraft = z.infer<typeof WearableDesignDraftSchema>;

export type PolicyDecision = {
  allowed: boolean;
  blocked: boolean;
  requiredOverrides: string[];
  reasons: string[];
  ruleHits: Array<{
    ruleId: string;
    ruleName: string;
    priority: number;
  }>;
};

export type MemoryTier = "event_working" | "knowledge_base";

export type MemoryEvent = {
  tier: MemoryTier;
  category: string;
  content: string;
  metadata: Record<string, any>;
};

export type WearableTicket = {
  ticketId: string;
  runId: string;
  snapshotId?: number;
  snapshotVersion?: string;
  intent: WearableIntent;
  policyDecision: PolicyDecision;
  design: WearableDesignDraft;
  createdAt: string;
};
