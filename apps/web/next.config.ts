import type { NextConfig } from 'next';
import { buildId } from './src/lib/build-info.ts';

// static export; headers, CSP and redirects live in vercel.json, never here.
// cacheComponents / partialPrefetching stay OFF so game routes fully unmount.
const config: NextConfig = {
  output: 'export',
  trailingSlash: true,
  reactStrictMode: true,
  images: { unoptimized: true },
  // Workspace packages are source-first TypeScript.
  transpilePackages: ['@pocketcade/sdk', '@pocketcade/host', '@pocketcade/toolkit'],
  generateBuildId: async () => buildId(),
  // The `typecheck` Turbo task type-checks this app with TypeScript 7 (`tsc --noEmit`); TS 7 ships no
  // compiler API for Next's in-build checker, so the build does not repeat it.
  typescript: { ignoreBuildErrors: true },
  // no upgrade check (it can stop the build and makes a network call), and
  // `next dev` must not write an AGENTS.md into the app.
  agentRules: false,
  experimental: { agentUpgrade: false },
};

export default config;
