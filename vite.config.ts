import { fileURLToPath, URL } from 'node:url'
// Vitest owns this `defineConfig`; Vite's own does not accept the `test` key.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      // Imports are written as `@/world/tiles` rather than `../../world/tiles`.
      // Absolute paths make the architecture layer a module belongs to obvious at
      // a glance, and let ESLint enforce the layer boundaries with simple patterns.
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
