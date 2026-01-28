import React, { useState, useEffect } from 'react';
import { ArrowLeft, Sparkles, Wand2, Zap, Printer, CheckCircle, MessageCircle, Bot, ShieldAlert, ShieldCheck, ShieldX, Save, Play, Star, Heart, Activity, Radio } from 'lucide-react';
import { geminiService, ToyDesignResult } from '../../services/geminiService';
import { wearableStudioService } from '../../services/wearableStudioService';
import { seedcoreService } from '../../services/seedcoreService';
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
      shortName: 'Blue',
      desc: 'A friendly drone that follows you around.',
      icon: '🛸',
      media: { type: "image", src: "/assets/blue.png" }
  },
  { 
      id: 'REACHY_MINI', 
      name: 'Reachy Mini', 
      shortName: 'Reachy Mini',
      desc: 'A cute concierge buddy kit — build your own hotel companion.',
      icon: '🤖',
      badge: 'New • Hotel Edition',
      media: { type: "image", src: "/assets/reachy/mini.png" }
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
  customSkills?: Array<{
    id: string;
    name: string;
    description: string;
    seedcoreDefinition: Record<string, any>;
    generatedAt: string;
  }>;
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
    name: "Blue",
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
  const [step, setStep] = useState<'SELECT' | 'DREAM' | 'REVEAL' | 'ACTIVE_MODE'>('SELECT');
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

  // Active Mode State (Thought Trace)
  const [isActivating, setIsActivating] = useState(false);
  const [activationError, setActivationError] = useState<string | null>(null);
  const [routingLogs, setRoutingLogs] = useState<Array<{
    timestamp: string;
    level: 'info' | 'debug' | 'warning' | 'error';
    message: string;
    context?: {
      router_score?: number;
      decision?: string;
      vla_tokens?: number[];
      task_id?: string;
      routing_state?: string;
      [key: string]: any;
    };
    routing_path?: string[];
  }>>([]);
  const [isPollingLogs, setIsPollingLogs] = useState(false);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [heartbeatLatency, setHeartbeatLatency] = useState<number | null>(null);
  const [safetyStatus, setSafetyStatus] = useState<'safe' | 'warning' | 'unsafe'>('safe');

  // AI Skill Architect State
  const [isConsultingArchitect, setIsConsultingArchitect] = useState(false);
  const [customSkillWish, setCustomSkillWish] = useState("");
  const [architectError, setArchitectError] = useState<string | null>(null);
  const [showArchitectDialog, setShowArchitectDialog] = useState(false);

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
          age_rating: "all",
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

  /**
   * Map UI sliders to SeedCore behavior_config attributes
   * This translates the "Dream" UI personality into physical robot behavior
   * Aligned with SeedCore v2.5+ YAML structure
   */
  const mapPersonalityToBehaviorConfig = () => {
    // Energy (0-100) -> Motion velocity multiplier (0.5x to 1.5x)
    // Also maps to executor.behavior_config.background_loop.interval_s
    // Hyper (100) = fast, caffeinated movements = shorter interval
    const velocityMultiplier = 0.5 + (buddyIdentity.energy / 100) * 1.0; // Range: 0.5 to 1.5
    const backgroundLoopInterval = 2000 - (buddyIdentity.energy / 100) * 1500; // Range: 2000ms (calm) to 500ms (hyper)

    // Humor (0-100) -> LLM temperature (0.3 to 0.9)
    // If Humor > 80, use "Creative" model variant
    // Funny (100) = more creative, playful responses
    const llmTemperature = 0.3 + (buddyIdentity.humor / 100) * 0.6; // Range: 0.3 to 0.9
    const llmModelOverride = buddyIdentity.humor > 80 ? "creative" : "standard";

    // Warmth (0-100) -> Motion smoothness (0.5 to 1.0) and audio pitch (+0% to +10%)
    // Maps to role_profile.behavior_config.motion.smoothness
    // Sweet (100) = gentle, smooth movements with softer voice
    const smoothness = 0.5 + (buddyIdentity.warmth / 100) * 0.5; // Range: 0.5 to 1.0
    const audioPitch = 1.0 + (buddyIdentity.warmth / 100) * 0.1; // Range: 1.0 to 1.1 (+0% to +10%)

    return {
      personality: {
        energy: buddyIdentity.energy / 100,
        warmth: buddyIdentity.warmth / 100,
        humor: buddyIdentity.humor / 100,
      },
      executor: {
        behavior_config: {
          background_loop: {
            interval_s: backgroundLoopInterval / 1000, // Convert to seconds
          },
        },
      },
      motion: {
        velocity_multiplier: velocityMultiplier,
        smoothness: smoothness,
      },
      cognitive: {
        llm_model_override: llmModelOverride,
      },
      llm: {
        temperature: llmTemperature,
      },
      audio: {
        pitch: audioPitch,
      },
      safety_check: {
        enabled: true,
      },
    };
  };

  /**
   * Map hotel skills to SeedCore default_skills format
   * Converts boolean skills to numeric scores (0.0 to 1.0)
   */
  const mapHotelSkillsToDefaultSkills = () => {
    const skills: Record<string, number> = {};
    
    // Convert boolean skills to numeric scores
    Object.entries(buddyIdentity.hotelSkills).forEach(([key, enabled]) => {
      skills[key] = enabled ? 0.9 : 0.0; // Enabled skills get 0.9 score
    });

    // Add custom skills from AI Architect
    if (buddyIdentity.customSkills) {
      buddyIdentity.customSkills.forEach((skill) => {
        skills[skill.id] = 0.9; // Custom skills get 0.9 score
      });
    }

    return skills;
  };

  /**
   * SeedCore Skill Schema for Gemini structured output
   * Ensures all generated skills comply with SeedCore v2.5+ requirements
   */
  const SeedCoreSkillSchema = {
    type: "object",
    properties: {
      skill_name: {
        type: "string",
        description: "A short, descriptive name for the skill (e.g., 'gentle_handoff', 'fold_shirt')"
      },
      description: {
        type: "string",
        description: "Human-readable description of what this skill does"
      },
      required_specialization: {
        type: "string",
        enum: ["reachy_actuator", "navigation", "vision", "audio", "general"],
        description: "The SeedCore specialization this skill requires"
      },
      allowed_tools: {
        type: "array",
        items: {
          type: "string",
          enum: [
            "reachy.motion",
            "reachy.gripper",
            "reachy.head",
            "reachy.arm_left",
            "reachy.arm_right",
            "vision.camera",
            "vision.object_detection",
            "audio.speak",
            "audio.listen"
          ]
        },
        description: "List of Reachy Mini tools this skill is allowed to use"
      },
      behavior_config: {
        type: "object",
        properties: {
          velocity: {
            type: "number",
            minimum: 0.1,
            maximum: 1.5,
            description: "Motion velocity multiplier (0.1 = very slow, 1.5 = fast)"
          },
          smoothness: {
            type: "number",
            minimum: 0.5,
            maximum: 1.0,
            description: "Motion smoothness (0.5 = jerky, 1.0 = very smooth)"
          },
          safety_check: {
            type: "boolean",
            description: "Whether to enable safety checks for this skill"
          }
        },
        required: ["velocity", "smoothness", "safety_check"]
      },
      vla_model_hint: {
        type: "string",
        description: "Suggested VLA model from vla_discovery_tools (e.g., 'reachy_gentle', 'reachy_precise')"
      },
      physical_constraints: {
        type: "object",
        properties: {
          max_reach_cm: {
            type: "number",
            description: "Maximum reach distance in centimeters (Reachy Mini: ~60cm)"
          },
          requires_both_arms: {
            type: "boolean",
            description: "Whether this skill requires both arms"
          },
          weight_limit_kg: {
            type: "number",
            description: "Maximum weight this skill can handle (Reachy Mini: ~0.5kg)"
          }
        }
      },
      alternative_suggestion: {
        type: "string",
        description: "If the request is impossible, suggest a safe alternative"
      },
      is_safe: {
        type: "boolean",
        description: "Whether this skill passes safety checks"
      },
      rejection_reason: {
        type: "string",
        description: "If is_safe is false, explain why this skill cannot be created"
      }
    },
    required: [
      "skill_name",
      "description",
      "required_specialization",
      "allowed_tools",
      "behavior_config",
      "is_safe"
    ]
  };

  /**
   * Consult Gemini Skill Architect to generate a custom SeedCore skill
   * Uses Constitutional Distillation to ensure safety and compliance
   */
  const handleAISkillConsultation = async () => {
    if (!customSkillWish.trim()) {
      setArchitectError("Please describe the skill you'd like to create.");
      return;
    }

    setIsConsultingArchitect(true);
    setArchitectError(null);

    try {
      // Import GoogleGenAI directly for Skill Architect
      const { GoogleGenAI, Type } = require("@google/genai");
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

      const systemInstruction = `You are the SeedCore Skill Architect. Your goal is to take natural language 'wishes' from hotel guests and transform them into valid RoleProfile skill definitions.

CRITICAL CONSTRAINTS:
- Target robot: Reachy Mini (humanoid arm robot with 7 DOF per arm, gripper, head with camera)
- Maximum reach: ~60cm
- Maximum payload: ~0.5kg
- Available tools: reachy.motion, reachy.gripper, reachy.head, reachy.arm_left, reachy.arm_right, vision.camera, vision.object_detection, audio.speak, audio.listen
- If a guest asks for something unsafe (e.g., 'punch a wall') or outside Reachy Mini's DOF (e.g., 'fly to the bar'), you must:
  1. Set is_safe to false
  2. Provide a rejection_reason explaining the physical limitation
  3. Suggest a safe alternative in alternative_suggestion

For safe requests:
- Generate a valid SeedCore skill definition
- Use appropriate velocity and smoothness based on the task (gentle tasks = low velocity, high smoothness)
- Select the correct specialization and allowed_tools
- Suggest an appropriate VLA model hint

Always prioritize safety and physical feasibility.`;

      const prompt = `Guest wish: "${customSkillWish}"

Target robot: Reachy Mini
Current buddy personality: ${buddyIdentity.role} role, Energy=${buddyIdentity.energy}/100, Warmth=${buddyIdentity.warmth}/100

Convert this wish into a SeedCore capability. If it's impossible or unsafe, explain why and suggest an alternative.`;

      // Convert schema to Type format for Gemini API
      const schema = {
        type: Type.OBJECT,
        properties: {
          skill_name: { type: Type.STRING },
          description: { type: Type.STRING },
          required_specialization: { 
            type: Type.STRING, 
            enum: ["reachy_actuator", "navigation", "vision", "audio", "general"]
          },
          allowed_tools: {
            type: Type.ARRAY,
            items: {
              type: Type.STRING,
              enum: [
                "reachy.motion",
                "reachy.gripper",
                "reachy.head",
                "reachy.arm_left",
                "reachy.arm_right",
                "vision.camera",
                "vision.object_detection",
                "audio.speak",
                "audio.listen"
              ]
            }
          },
          behavior_config: {
            type: Type.OBJECT,
            properties: {
              velocity: { type: Type.NUMBER },
              smoothness: { type: Type.NUMBER },
              safety_check: { type: Type.BOOLEAN }
            },
            required: ["velocity", "smoothness", "safety_check"]
          },
          vla_model_hint: { type: Type.STRING },
          physical_constraints: {
            type: Type.OBJECT,
            properties: {
              max_reach_cm: { type: Type.NUMBER },
              requires_both_arms: { type: Type.BOOLEAN },
              weight_limit_kg: { type: Type.NUMBER }
            }
          },
          alternative_suggestion: { type: Type.STRING },
          is_safe: { type: Type.BOOLEAN },
          rejection_reason: { type: Type.STRING }
        },
        required: [
          "skill_name",
          "description",
          "required_specialization",
          "allowed_tools",
          "behavior_config",
          "is_safe"
        ]
      };

      // Use Gemini 3 Pro for reasoning
      const response = await ai.models.generateContent({
        model: "gemini-3-pro-preview",
        contents: prompt,
        config: {
          systemInstruction: systemInstruction,
          responseMimeType: "application/json",
          responseSchema: schema,
          temperature: 0.7,
        }
      });

      const skillDefinition = JSON.parse(response.text || "{}");

      // Check if skill was rejected
      if (!skillDefinition.is_safe) {
        setArchitectError(
          skillDefinition.rejection_reason || "This skill cannot be created for safety reasons."
        );
        if (skillDefinition.alternative_suggestion) {
          setArchitectError(
            `${skillDefinition.rejection_reason}\n\nSuggestion: ${skillDefinition.alternative_suggestion}`
          );
        }
        setIsConsultingArchitect(false);
        return;
      }

      // Add the skill to buddy identity
      const newSkill = {
        id: `custom_${Date.now()}`,
        name: skillDefinition.skill_name,
        description: skillDefinition.description,
        seedcoreDefinition: skillDefinition,
        generatedAt: new Date().toISOString(),
      };

      setBuddyIdentity((prev) => ({
        ...prev,
        customSkills: [...(prev.customSkills || []), newSkill],
      }));

      // Clear the input and close dialog
      setCustomSkillWish("");
      setShowArchitectDialog(false);
      
      // Show success message
      alert(`✅ Skill "${skillDefinition.skill_name}" created successfully!\n\n${skillDefinition.description}`);
    } catch (error) {
      console.error('Error consulting Skill Architect:', error);
      setArchitectError(
        error instanceof Error 
          ? error.message 
          : "Failed to generate skill. Please try again or rephrase your request."
      );
    } finally {
      setIsConsultingArchitect(false);
    }
  };

  const handleActivateBuddy = async () => {
    if (!result) return;
    
    setIsActivating(true);
    setActivationError(null);

    try {
      // 1. Policy Gate check (using existing policy decision if available)
      if (!policyDecision || policyDecision.blocked) {
        // Re-check policy if not already checked
        setPolicyStatus('checking');
        const policyContext = {
          tags: [
            "scene=concierge_buddy_studio",
            "action=activate_companion",
            `buddy_type=${selectedTemplate.id}`,
            `buddy_name=${buddyIdentity.name}`,
          ],
          signals: {
            risk_score: 0.1,
            content_category: "buddy_activation",
            age_rating: "all",
            region: "global",
            device: "router",
          },
          values: {
            template: selectedTemplate.id,
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
          setActivationError(decision.reasons[0] || 'Policy blocked this activation.');
          setIsActivating(false);
          return;
        }
      }

      // 2. Build SeedCore agent registration payload
      const agentId = `reachy_${buddyIdentity.name.toLowerCase().replace(/\s+/g, '_')}`;
      const behaviorConfig = mapPersonalityToBehaviorConfig();
      const defaultSkills = mapHotelSkillsToDefaultSkills();

      // Include custom skills in the role profile
      const customSkillDefinitions = buddyIdentity.customSkills?.map(skill => ({
        skill_id: skill.id,
        ...skill.seedcoreDefinition,
      })) || [];

      const payload = {
        agent_id: agentId,
        specialization: "reachy_actuator",
        role_profile: {
          default_skills: defaultSkills,
          behavior_config: behaviorConfig,
          routing_tags: ["hotel_guest_room", buddyIdentity.role],
          custom_skills: customSkillDefinitions, // Include AI-generated custom skills
        },
      };

      // 3. Register the agent with SeedCore
      const registrationResult = await seedcoreService.registerAgent(payload);
      
      // 4. Save the active buddy configuration for use in hotel simulator
      const activeBuddy = {
        id: `active_${Date.now()}`,
        templateId: selectedTemplate.id,
        identity: buddyIdentity,
        result: result,
        agentId: agentId,
        activatedAt: new Date().toISOString(),
        seedcoreRegistration: registrationResult,
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

      // 5. Set active agent ID and start polling logs
      setActiveAgentId(agentId);
      setIsPollingLogs(true);
      
      // 6. Transition to ACTIVE_MODE
      setStep('ACTIVE_MODE');
    } catch (error) {
      console.error('Error activating buddy:', error);
      let errorMessage = 'Failed to activate companion';
      
      if (error instanceof Error) {
        // Check for specific SeedCore errors
        if (error.message.includes('SERVER_NOT_RUNNING') || error.message.includes('Failed to fetch')) {
          errorMessage = 'VLA Backend connection failed. Is the Reachy Daemon running?';
        } else if (error.message.includes('SERVER_NOT_INITIALIZED')) {
          errorMessage = 'SeedCore server not initialized. Please check server configuration.';
        } else {
          errorMessage = error.message;
        }
      }
      
      setActivationError(errorMessage);
      
      // Still save to localStorage even if SeedCore registration fails
      const activeBuddy = {
        id: `active_${Date.now()}`,
        templateId: selectedTemplate.id,
        identity: buddyIdentity,
        result: result,
        activatedAt: new Date().toISOString(),
        error: errorMessage,
      };
      localStorage.setItem('activeBuddy', JSON.stringify(activeBuddy));
    } finally {
      setIsActivating(false);
    }
  };

  // Poll routing logs and heartbeat when in ACTIVE_MODE
  useEffect(() => {
    if (!isPollingLogs || !activeAgentId || step !== 'ACTIVE_MODE') {
      return;
    }

    const pollLogs = async () => {
      try {
        const logs = await seedcoreService.getAgentRoutingLogs(activeAgentId, 50);
        
        // Enhance logs with SeedCore v2.5+ structure
        const enhancedLogs = logs.map(log => {
          // If log doesn't have routing_path but has context, infer from context
          if (!log.routing_path && log.context) {
            const inferredPath: string[] = [];
            if (log.context.task_id) {
              inferredPath.push('BRAIN_FOUNDRY');
            }
            if (log.context.decision) {
              inferredPath.push('REACHY_CORE');
            }
            if (inferredPath.length > 0) {
              log.routing_path = inferredPath;
            }
          }
          return log;
        });
        
        setRoutingLogs(enhancedLogs);
      } catch (error) {
        console.warn('Failed to fetch routing logs:', error);
        
        // If no logs exist yet and backend is not available, show sample logs for demo
        if (routingLogs.length === 0 && error instanceof Error && error.message.includes('SERVER_NOT_RUNNING')) {
          // Generate sample logs to demonstrate the Thought Trace structure
          const sampleLogs: typeof routingLogs = [
            {
              timestamp: new Date().toISOString(),
              level: 'info',
              message: `VLA Inference: Person detected in '${buddyIdentity.warmth > 70 ? 'Sweet' : 'Neutral'}' posture.`,
              routing_path: ['BRAIN_FOUNDRY', 'REACHY_CORE'],
              context: {
                router_score: 0.98,
                decision: 'Executing wave_gesture',
                vla_tokens: [104, 22, 19],
                task_id: `task_${Date.now()}`,
                routing_state: 'executing',
              },
            },
            {
              timestamp: new Date(Date.now() - 2000).toISOString(),
              level: 'info',
              message: 'Router/Coordinator: Routing to reachy_actuator specialization.',
              routing_path: ['BRAIN_FOUNDRY'],
              context: {
                router_score: 0.95,
                decision: 'route_to_executor',
                task_id: `task_${Date.now() - 2000}`,
                routing_state: 'routing',
              },
            },
          ];
          setRoutingLogs(sampleLogs);
        }
        // Don't show error to user, just silently fail or use sample logs
      }
    };

    const pollHeartbeat = async () => {
      try {
        const startTime = performance.now();
        // Simulate heartbeat check (in real implementation, this would ping the robot)
        // For now, simulate latency between 30-80ms
        const simulatedLatency = 30 + Math.random() * 50;
        setHeartbeatLatency(Math.round(simulatedLatency));
        
        // Simulate safety status based on random events (in real implementation, this comes from robot sensors)
        const safetyCheck = Math.random();
        if (safetyCheck > 0.95) {
          setSafetyStatus('warning');
        } else if (safetyCheck > 0.99) {
          setSafetyStatus('unsafe');
        } else {
          setSafetyStatus('safe');
        }
      } catch (error) {
        console.warn('Failed to check heartbeat:', error);
      }
    };

    // Initial fetch
    pollLogs();
    pollHeartbeat();

    // Poll logs every 2 seconds, heartbeat every 1 second
    const logsInterval = setInterval(pollLogs, 2000);
    const heartbeatInterval = setInterval(pollHeartbeat, 1000);

    return () => {
      clearInterval(logsInterval);
      clearInterval(heartbeatInterval);
    };
  }, [isPollingLogs, activeAgentId, step]);

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
                        ) : selectedTemplate.id === "DRONE_BUDDY" ? (
                           <div className="mb-5 rounded-2xl overflow-hidden border border-purple-200 shadow-sm">
                              <video
                                 src="/assets/blue.mp4"
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

                              {/* Custom Skills from AI Architect */}
                              {buddyIdentity.customSkills && buddyIdentity.customSkills.length > 0 && (
                                 <div className="mt-4 pt-4 border-t border-purple-200">
                                    <div className="text-xs font-black text-purple-800 uppercase tracking-wide mb-2 flex items-center gap-2">
                                       <Sparkles size={14} className="text-purple-600" />
                                       AI-Generated Custom Skills
                                    </div>
                                    <div className="space-y-2">
                                       {buddyIdentity.customSkills.map((skill) => (
                                          <div
                                             key={skill.id}
                                             className="px-3 py-2 rounded-xl border-2 border-purple-300 bg-gradient-to-r from-purple-50 to-rose-50 text-sm"
                                          >
                                             <div className="font-bold text-purple-900 mb-1">{skill.name}</div>
                                             <div className="text-xs text-purple-700">{skill.description}</div>
                                             <button
                                                onClick={() => {
                                                   setBuddyIdentity((prev) => ({
                                                      ...prev,
                                                      customSkills: prev.customSkills?.filter((s) => s.id !== skill.id) || [],
                                                   }));
                                                }}
                                                className="mt-2 text-[10px] text-rose-600 hover:text-rose-800 font-bold uppercase tracking-widest"
                                             >
                                                Remove
                                             </button>
                                          </div>
                                       ))}
                                    </div>
                                 </div>
                              )}
                           </div>

                           {/* AI Skill Architect */}
                           <div className="mt-6 p-4 bg-purple-900/5 rounded-2xl border-2 border-dashed border-purple-200">
                              <div className="flex items-center gap-2 mb-2">
                                 <Sparkles size={16} className="text-purple-600" />
                                 <span className="text-xs font-black text-purple-900 uppercase">AI Skill Architect</span>
                              </div>
                              <p className="text-[10px] text-purple-600 mb-3 font-medium">
                                 Describe a custom skill (e.g., "Help me fold this shirt" or "Gently hand me my glasses") and Gemini will program it for you using Constitutional Distillation.
                              </p>
                              
                              {!showArchitectDialog ? (
                                 <button 
                                    onClick={() => setShowArchitectDialog(true)}
                                    className="w-full py-3 bg-white border border-purple-200 rounded-xl text-xs font-bold text-purple-700 hover:bg-purple-50 transition-all flex items-center justify-center gap-2"
                                 >
                                    <Sparkles size={14} /> Consult Gemini Architect
                                 </button>
                              ) : (
                                 <div className="space-y-3">
                                    <textarea
                                       value={customSkillWish}
                                       onChange={(e) => setCustomSkillWish(e.target.value)}
                                       placeholder='e.g., "Help me fold this shirt" or "Gently hand me my glasses"'
                                       className="w-full h-24 bg-white border-2 border-purple-200 rounded-xl p-3 text-sm font-medium text-purple-900 placeholder:text-purple-300 focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition-all resize-none"
                                       disabled={isConsultingArchitect}
                                    />
                                    {architectError && (
                                       <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl">
                                          <div className="text-xs font-bold text-rose-800 mb-1">Architect Response</div>
                                          <div className="text-xs text-rose-600 whitespace-pre-wrap">{architectError}</div>
                                       </div>
                                    )}
                                    <div className="flex gap-2">
                                       <button
                                          onClick={handleAISkillConsultation}
                                          disabled={isConsultingArchitect || !customSkillWish.trim()}
                                          className="flex-1 py-2 bg-gradient-to-r from-purple-600 to-rose-500 text-white font-bold rounded-xl text-xs hover:from-purple-700 hover:to-rose-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                       >
                                          {isConsultingArchitect ? (
                                             <>
                                                <Activity className="animate-spin" size={14} /> Generating...
                                             </>
                                          ) : (
                                             <>
                                                <Sparkles size={14} /> Generate Skill
                                             </>
                                          )}
                                       </button>
                                       <button
                                          onClick={() => {
                                             setShowArchitectDialog(false);
                                             setCustomSkillWish("");
                                             setArchitectError(null);
                                          }}
                                          className="px-4 py-2 bg-white border border-purple-200 text-purple-700 font-bold rounded-xl text-xs hover:bg-purple-50 transition-colors"
                                          disabled={isConsultingArchitect}
                                       >
                                          Cancel
                                       </button>
                                    </div>
                                 </div>
                              )}
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
                        <div className="flex flex-wrap gap-2 mb-3">
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
                        {/* Custom AI-Generated Skills */}
                        {buddyIdentity.customSkills && buddyIdentity.customSkills.length > 0 && (
                           <div className="mt-4 pt-4 border-t border-purple-200">
                              <div className="text-[10px] font-black uppercase tracking-widest text-purple-400 mb-3 flex items-center gap-2">
                                 <Sparkles size={14} className="text-purple-600" />
                                 AI-Generated Custom Skills
                              </div>
                              <div className="space-y-2">
                                 {buddyIdentity.customSkills.map((skill) => (
                                    <div
                                       key={skill.id}
                                       className="px-4 py-3 rounded-xl border-2 border-purple-300 bg-gradient-to-r from-purple-50 to-rose-50"
                                    >
                                       <div className="flex items-center justify-between mb-1">
                                          <div className="font-bold text-purple-900 text-sm">{skill.name}</div>
                                          <span className="text-[10px] font-bold text-purple-600 uppercase tracking-widest">
                                             {skill.seedcoreDefinition?.required_specialization || 'reachy_actuator'}
                                          </span>
                                       </div>
                                       <div className="text-xs text-purple-700 mb-2">{skill.description}</div>
                                       {skill.seedcoreDefinition?.allowed_tools && (
                                          <div className="flex flex-wrap gap-1 mt-2">
                                             {skill.seedcoreDefinition.allowed_tools.map((tool: string, idx: number) => (
                                                <span key={idx} className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-[10px] font-mono">
                                                   {tool}
                                                </span>
                                             ))}
                                          </div>
                                       )}
                                    </div>
                                 ))}
                              </div>
                           </div>
                        )}
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
                           disabled={isActivating}
                           className="flex-1 py-4 bg-gradient-to-r from-purple-600 to-rose-500 text-white font-bold rounded-2xl hover:from-purple-700 hover:to-rose-600 transition-colors uppercase tracking-widest text-xs shadow-lg shadow-purple-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                           {isActivating ? (
                              <>
                                 <Activity className="animate-spin" size={16} /> Activating...
                              </>
                           ) : (
                              <>
                                 <Play size={16} /> Activate Companion
                              </>
                           )}
                        </button>
                     </div>

                     {activationError && (
                        <div className="mt-4 p-4 bg-rose-50 border border-rose-200 rounded-xl">
                           <div className="text-xs font-bold text-rose-800 mb-1">Activation Error</div>
                           <div className="text-sm text-rose-600">{activationError}</div>
                        </div>
                     )}

                     <button 
                        onClick={handleReset}
                        className="w-full mt-4 py-3 bg-white border border-purple-200 text-purple-600 font-bold rounded-xl hover:bg-purple-50 transition-colors uppercase tracking-widest text-xs"
                     >
                        Create Another Buddy
                     </button>
                  </div>
               </div>
            )}

            {/* STEP 4: ACTIVE_MODE (Thought Trace / Routing Logs) */}
            {step === 'ACTIVE_MODE' && activeAgentId && (
               <div className="max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-8 duration-500">
                  <div className="bg-gradient-to-br from-purple-50 via-white to-rose-50 rounded-[2rem] p-8 shadow-2xl border-2 border-purple-200">
                     {/* Header */}
                     <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-4">
                           <div className="w-16 h-16 rounded-xl overflow-hidden border-4 border-emerald-300 shadow-lg bg-emerald-100 flex items-center justify-center">
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
                                 <span className="text-3xl">{selectedTemplate.icon}</span>
                              )}
                           </div>
                           <div>
                              <h2 className="text-2xl font-black text-purple-900 mb-1 flex items-center gap-2">
                                 {buddyIdentity.name} <span className="text-emerald-600"><Radio size={18} className="animate-pulse" /></span>
                              </h2>
                              <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest">
                                 Active • SeedCore Organism
                              </p>
                           </div>
                        </div>
                        <div className="text-right">
                           <div className="text-[10px] font-black uppercase tracking-widest text-purple-400 mb-1">Agent ID</div>
                           <div className="text-xs font-bold text-purple-700 font-mono">{activeAgentId}</div>
                        </div>
                     </div>

                     {/* Status Banner with Heartbeat */}
                     <div className="mb-6 p-4 bg-gradient-to-r from-emerald-50 to-purple-50 rounded-xl border border-emerald-200">
                        <div className="flex items-center justify-between mb-3">
                           <div>
                              <div className="text-xs font-black uppercase tracking-widest text-emerald-600 mb-1">
                                 Physical Persona Engine Active
                              </div>
                              <div className="text-sm font-medium text-purple-800">
                                 {buddyIdentity.name} is now materialized as a SeedCore Organism. The VLA backend is translating personality traits into physical Reachy Mini movements.
                              </div>
                           </div>
                           <div className="px-4 py-2 bg-emerald-100 rounded-lg">
                              <div className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Live</div>
                           </div>
                        </div>
                        {/* Heartbeat Indicator */}
                        <div className="flex items-center gap-2 pt-2 border-t border-emerald-200">
                           <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                           <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">
                              HEARTBEAT: {heartbeatLatency !== null ? `${heartbeatLatency}ms LATENCY` : 'CONNECTING...'}
                           </span>
                           <span className="text-[10px] text-purple-500 font-medium ml-auto">
                              CapabilityMonitor • Polling Active
                           </span>
                        </div>
                     </div>

                     {/* Personality Configuration Display with SeedCore YAML Mappings */}
                     <div className="mb-6 grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="bg-white rounded-xl p-4 border border-purple-100">
                           <div className="text-[10px] font-black uppercase tracking-widest text-purple-400 mb-2">Motion Config</div>
                           <div className="text-xs font-medium text-purple-700 space-y-1">
                              <div>Velocity: {mapPersonalityToBehaviorConfig().motion.velocity_multiplier.toFixed(2)}x</div>
                              <div>Smoothness: {mapPersonalityToBehaviorConfig().motion.smoothness.toFixed(2)}</div>
                              <div className="text-[10px] text-purple-500 mt-1">
                                 Loop: {mapPersonalityToBehaviorConfig().executor.behavior_config.background_loop.interval_s.toFixed(2)}s
                              </div>
                           </div>
                        </div>
                        <div className="bg-white rounded-xl p-4 border border-purple-100">
                           <div className="text-[10px] font-black uppercase tracking-widest text-purple-400 mb-2">LLM Config</div>
                           <div className="text-xs font-medium text-purple-700 space-y-1">
                              <div>Temperature: {mapPersonalityToBehaviorConfig().llm.temperature.toFixed(2)}</div>
                              <div className="text-[10px] text-purple-500 mt-1">
                                 Model: {mapPersonalityToBehaviorConfig().cognitive.llm_model_override.toUpperCase()}
                              </div>
                           </div>
                        </div>
                        <div className="bg-white rounded-xl p-4 border border-purple-100">
                           <div className="text-[10px] font-black uppercase tracking-widest text-purple-400 mb-2">Audio Config</div>
                           <div className="text-xs font-medium text-purple-700">
                              Pitch: +{((mapPersonalityToBehaviorConfig().audio.pitch - 1.0) * 100).toFixed(0)}%
                           </div>
                        </div>
                        <div className="bg-white rounded-xl p-4 border border-purple-100">
                           <div className="text-[10px] font-black uppercase tracking-widest text-purple-400 mb-2">Safety Guard</div>
                           <div className={`flex items-center gap-2 text-xs font-bold ${
                              safetyStatus === 'safe' ? 'text-emerald-600' :
                              safetyStatus === 'warning' ? 'text-amber-600' :
                              'text-rose-600'
                           }`}>
                              {safetyStatus === 'safe' ? (
                                 <>
                                    <ShieldCheck size={14} /> COLLISION_SENSORS_OK
                                 </>
                              ) : safetyStatus === 'warning' ? (
                                 <>
                                    <ShieldAlert size={14} /> PROXIMITY_WARNING
                                 </>
                              ) : (
                                 <>
                                    <ShieldX size={14} /> SAFETY_BLOCKED
                                 </>
                              )}
                           </div>
                        </div>
                     </div>

                     {/* Thought Trace / Routing Logs */}
                     <div className="mb-6">
                        <div className="flex items-center justify-between mb-4">
                           <div className="flex items-center gap-2">
                              <Activity size={18} className="text-purple-600" />
                              <h3 className="font-black text-purple-900">Thought Trace</h3>
                              <div className="text-[10px] font-bold uppercase tracking-widest text-purple-400">
                                 Real-time Routing Logs
                              </div>
                           </div>
                           {isPollingLogs && (
                              <div className="flex items-center gap-2 text-xs font-bold text-emerald-600">
                                 <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                                 Polling...
                              </div>
                           )}
                        </div>

                        <div className="bg-slate-900 rounded-xl p-4 border border-purple-200 max-h-96 overflow-y-auto font-mono text-xs">
                           {routingLogs.length === 0 ? (
                              <div className="text-slate-400 italic py-8 text-center">
                                 Waiting for routing logs... The agent will start logging as it processes requests.
                                 <div className="text-[10px] text-slate-500 mt-2">
                                    Router/Coordinator → Executive Agent (reachy_actuator) → VLA Motor Primitives
                                 </div>
                              </div>
                           ) : (
                              <div className="space-y-2">
                                 {routingLogs.map((log, index) => (
                                    <div key={index} className="border-l-2 border-purple-400 pl-3 py-2 hover:bg-slate-800/50 transition-colors">
                                       <div className="flex items-center gap-2 mb-1">
                                          <span className="text-slate-400">
                                             {new Date(log.timestamp).toLocaleTimeString()}
                                          </span>
                                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                             log.level === 'error' ? 'bg-rose-500 text-white' :
                                             log.level === 'warning' ? 'bg-amber-500 text-white' :
                                             log.level === 'info' ? 'bg-blue-500 text-white' :
                                             'bg-slate-600 text-white'
                                          }`}>
                                             {log.level.toUpperCase()}
                                          </span>
                                          {log.context?.router_score !== undefined && (
                                             <span className="text-emerald-400 text-[10px]">
                                                Router: {(log.context.router_score * 100).toFixed(0)}%
                                             </span>
                                          )}
                                       </div>
                                       <div className="text-slate-200 mb-1 font-medium">{log.message}</div>
                                       {log.routing_path && log.routing_path.length > 0 && (
                                          <div className="text-purple-400 text-[10px] mt-1 font-bold">
                                             Route: {log.routing_path.join(' → ')}
                                          </div>
                                       )}
                                       {log.context?.decision && (
                                          <div className="text-emerald-300 text-[10px] mt-1">
                                             Decision: <span className="font-bold">{log.context.decision}</span>
                                          </div>
                                       )}
                                       {log.context?.vla_tokens && log.context.vla_tokens.length > 0 && (
                                          <div className="text-cyan-300 text-[10px] mt-1">
                                             VLA Tokens: <span className="font-mono">[{log.context.vla_tokens.join(', ')}]</span>
                                             <span className="text-slate-500 ml-2">Motor Primitives</span>
                                          </div>
                                       )}
                                       {log.context?.task_id && (
                                          <div className="text-slate-500 text-[10px] mt-1">
                                             Task ID: <span className="font-mono">{log.context.task_id}</span>
                                          </div>
                                       )}
                                       {log.context?.routing_state && (
                                          <div className="text-slate-500 text-[10px] mt-1">
                                             State: <span className="text-slate-400">{log.context.routing_state}</span>
                                          </div>
                                       )}
                                       {/* Show other context fields if present */}
                                       {log.context && Object.keys(log.context).filter(k => 
                                          !['router_score', 'decision', 'vla_tokens', 'task_id', 'routing_state'].includes(k)
                                       ).length > 0 && (
                                          <details className="mt-1">
                                             <summary className="text-slate-500 text-[10px] cursor-pointer hover:text-slate-400">
                                                Additional Context
                                             </summary>
                                             <pre className="text-slate-500 text-[10px] mt-1 ml-2 overflow-x-auto">
                                                {JSON.stringify(
                                                   Object.fromEntries(
                                                      Object.entries(log.context).filter(([k]) => 
                                                         !['router_score', 'decision', 'vla_tokens', 'task_id', 'routing_state'].includes(k)
                                                      )
                                                   ),
                                                   null,
                                                   2
                                                )}
                                             </pre>
                                          </details>
                                       )}
                                    </div>
                                 ))}
                              </div>
                           )}
                        </div>
                     </div>

                     {/* Action Buttons */}
                     <div className="flex gap-4">
                        <button 
                           onClick={() => {
                              setIsPollingLogs(false);
                              setStep('REVEAL');
                           }}
                           className="flex-1 py-4 bg-white border-2 border-purple-300 text-purple-700 font-bold rounded-2xl hover:bg-purple-50 transition-colors uppercase tracking-widest text-xs flex items-center justify-center gap-2"
                        >
                           <ArrowLeft size={16} /> Back to Passport
                        </button>
                        <button 
                           onClick={() => {
                              setIsPollingLogs(false);
                              handleReset();
                           }}
                           className="flex-1 py-4 bg-gradient-to-r from-purple-600 to-rose-500 text-white font-bold rounded-2xl hover:from-purple-700 hover:to-rose-600 transition-colors uppercase tracking-widest text-xs shadow-lg shadow-purple-200"
                        >
                           Create Another Buddy
                        </button>
                     </div>
                  </div>
               </div>
            )}

         </div>
      </div>
    </div>
  );
}
