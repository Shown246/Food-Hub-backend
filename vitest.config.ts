import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Integration files apply migrations in isolated PostgreSQL schemas. Keep
    // their catalog-changing DDL from racing across worker processes.
    fileParallelism: false,
    setupFiles: ["./tests/setup.ts"],
    restoreMocks: true,
    clearMocks: true,
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
