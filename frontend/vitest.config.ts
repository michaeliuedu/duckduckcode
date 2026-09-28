import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Unit tests only; Playwright owns e2e/*.spec.ts.
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "node",
  },
});
