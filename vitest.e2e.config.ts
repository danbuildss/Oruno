import { defineConfig } from "vitest/config";

// Browser end-to-end tests for the claim website (`pnpm e2e`). They use the test database,
// so don't run them at the same time as `pnpm test`.
export default defineConfig({
  test: {
    include: ["e2e/**/*.e2e.ts"],
    fileParallelism: false,
    globalSetup: ["tests/helpers/global-setup.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
