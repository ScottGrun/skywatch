import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.e2e.ts',
  timeout: 180_000,
  reporter: 'list',
  use: { baseURL: process.env.E2E_URL ?? 'http://localhost:5173', viewport: { width: 1440, height: 900 } },
  webServer: {
    command: process.env.E2E_URL ? 'echo external' : 'pnpm dev --port 5173 --strictPort',
    url: process.env.E2E_URL ?? 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
