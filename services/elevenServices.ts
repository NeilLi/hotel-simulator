/**
 * ElevenLabs Service
 * Provides Text-to-Speech (TTS) and Speech-to-Text (STT) functionality
 * Similar structure to geminiService.ts
 */

export interface TTSResult {
  audioUrl: string | null;
  error?: 'API_KEY_MISSING' | 'QUOTA_EXCEEDED' | 'INVALID_VOICE' | 'GENERIC_ERROR';
  message?: string;
}

export interface STTResult {
  text: string | null;
  error?: 'API_KEY_MISSING' | 'INVALID_AUDIO' | 'QUOTA_EXCEEDED' | 'GENERIC_ERROR';
  message?: string;
}

export interface VoiceSettings {
  stability?: number;
  similarity_boost?: number;
  style?: number;
  use_speaker_boost?: boolean;
}

class ElevenLabsService {
  private readonly API_BASE_URL = 'https://api.elevenlabs.io/v1';
  private readonly DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM'; // Rachel
  private readonly DEFAULT_MODEL_ID = 'eleven_multilingual_v2';
  private readonly DEFAULT_STT_MODEL = 'scribe_v1';
  
  // Cache for TTS audio (by text hash)
  private ttsCache = new Map<string, string>();
  private readonly MAX_CACHE_SIZE = 50;
  
  // Throttle TTS requests
  private lastTTSRequestTime = 0;
  private readonly TTS_COOLDOWN_MS = 100; // 100ms cooldown between requests

  private getApiKey(): string | null {
    // Check both possible env var names
    return process.env.ELEVENLABS_API_KEY || process.env.VITE_ELEVENLABS_API_KEY || null;
  }

  private getCacheKey(text: string, voiceId: string, settings?: VoiceSettings): string {
    const settingsStr = settings ? JSON.stringify(settings) : '';
    return `${voiceId}-${text.substring(0, 100)}-${settingsStr}`;
  }

  private async checkApiKey(): Promise<void> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('ELEVENLABS_API_KEY not configured. Please add it to .env.local');
    }
  }

  /**
   * Convert text to speech using ElevenLabs API
   * @param text - The text to convert to speech
   * @param voiceId - Optional voice ID (defaults to Rachel)
   * @param settings - Optional voice settings
   * @returns Promise with audio URL or error
   */
  async textToSpeech(
    text: string,
    voiceId?: string,
    settings?: VoiceSettings
  ): Promise<TTSResult> {
    try {
      await this.checkApiKey();
      
      if (!text || text.trim().length === 0) {
        return { audioUrl: null, error: 'GENERIC_ERROR', message: 'Text cannot be empty' };
      }

      const apiKey = this.getApiKey()!;
      const selectedVoiceId = voiceId || this.DEFAULT_VOICE_ID;
      
      // Check cache first
      const cacheKey = this.getCacheKey(text, selectedVoiceId, settings);
      if (this.ttsCache.has(cacheKey)) {
        console.log(`[ElevenLabsService] Serving cached audio for: ${text.substring(0, 50)}...`);
        return { audioUrl: this.ttsCache.get(cacheKey)! };
      }

      // Throttle requests
      const now = Date.now();
      if (now - this.lastTTSRequestTime < this.TTS_COOLDOWN_MS) {
        await new Promise(resolve => setTimeout(resolve, this.TTS_COOLDOWN_MS - (now - this.lastTTSRequestTime)));
      }
      this.lastTTSRequestTime = Date.now();

      const voiceSettings = {
        stability: settings?.stability ?? 0.35,
        similarity_boost: settings?.similarity_boost ?? 0.75,
        ...(settings?.style !== undefined && { style: settings.style }),
        ...(settings?.use_speaker_boost !== undefined && { use_speaker_boost: settings.use_speaker_boost }),
      };

      const response = await fetch(
        `${this.API_BASE_URL}/text-to-speech/${selectedVoiceId}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'xi-api-key': apiKey,
            'accept': 'audio/mpeg',
          },
          body: JSON.stringify({
            text: text.trim(),
            model_id: this.DEFAULT_MODEL_ID,
            voice_settings: voiceSettings,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[ElevenLabsService] TTS API error:', errorText);
        
        if (response.status === 401) {
          return { audioUrl: null, error: 'API_KEY_MISSING', message: 'Invalid API key' };
        }
        if (response.status === 429) {
          return { audioUrl: null, error: 'QUOTA_EXCEEDED', message: 'Rate limit exceeded' };
        }
        if (response.status === 404) {
          return { audioUrl: null, error: 'INVALID_VOICE', message: 'Voice ID not found' };
        }
        
        return { audioUrl: null, error: 'GENERIC_ERROR', message: errorText || 'TTS request failed' };
      }

      // Convert response to blob URL
      const arrayBuffer = await response.arrayBuffer();
      const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
      const audioUrl = URL.createObjectURL(blob);

      // Cache the audio URL (limit cache size)
      if (this.ttsCache.size >= this.MAX_CACHE_SIZE) {
        // Remove oldest entry (FIFO)
        const firstKey = this.ttsCache.keys().next().value;
        this.ttsCache.delete(firstKey);
      }
      this.ttsCache.set(cacheKey, audioUrl);

      return { audioUrl };
    } catch (error: any) {
      console.error('[ElevenLabsService] TTS error:', error);
      return {
        audioUrl: null,
        error: 'GENERIC_ERROR',
        message: error.message || 'Failed to generate speech',
      };
    }
  }

  /**
   * Convert speech to text using ElevenLabs Speech-to-Text API
   * @param audioBlob - Audio blob or File to transcribe
   * @param modelId - Optional model ID (defaults to scribe_v1)
   * @returns Promise with transcribed text or error
   */
  async speechToText(
    audioBlob: Blob | File,
    modelId?: string
  ): Promise<STTResult> {
    try {
      await this.checkApiKey();

      if (!audioBlob || audioBlob.size === 0) {
        return { text: null, error: 'INVALID_AUDIO', message: 'Audio blob is empty' };
      }

      const apiKey = this.getApiKey()!;
      const selectedModelId = modelId || this.DEFAULT_STT_MODEL;

      const formData = new FormData();
      formData.append('file', audioBlob, audioBlob instanceof File ? audioBlob.name : 'audio.wav');
      formData.append('model_id', selectedModelId);

      const response = await fetch(`${this.API_BASE_URL}/speech-to-text`, {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[ElevenLabsService] STT API error:', errorText);
        
        if (response.status === 401) {
          return { text: null, error: 'API_KEY_MISSING', message: 'Invalid API key' };
        }
        if (response.status === 429) {
          return { text: null, error: 'QUOTA_EXCEEDED', message: 'Rate limit exceeded' };
        }
        if (response.status === 400) {
          return { text: null, error: 'INVALID_AUDIO', message: 'Invalid audio format' };
        }
        
        return { text: null, error: 'GENERIC_ERROR', message: errorText || 'STT request failed' };
      }

      const data = await response.json();
      const text = data?.text || null;

      if (!text) {
        return { text: null, error: 'GENERIC_ERROR', message: 'No transcription returned' };
      }

      return { text };
    } catch (error: any) {
      console.error('[ElevenLabsService] STT error:', error);
      return {
        text: null,
        error: 'GENERIC_ERROR',
        message: error.message || 'Failed to transcribe audio',
      };
    }
  }

  /**
   * Record audio from microphone and convert to text
   * Uses Web Audio API + ElevenLabs STT
   * @param durationMs - Maximum recording duration in milliseconds (default: 5000)
   * @returns Promise with transcribed text or error
   */
  async recordAndTranscribe(durationMs: number = 5000): Promise<STTResult> {
    try {
      if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        return {
          text: null,
          error: 'GENERIC_ERROR',
          message: 'Microphone access not available',
        };
      }

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const mediaRecorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      const recordingPromise = new Promise<Blob>((resolve, reject) => {
        mediaRecorder.onstop = () => {
          stream.getTracks().forEach(track => track.stop());
          const blob = new Blob(chunks, { type: 'audio/webm' });
          resolve(blob);
        };

        mediaRecorder.onerror = (error) => {
          stream.getTracks().forEach(track => track.stop());
          reject(error);
        };
      });

      // Start recording
      mediaRecorder.start();

      // Stop recording after duration
      setTimeout(() => {
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
        }
      }, durationMs);

      // Wait for recording to complete
      const audioBlob = await recordingPromise;

      // Convert to text using STT
      return await this.speechToText(audioBlob);
    } catch (error: any) {
      console.error('[ElevenLabsService] Record and transcribe error:', error);
      
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        return {
          text: null,
          error: 'GENERIC_ERROR',
          message: 'Microphone permission denied',
        };
      }

      return {
        text: null,
        error: 'GENERIC_ERROR',
        message: error.message || 'Failed to record and transcribe',
      };
    }
  }

  /**
   * Clear TTS cache
   */
  clearCache(): void {
    // Revoke all object URLs before clearing
    this.ttsCache.forEach(url => {
      if (url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    });
    this.ttsCache.clear();
    console.log('[ElevenLabsService] Cache cleared');
  }

  /**
   * Get available voices from ElevenLabs API
   * @returns Promise with list of voices
   */
  async getVoices(): Promise<Array<{ voice_id: string; name: string }>> {
    try {
      await this.checkApiKey();
      const apiKey = this.getApiKey()!;

      const response = await fetch(`${this.API_BASE_URL}/voices`, {
        headers: {
          'xi-api-key': apiKey,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch voices: ${response.statusText}`);
      }

      const data = await response.json();
      return data.voices || [];
    } catch (error: any) {
      console.error('[ElevenLabsService] Get voices error:', error);
      return [];
    }
  }
}

export const elevenLabsService = new ElevenLabsService();

