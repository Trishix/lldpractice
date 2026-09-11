import { defineConfig } from "vitest/config";
export default defineConfig({ resolve: { alias: { "server-only": new URL("./server-only-test-stub.ts", import.meta.url).pathname } }, test: { environment: "node", include: ["scripts/calibration/run.test.ts"], fileParallelism: false } });
