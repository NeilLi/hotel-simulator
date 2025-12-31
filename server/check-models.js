#!/usr/bin/env node
/**
 * Quick diagnostic script to check which Gemini models are available for your API key
 * 
 * Usage:
 *   node server/check-models.js
 * 
 * Make sure GEMINI_API_KEY is set in .env.local
 */

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, "..", ".env.local");
dotenv.config({ path: envPath });

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY not found in .env.local");
  process.exit(1);
}

console.log("🔍 Checking available Gemini models for your API key...\n");

try {
  // Use API key in header (recommended method)
  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models",
    {
      headers: {
        "x-goog-api-key": GEMINI_API_KEY,
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("❌ Failed to fetch models:", response.status, errorText);
    process.exit(1);
  }

  const data = await response.json();
  const models = data.models || [];

  console.log(`✅ Found ${models.length} models\n`);

  // Filter models that support generateContent
  const generateContentModels = models.filter((m) =>
    m.supportedGenerationMethods?.includes("generateContent")
  );

  console.log("📋 Models supporting generateContent:\n");
  generateContentModels.forEach((model) => {
    console.log(`  ✅ ${model.name}`);
    if (model.displayName) {
      console.log(`     Display: ${model.displayName}`);
    }
    if (model.description) {
      console.log(`     ${model.description.substring(0, 80)}...`);
    }
    console.log("");
  });

  // Recommended models
  const recommended = generateContentModels
    .map((m) => m.name)
    .filter((name) => 
      name.includes("gemini-1.5-pro") || 
      name.includes("gemini-1.0-pro") ||
      name.includes("gemini-1.5-flash")
    );

  if (recommended.length > 0) {
    console.log("💡 Recommended models for NPC server:\n");
    recommended.forEach((name) => {
      console.log(`   ${name}`);
    });
  }
} catch (error) {
  console.error("❌ Error:", error.message);
  process.exit(1);
}

