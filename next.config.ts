import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  // Lets the e2e server build next to a running `npm run dev` (see playwright.config.ts).
  distDir: process.env.NEXT_DIST_DIR || '.next',
}

export default nextConfig
