import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    // Load environment variables from .env.local and other env files
    // process.cwd() ensures we're loading from the project root where .env.local is located
    const env = loadEnv(mode, process.cwd(), '');
    
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY),
        'process.env.ELEVENLABS_API_KEY': JSON.stringify(env.ELEVENLABS_API_KEY || env.VITE_ELEVENLABS_API_KEY),
        'process.env.VITE_ELEVENLABS_API_KEY': JSON.stringify(env.ELEVENLABS_API_KEY || env.VITE_ELEVENLABS_API_KEY),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
