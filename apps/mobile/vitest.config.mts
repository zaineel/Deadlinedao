import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    // Only the drift test reaches into the web app (../../lib); it uses the web '@/' alias.
    alias: { '@': path.resolve(__dirname, '../..') },
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
