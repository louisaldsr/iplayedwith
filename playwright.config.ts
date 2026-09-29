import { defineConfig, devices } from '@playwright/test'

/**
 * The e2e suite never touches a real database.
 *
 * It starts its OWN dev server — its own port, its own build directory, never an already-running
 * server — with Supabase pointed at an address nothing listens on. The browser side is mocked per
 * test (see tests/e2e/fixtures.ts); a request that slips through to the server fails fast on the
 * dead address instead of reading, or drawing a daily challenge in, the real database.
 *
 * Explicit values here override `.env.local`: Next.js never overwrites a variable already set in
 * the process environment.
 */
const PORT = 3100

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    // Reusing a server would reuse its environment — typically `npm run dev` on the real database.
    reuseExistingServer: false,
    env: {
      // Port 9 (discard): the connection is refused at once, nothing hangs.
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:9',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'e2e-no-database',
      SUPABASE_SERVICE_ROLE_KEY: 'e2e-no-database',
      ADMIN_PASSWORD: 'e2e-admin',
      // A separate build directory, so this server can run next to the developer's `npm run dev`
      // without the two overwriting each other's `.next`.
      NEXT_DIST_DIR: '.next-e2e',
    },
  },
})
