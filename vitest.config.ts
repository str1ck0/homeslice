import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/core/**/*.ts'],
      // src/core is where every money bug lives, so it is held to a high bar.
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
})
