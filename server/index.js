import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { Kafka } from "kafkajs";

// Load environment variables from .env.local
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, "..", ".env.local");
const result = dotenv.config({ path: envPath });
if (result.error) {
  console.warn(`⚠️  Could not load .env.local from ${envPath}:`, result.error.message);
} else {
  console.log(`✅ Loaded .env.local from ${envPath}`);
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Support both VITE_GEMINI_API_KEY and GEMINI_API_KEY
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

// Gemini models to try (in order of preference) - using newer model IDs
const DEFAULT_GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-1.5-pro",
  "gemini-1.0-pro",
];

// Auto-detect available models at startup
let AVAILABLE_MODELS = [...DEFAULT_GEMINI_MODELS];

// Greeting memory (simple in-memory store - per session)
const greetingMemory = new Map();
const GREETING_COOLDOWN_MS = 60000; // 60 seconds

// TTS cache (by text hash)
const ttsCache = new Map();

async function detectAvailableModels() {
  if (!GEMINI_API_KEY) {
    console.warn("[NPC Server] No API key, skipping model detection");
    return;
  }

  try {
    console.log("[NPC Server] Detecting available Gemini models...");
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models",
      {
        headers: {
          "x-goog-api-key": GEMINI_API_KEY,
        },
      }
    );

    if (response.ok) {
      const data = await response.json();
      const models = data.models || [];
      
      // Filter models that support generateContent
      const supportedModels = models
        .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
        .map((m) => m.name.replace("models/", ""))
        .sort((a, b) => {
          // Prefer newer models first
          if (a.includes("2.5")) return -1;
          if (b.includes("2.5")) return 1;
          if (a.includes("2.0")) return -1;
          if (b.includes("2.0")) return 1;
          return 0;
        });

      if (supportedModels.length > 0) {
        AVAILABLE_MODELS = supportedModels;
        console.log(`[NPC Server] ✅ Detected ${supportedModels.length} available models:`);
        supportedModels.slice(0, 5).forEach((m) => console.log(`   - ${m}`));
      } else {
        console.warn("[NPC Server] ⚠️  No models detected, using defaults");
      }
    } else {
      console.warn("[NPC Server] ⚠️  Model detection failed, using defaults");
    }
  } catch (error) {
    console.warn("[NPC Server] ⚠️  Model detection error, using defaults:", error.message);
  }
}

// Initialize model detection (async, but don't block server startup)
detectAvailableModels().catch((err) => {
  console.warn("[NPC Server] Model detection failed:", err.message);
});

// --- 1) NPC line (Gemini) ---
app.post("/api/npc/robot", async (req, res) => {
  try {
    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY not configured" });
    }

    const { scene, trigger, atmosphere, timeOfDay } = req.body ?? {};
    const clientId = req.headers["x-client-id"] || "default"; // Simple client tracking
    const now = Date.now();
    
    // Check greeting cooldown
    const lastGreeting = greetingMemory.get(clientId);
    if (lastGreeting && (now - lastGreeting.timestamp) < GREETING_COOLDOWN_MS) {
      const timeSince = Math.floor((now - lastGreeting.timestamp) / 1000);
      console.log(`[NPC] Cooldown active (${timeSince}s ago), returning shorter acknowledgement`);
      
      // Return a shorter, varied acknowledgement without calling Gemini
      const acknowledgements = [
        "I'm here whenever you need assistance.",
        "Feel free to ask if you need anything.",
        "How can I help you today?",
        "Is there something I can assist with?",
      ];
      const text = acknowledgements[Math.floor(Math.random() * acknowledgements.length)];
      
      return res.json({ text, cached: true });
    }

    const prompt = `You are the hotel concierge robot "Core Concierge" in the ${scene || "Grand Atrium"}.
The user is near you (trigger: ${trigger || "hover"}).
Current atmosphere: ${atmosphere || "neutral"}
Time of day: ${timeOfDay || "day"}

Speak 1-2 short sentences. Warm, futuristic, helpful. Be concise and welcoming.
Vary your phrasing - avoid repeating previous greetings. Reference the lobby ambience if relevant.
No markdown, just plain text.`;

    // Gemini (Generative Language) REST
    // Try models in order (using auto-detected or default list)
    let r;
    let lastError;

    for (const model of AVAILABLE_MODELS) {
      console.log(`[NPC] Attempting model: ${model}`);
      try {
        // Use API key in header (recommended method)
        r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": GEMINI_API_KEY,
            },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.7, maxOutputTokens: 120 },
            }),
          }
        );

        if (r.ok) {
          console.log(`✅ [NPC] Successfully using Gemini model: ${model}`);
          break;
        } else {
          const errText = await r.text();
          lastError = errText;
          console.warn(`⚠️  [NPC] Model ${model} failed (${r.status}), trying next...`, errText.substring(0, 200));
        }
      } catch (e) {
        lastError = e.message;
        console.warn(`⚠️  Model ${model} error:`, e.message);
      }
    }

    if (!r || !r.ok) {
      console.error("Gemini error (all models failed):", lastError);
      return res.status(500).json({ 
        error: "Gemini error", 
        detail: lastError,
        message: "All Gemini models failed. Check your API key and model access."
      });
    }

    const data = await r.json();
    const text =
      data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("")?.trim() ||
      "Welcome. How may I assist you today?";

    // Store greeting in memory
    greetingMemory.set(clientId, { text, timestamp: now });
    
    // Clean up old entries (keep memory usage low)
    if (greetingMemory.size > 100) {
      const oldest = Array.from(greetingMemory.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
      greetingMemory.delete(oldest[0]);
    }

    res.json({ text, cached: false });
  } catch (e) {
    console.error("NPC server error:", e);
    res.status(500).json({ error: "NPC server error", message: e.message });
  }
});

// --- 2) TTS (ElevenLabs) ---
app.post("/api/tts", async (req, res) => {
  try {
    if (!ELEVENLABS_API_KEY) {
      return res.status(500).json({ error: "ELEVENLABS_API_KEY not configured" });
    }

    const { text, voiceId } = req.body ?? {};
    if (!text) return res.status(400).json({ error: "Missing text" });

    // Simple text hash for caching
    const textHash = `${voiceId || "default"}-${text.substring(0, 100)}`;
    
    // Check cache
    if (ttsCache.has(textHash)) {
      console.log(`[TTS] Cache hit for: ${text.substring(0, 50)}...`);
      const cached = ttsCache.get(textHash);
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("X-Cached", "true");
      return res.send(cached);
    }
    
    console.log(`[TTS] Cache miss, generating for: ${text.substring(0, 50)}...`);

    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId || "21m00Tcm4TlvDq8ikWAM"}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": ELEVENLABS_API_KEY,
        "accept": "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.35, similarity_boost: 0.75 },
      }),
    });

    if (!r.ok) {
      const errText = await r.text();
      console.error("ElevenLabs error:", errText);
      return res.status(500).json({ error: "ElevenLabs error", detail: errText });
    }

    // Pipe audio bytes to client
    res.setHeader("Content-Type", "audio/mpeg");
    const arrayBuffer = await r.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Cache the audio (limit cache size)
    if (ttsCache.size < 50) {
      ttsCache.set(textHash, buffer);
    } else {
      // Remove oldest entry (simple FIFO)
      const firstKey = ttsCache.keys().next().value;
      ttsCache.delete(firstKey);
      ttsCache.set(textHash, buffer);
    }
    
    res.send(buffer);
  } catch (e) {
    console.error("TTS server error:", e);
    res.status(500).json({ error: "TTS server error", message: e.message });
  }
});

// --- 3) Kafka Publisher Endpoint ---
let kafkaClient = null;
let kafkaProducer = null;

// Check if Confluent/Kafka is enabled
const CONFLUENT_ENABLED = process.env.CONFLUENT_ENABLED === "true" || process.env.CONFLUENT_ENABLED === "1";

// Support both CONFLUENT_* and KAFKA_* env vars (CONFLUENT_* takes precedence)
const CONFLUENT_BOOTSTRAP_SERVERS = process.env.CONFLUENT_BOOTSTRAP_SERVERS;
const CONFLUENT_API_KEY = process.env.CONFLUENT_API_KEY;
const CONFLUENT_API_SECRET = process.env.CONFLUENT_API_SECRET;
const CONFLUENT_SECURITY_PROTOCOL = process.env.CONFLUENT_SECURITY_PROTOCOL;

// Use CONFLUENT_* if available, otherwise fall back to KAFKA_*
const KAFKA_BROKERS = CONFLUENT_BOOTSTRAP_SERVERS 
  ? [CONFLUENT_BOOTSTRAP_SERVERS]
  : (process.env.KAFKA_BROKERS?.split(",") || []);
const KAFKA_CLIENT_ID = process.env.KAFKA_CLIENT_ID || "seedcore-server";
const KAFKA_USERNAME = CONFLUENT_API_KEY || process.env.KAFKA_USERNAME;
const KAFKA_PASSWORD = CONFLUENT_API_SECRET || process.env.KAFKA_PASSWORD;
// SSL is true if CONFLUENT_SECURITY_PROTOCOL is SASL_SSL, or if KAFKA_SSL is "true"
const KAFKA_SSL = CONFLUENT_SECURITY_PROTOCOL === "SASL_SSL" || process.env.KAFKA_SSL === "true";

if (CONFLUENT_ENABLED && KAFKA_BROKERS.length > 0 && KAFKA_BROKERS[0]) {
  try {
    kafkaClient = new Kafka({
      clientId: KAFKA_CLIENT_ID,
      brokers: KAFKA_BROKERS,
      ssl: KAFKA_SSL,
      sasl: KAFKA_USERNAME ? {
        mechanism: "plain",
        username: KAFKA_USERNAME,
        password: KAFKA_PASSWORD || "",
      } : undefined,
    });

    kafkaProducer = kafkaClient.producer();
    kafkaProducer.connect().then(() => {
      console.log("[Kafka] ✅ Connected to brokers:", KAFKA_BROKERS);
      if (CONFLUENT_BOOTSTRAP_SERVERS) {
        console.log("[Kafka] Using Confluent Cloud configuration");
      }
    }).catch((err) => {
      console.error("[Kafka] ❌ Connection failed:", err.message);
    });
  } catch (error) {
    console.warn("[Kafka] ⚠️  Initialization failed:", error.message);
  }
} else {
  if (!CONFLUENT_ENABLED) {
    console.log("[Kafka] ⚠️  Disabled (CONFLUENT_ENABLED is not 'true' or '1')");
  } else {
    console.log("[Kafka] ⚠️  Disabled (no KAFKA_BROKERS or CONFLUENT_BOOTSTRAP_SERVERS in env)");
  }
}

// Allowed event types (meaningful events only)
const ALLOWED_EVENT_TYPES = new Set([
  "ui.hotspot.entered",
  "ui.hotspot.left",
  "ui.voice.transcript.final",
  "ui.button.clicked",
  "ui.keyboard.pressed",
  "sim.room.occupancy.changed",
  "sim.agent.state.changed",
]);

// --- 4) Events Endpoint (publishes to seedcore.hotel.events) ---
app.post("/api/events", async (req, res) => {
  try {
    // Check if Confluent is enabled first
    if (!CONFLUENT_ENABLED) {
      // If Confluent is disabled, accept events but don't publish
      return res.json({ 
        success: true, 
        published: 0,
        message: "Confluent disabled (CONFLUENT_ENABLED is not 'true')"
      });
    }

    if (!kafkaProducer) {
      // If Kafka not configured, still return success (dev mode)
      return res.json({ 
        success: true, 
        published: 0,
        message: "Kafka not configured (missing broker/credentials)"
      });
    }

    const { events } = req.body ?? {};
    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: "Missing or empty events array" });
    }

    // Filter: Only publish allowed event types
    const allowedEvents = events.filter((event) => {
      if (!event.type || !ALLOWED_EVENT_TYPES.has(event.type)) {
        if (process.env.NODE_ENV !== "production") {
          console.log(`[Events] Dropping non-allowed event type: ${event.type}`);
        }
        return false;
      }
      return true;
    });

    if (allowedEvents.length === 0) {
      return res.json({ 
        success: true, 
        published: 0,
        message: "No allowed events to publish"
      });
    }

    // Publish to single topic: seedcore.hotel.events
    // Key = sessionId (ensures ordering per session across partitions)
    const messages = allowedEvents.map((event) => ({
      key: event.sessionId || "unknown",
      value: JSON.stringify(event),
    }));

    await kafkaProducer.send({
      topic: "seedcore.hotel.events",
      messages: messages,
    });

    // Only log periodically to avoid message storm (every 100 total events or first 10 batches)
    if (!global.eventPublishCount) global.eventPublishCount = 0;
    global.eventPublishCount += allowedEvents.length;
    
    const shouldLog = global.eventPublishCount % 100 === 0 || global.eventPublishCount <= 10;
    if (shouldLog) {
      console.log(`[Events] ✅ Published ${allowedEvents.length} events (total: ${global.eventPublishCount}) to seedcore.hotel.events`);
    }

    res.json({ 
      success: true, 
      published: allowedEvents.length,
      dropped: events.length - allowedEvents.length
    });
  } catch (e) {
    console.error("[Events] Publish error:", e);
    res.status(500).json({ error: "Event publish failed", message: e.message });
  }
});

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => {
  console.log(`NPC server running on :${PORT}`);
  if (!GEMINI_API_KEY) {
    console.warn("⚠️  GEMINI_API_KEY not set (check .env.local)");
  } else {
    console.log("✅ GEMINI_API_KEY loaded");
  }
  if (!ELEVENLABS_API_KEY) {
    console.warn("⚠️  ELEVENLABS_API_KEY not set (check .env.local)");
  } else {
    console.log("✅ ELEVENLABS_API_KEY loaded");
  }
  console.log(`[NPC Server] Will try models in order:`, AVAILABLE_MODELS.slice(0, 3).join(", "), "...");
  
  if (CONFLUENT_ENABLED) {
    if (KAFKA_BROKERS.length > 0) {
      console.log(`[Kafka] ✅ Enabled and configured with brokers:`, KAFKA_BROKERS);
      if (CONFLUENT_BOOTSTRAP_SERVERS) {
        console.log(`[Kafka] Using Confluent Cloud (CONFLUENT_* env vars)`);
      } else {
        console.log(`[Kafka] Using KAFKA_* env vars`);
      }
    } else {
      console.log(`[Kafka] ⚠️  Enabled but not configured (no brokers found)`);
    }
  } else {
    console.log(`[Kafka] ⚠️  Disabled (CONFLUENT_ENABLED is not 'true' or '1')`);
  }
});

