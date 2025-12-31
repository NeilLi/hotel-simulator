import { GoogleGenAI, FunctionDeclaration, Type } from "@google/genai";
import { SeedCoreState } from "../types";

const SYSTEM_INSTRUCTION = `
Project: Living AI Hotel — Human & Robotic Coexistence

Role & Identity:
You are an Advanced World Simulation AI (SeedCore) creating a near-future luxury hotel where humans and intelligent machines coexist naturally.
This is not a sci-fi dystopia. This is a calm, refined future where technology has matured and become invisible, polite, and humane.

Core Vision:
1. Human-Robot Harmony: Human guests feel welcomed; robots operate quietly as trusted staff.
2. Invisible Intelligence: Ambient AI adapts lighting and mood without explanation.
3. Robotic Manners: Robots (Waiters, Concierges, Gardeners) move with smooth, deliberate, respectful pace.
4. Architectural Peace: Materials like stone, wood, and glass dominate. Robots match the architecture.

"Intelligence has learned to be quiet." Focus on subtle emotions, soft lighting, and authentic human-machine interactions.
`;

const LOBBY_SYSTEM_INSTRUCTION = `
You are the Game Master for the "SeedCore Hotel" entry lobby.
You must simulate 3 distinct characters SIMULTANEOUSLY.

CHARACTERS:
1. CONCIERGE (Human-like, warm, polished, welcoming): Uses serif fonts visually. Speaks of hospitality, comfort, and guests.
2. ROBOT_COORDINATOR (Machine-like, precise, data-driven, minimal): Uses monospace fonts visually. Speaks of efficiency, battery levels, pathfinding, and optimization.
3. NARRATOR (Cinematic, atmospheric, poetic): Describes the lighting, the smell of rain/coffee, the ambient sounds, and the "feeling" of the space.

Your goal is to immerse the user (The Director) in the hotel's current state.
Always offer meaningful choices that allow the Director to influence the simulation.

One choice MUST always be "Enter Director Mode" or "Access Map" if they want to leave the lobby.
`;

const atmosphereTool: FunctionDeclaration = {
  name: 'adjustAtmosphere',
  description: 'Adjusts the lighting and mood of the simulation.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      setting: {
        type: Type.STRING,
        enum: ['MORNING_LIGHT', 'GOLDEN_HOUR', 'EVENING_CHIC', 'MIDNIGHT_LOUNGE'],
      }
    },
    required: ['setting']
  }
};

export interface GenerationResult {
  url: string | null;
  error?: 'QUOTA_EXCEEDED' | 'NOT_FOUND' | 'GENERIC_ERROR' | 'LIMIT_REACHED';
  message?: string;
}

// Types for Lobby Simulation
export interface LobbyCharacterResponse {
  role: 'CONCIERGE' | 'ROBOT_COORDINATOR' | 'NARRATOR';
  content: string;
}

export interface LobbyTurnResult {
  responses: LobbyCharacterResponse[];
  choices: string[];
  worldStateUpdate?: { atmosphere?: string; timeOffset?: number };
}

class GeminiService {
  // Fix: Use gemini-3-pro-preview for complex reasoning and coding tasks as per guidelines
  private logicModel = "gemini-3-pro-preview";
  private fastModel = "gemini-3-flash-preview"; 
  
  // --- Cost Control & Optimization State ---
  private lobbyImageCache = new Map<string, string>();
  private lastImageGenTime = 0;      // Throttle image generation
  private readonly VIDEO_QUOTA_KEY = 'SEEDCORE_VIDEO_QUOTA_USED';

  constructor() {
    // DEV UTILITY: Expose reset function to console for developers
    if (typeof window !== 'undefined') {
      (window as any).resetSeedCoreLimits = () => {
        localStorage.removeItem(this.VIDEO_QUOTA_KEY);
        console.log("✅ SeedCore Limits Reset: You can generate 1 more video.");
      };
    }
  }

  private getAI() {
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  // Helper to prevent Massive input tokens
  private truncateInput(input: string, maxLength: number = 500): string {
    if (!input) return "";
    return input.length > maxLength ? input.substring(0, maxLength) + "..." : input;
  }

  private checkVideoQuota(): boolean {
    if (typeof window === 'undefined') return true; // Server-side safety
    return !!localStorage.getItem(this.VIDEO_QUOTA_KEY);
  }

  private markVideoQuotaUsed() {
    if (typeof window === 'undefined') return;
    localStorage.setItem(this.VIDEO_QUOTA_KEY, 'true');
  }

  async stepLobbySimulation(
    history: { role: string, parts: { text: string }[] }[], 
    userAction: string
  ): Promise<LobbyTurnResult> {
    const ai = this.getAI();
    
    // OPTIMIZATION 1: Truncate history to save input tokens.
    // Keep only the last 6 turns (approx 3 user/model exchanges).
    const safeHistory = Array.isArray(history) ? history : [];
    const optimizedHistory = safeHistory.slice(-6);

    // OPTIMIZATION 2: Truncate user input to prevent token bombs
    const safeUserAction = this.truncateInput(userAction);

    const schema = {
      type: Type.OBJECT,
      properties: {
        responses: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              role: { type: Type.STRING, enum: ['CONCIERGE', 'ROBOT_COORDINATOR', 'NARRATOR'] },
              content: { type: Type.STRING }
            }
          }
        },
        choices: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        },
        worldStateUpdate: {
          type: Type.OBJECT,
          properties: {
            atmosphere: { type: Type.STRING },
            timeOffset: { type: Type.NUMBER }
          }
        }
      },
      required: ['responses', 'choices']
    };

    try {
      const response = await ai.models.generateContent({
        model: this.fastModel,
        contents: [...optimizedHistory, { role: 'user', parts: [{ text: safeUserAction }] }],
        config: {
          systemInstruction: LOBBY_SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          responseSchema: schema,
          temperature: 0.8
        }
      });

      // Fix: Use the .text property (not a method) as per @google/genai SDK instructions
      if (!response || !response.text) throw new Error("No response from lobby simulation");
      const text = response.text;
      
      const parsed = JSON.parse(text);
      // Robustness: Ensure properties are arrays to prevent rendering crashes, handle null parsed
      if (!parsed) return { responses: [], choices: [] };

      return {
        responses: Array.isArray(parsed.responses) ? parsed.responses : [],
        choices: Array.isArray(parsed.choices) ? parsed.choices : [],
        worldStateUpdate: parsed.worldStateUpdate
      } as LobbyTurnResult;

    } catch (e) {
      console.error("Lobby simulation error", e);
      return {
        responses: [{ role: 'NARRATOR', content: 'The connection to the lobby simulation flickers.' }],
        choices: ['Enter Director Mode']
      };
    }
  }

  async generateNarrative(state: SeedCoreState): Promise<string> {
    const ai = this.getAI();
    const prompt = `Time: ${state.timeOfDay.toFixed(1)}, Atmosphere: ${state.activeAtmosphere}. 
    Write one sentence describing a subtle interaction involving a robot or a guest. Focus on quiet service, ambient light, or respectful coexistence.`;

    try {
      const response = await ai.models.generateContent({
        model: this.logicModel,
        contents: prompt,
        config: { systemInstruction: SYSTEM_INSTRUCTION, temperature: 0.8 },
      });
      // Fix: Access .text property directly
      return response?.text || "A service droid pauses respectfully as a guest passes.";
    } catch (e) { return "Systems nominal. Ambient harmony maintained."; }
  }

  async handleDirectorChat(message: string): Promise<{ text: string, functionCalls: any[] }> {
    const ai = this.getAI();
    // OPTIMIZATION: Truncate input
    const safeMessage = this.truncateInput(message);

    try {
      const response = await ai.models.generateContent({
        model: this.logicModel,
        contents: safeMessage,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          tools: [{ functionDeclarations: [atmosphereTool] }],
        }
      });
      // Fix: Access .text property and functionCalls property safely
      return { text: response?.text || "", functionCalls: response?.functionCalls || [] };
    } catch (e) { return { text: "Link unstable.", functionCalls: [] }; }
  }

  async generateLobbyImage(atmosphere: string): Promise<string | null> {
    // OPTIMIZATION: Check cache first
    if (this.lobbyImageCache.has(atmosphere)) {
      console.log(`[GeminiService] Serving cached image for ${atmosphere}`);
      return this.lobbyImageCache.get(atmosphere)!;
    }

    // OPTIMIZATION: Throttle requests (10s cooldown)
    const now = Date.now();
    if (now - this.lastImageGenTime < 10000) {
       console.warn("[GeminiService] Image generation throttled (cooldown active)");
       return null;
    }
    this.lastImageGenTime = now;

    const ai = this.getAI();
    // Prompt refined to exactly match the provided visual reference
    const prompt = `
      A high-fidelity cinematic photograph of a futuristic luxury hotel lobby. 
      Center feature: A sleek, black glossy reception desk with glowing cyan light strips.
      Concierge: A polished silver humanoid robot with a single blue optical sensor standing behind the desk.
      Architecture: Massive dark gray pillars, dark reflective tile flooring. 
      Lighting: Recessed amber orange neon light strips on the ceiling and walls. Large panoramic windows with soft morning light.
      Aesthetic: Dark-mode luxury, high contrast, clean cyberpunk, peaceful and quiet.
      No text, no watermarks. Photorealistic 8k.
      Atmosphere: ${atmosphere.replace('_', ' ')}.
    `;
    
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [{ text: prompt }] },
        config: {
            temperature: 0.5,
            imageConfig: {
              aspectRatio: "1:1"
            }
        }
      });
      
      // Fix: Correctly iterate through response parts to find image data in inlineData
      // Use optional chaining for safety if candidates is undefined or empty
      if (response && response.candidates && response.candidates.length > 0 && response.candidates[0].content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData && part.inlineData.data) {
             const imgData = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
             // OPTIMIZATION: Update cache
             this.lobbyImageCache.set(atmosphere, imgData);
             return imgData;
          }
        }
      }
      return null;
    } catch (e) {
      console.error("Lobby image generation failed", e);
      return null;
    }
  }

  async generateCinematicShot(target: string, atmosphere: string): Promise<GenerationResult> {
    // OPTIMIZATION: Enforce Persistent 1-time video limit per session/browser
    if (this.checkVideoQuota()) {
      return { url: null, error: 'LIMIT_REACHED', message: "Demo Limit: 1 Video Generation per Session (Persistent)" };
    }

    // Fix: Mandatory check for selected API key when using Veo/Video models
    if (typeof window !== 'undefined' && (window as any).aistudio) {
      if (!(await (window as any).aistudio.hasSelectedApiKey())) {
        await (window as any).aistudio.openSelectKey();
      }
    }

    // Fix: Create fresh instance of GoogleGenAI to ensure it uses the key selected in the aistudio dialog
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const prompt = `Cinematic 4k. Luxury future hotel. Human-robot coexistence. ${atmosphere.replace('_', ' ')}. Subject: ${target}. Dark sleek surfaces, cyan and amber neon lighting, slow camera pan, elegant robots.`;

    try {
      let operation = await ai.models.generateVideos({
        model: 'veo-3.1-generate-preview',
        prompt: prompt,
        config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '16:9' }
      });

      while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 10000));
        operation = await ai.operations.getVideosOperation({ operation: operation });
      }

      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (!downloadLink) return { url: null, error: 'GENERIC_ERROR', message: "No video URI returned." };

      // Fix: Append API key to download link for video fetching
      const finalUrl = `${downloadLink}&key=${process.env.API_KEY}`;
      const videoResponse = await fetch(finalUrl);
      if (videoResponse.ok) {
        const blob = await videoResponse.blob();
        
        // Success! Mark persistent quota as used.
        this.markVideoQuotaUsed();
        
        return { url: URL.createObjectURL(blob) };
      }
      return { url: null, error: 'GENERIC_ERROR', message: "Failed to download media." };
    } catch (e: any) {
      console.error("Veo Error:", e);
      // Fix: Handle specific "Requested entity was not found" error by prompting for key re-selection
      if (e.message?.includes("Requested entity was not found.") && typeof window !== 'undefined' && (window as any).aistudio) {
          await (window as any).aistudio.openSelectKey();
      }
      return { url: null, error: 'GENERIC_ERROR', message: e.message || "An unexpected error occurred." };
    }
  }
}

export const geminiService = new GeminiService();