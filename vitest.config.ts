import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Integration tests share one real Postgres database, so files run one at a time.
    fileParallelism: false,
    globalSetup: ["tests/helpers/global-setup.ts"],
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
