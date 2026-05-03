import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
    env: {
      // Stub Supabase vars for test runs — no real DB needed
      VITE_SUPABASE_URL:      process.env.VITE_SUPABASE_URL      || 'https://stub.supabase.co',
      VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || 'stub-anon-key-for-tests',
    },
  },
});
