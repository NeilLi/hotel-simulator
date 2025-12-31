# NPC Server Setup

This server handles NPC interactions (Gemini) and Text-to-Speech (ElevenLabs) for the SeedCore Hotel Simulator.

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Add API keys to `.env.local`:**
   ```bash
   VITE_GEMINI_API_KEY=your_gemini_key_here
   GEMINI_API_KEY=your_gemini_key_here
   ELEVENLABS_API_KEY=your_elevenlabs_key_here
   ```

   Note: `GEMINI_API_KEY` is used by the server, `VITE_GEMINI_API_KEY` is used by the client.

3. **Get ElevenLabs API Key:**
   - Sign up at https://elevenlabs.io
   - Go to Profile → API Key
   - Copy your API key

## Running

### Option 1: Run both servers together
```bash
npm run dev:all
```

### Option 2: Run separately

**Terminal 1 - NPC Server:**
```bash
npm run dev:server
```

**Terminal 2 - Vite Dev Server:**
```bash
npm run dev
```

## API Endpoints

### POST `/api/npc/robot`
Generates NPC dialogue using Gemini.

**Request:**
```json
{
  "scene": "Grand Atrium",
  "trigger": "hover",
  "atmosphere": "warm",
  "timeOfDay": 12
}
```

**Response:**
```json
{
  "text": "Welcome to the Grand Atrium. How may I assist you today?"
}
```

### POST `/api/tts`
Converts text to speech using ElevenLabs.

**Request:**
```json
{
  "text": "Welcome to the Grand Atrium.",
  "voiceId": "21m00Tcm4TlvDq8ikWAM"
}
```

**Response:**
Audio stream (audio/mpeg)

## Voice IDs

Default voice: `21m00Tcm4TlvDq8ikWAM` (Rachel)

You can find more voices at: https://elevenlabs.io/app/voices

## Troubleshooting

- **Server not starting:** Check that port 8787 is available
- **API errors:** Verify API keys are set correctly in `.env.local`
- **CORS errors:** The server includes CORS middleware, should work automatically
- **Audio not playing:** Check browser console for errors, verify ElevenLabs API key


