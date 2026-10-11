import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// The API runs separately in development (python -m waterweave.api, port 8000).
// In production the same API process serves the built files from dist/.
const API_TARGET = process.env.WATERWEAVE_API ?? 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': API_TARGET },
  },
  preview: {
    port: 4173,
    proxy: { '/api': API_TARGET },
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    restoreMocks: true,
  },
})
