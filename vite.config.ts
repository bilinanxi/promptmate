import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    // The image catalog has more than 3,000 validated rows. Keep a bounded but realistic
    // jsdom budget for interaction-heavy app tests on slower Windows hosts.
    testTimeout: 30_000,
    // App-level jsdom suites share browser globals and are CPU-heavy. Run files serially so
    // a timed-out interaction cannot overlap with and contaminate the next file's fixtures.
    maxWorkers: 1,
  },
})
