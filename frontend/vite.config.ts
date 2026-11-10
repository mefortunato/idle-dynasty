import { sveltekit } from '@sveltejs/kit/vite';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => ({
  plugins: [sveltekit()],
  server: { proxy: { '/api': loadEnv(mode, '.', 'API_PROXY_TARGET').API_PROXY_TARGET ?? 'http://localhost:8080' } },
  test: { include: ['src/**/*.test.ts'] }
}));
