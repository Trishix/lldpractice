import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "server-only": new URL("./scripts/server-only-test-stub.ts", import.meta.url).pathname },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
