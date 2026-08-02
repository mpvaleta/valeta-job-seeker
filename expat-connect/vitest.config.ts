import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

// Resolve the "@/..." alias (same as tsconfig paths) so tests can import lib code.
export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, './src') }
  },
  test: { environment: 'node' }
});
