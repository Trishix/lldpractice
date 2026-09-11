import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: { alias: { "server-only": fileURLToPath(new URL("./server-only-test-stub.ts", import.meta.url)) } },
  test: { environment: "node", include: ["scripts/verify-disclosure.test.ts"], testTimeout: 35_000 },
});
