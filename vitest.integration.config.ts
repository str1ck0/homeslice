import { defineConfig } from 'vitest/config'
import path from 'node:path'

/**
 * Integration tests hit the real Supabase project, so they are kept out of the
 * default `npm test` run: that suite must stay fast and credential-free.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Users and groups are shared across tests in a file; running the file's
    // tests in order keeps the setup readable.
    fileParallelism: false,
    sequence: { concurrent: false },
    setupFiles: ['./vitest.integration.setup.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
})
