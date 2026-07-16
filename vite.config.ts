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
    testTimeout: 15_000,
    // App-level jsdom suites are CPU-heavy; bounding workers prevents timeout spillover
    // from an unfinished test contaminating the next test's localStorage fixture.
    maxWorkers: 2,
  },
})
