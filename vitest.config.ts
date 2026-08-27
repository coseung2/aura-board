import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

// parent-class-invite-v2 — Vitest config. New test runner (phase7 kickoff).
// Scope is intentionally minimal: run unit-only `*.vitest.{ts,tsx}` files that
// don't require a running Next.js server. Legacy "tsx run" tests in
// src/lib/__tests__/*.test.ts are NOT picked up — they predate this config
// and use a different harness.

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // `import "server-only"` is a Next.js guard; vitest runs outside the
      // Next bundler so we point it at a no-op module.
      "server-only": path.resolve(__dirname, "./test/stubs/server-only.ts"),
      // Auth.js imports this extensionless entrypoint. Vite's native config
      // loader follows Node ESM resolution, while Next's own bundler resolves
      // it to server.js. Keep the unit-test resolver aligned with production.
      "next/server": path.resolve(__dirname, "./node_modules/next/server.js"),
    },
  },
  ssr: {
    // Keep Auth.js inside Vite's resolver so the `next/server` alias above
    // also applies to its extensionless ESM import.
    noExternal: ["next-auth"],
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: [
      "src/**/*.vitest.{ts,tsx}",
      "scripts/loadtest-classroom-metrics.vitest.ts",
      "infra/oracle/**/*.vitest.ts",
    ],
  },
});
