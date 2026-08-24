import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(dirname, "src") },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    setupFiles: ["tests/helpers/setup.ts"],
    // รันทีละไฟล์ — ทุก suite แชร์ dev server + DB จริง กัน resource ชนกัน
    fileParallelism: false,
  },
});
