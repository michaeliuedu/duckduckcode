import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// In development the Go backend is proxied under the dev server's own origin,
// so the browser talks to `/api` and `/ws` on http://localhost:5173 exactly as
// it does in production behind the ALB. That keeps one code path for URLs and
// means no CORS configuration is needed to run `npm run dev`.
const backendOrigin = process.env.BACKEND_ORIGIN ?? "http://localhost:8080";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: backendOrigin, changeOrigin: true },
      "/ws": { target: backendOrigin, changeOrigin: true, ws: true },
      "/healthz": { target: backendOrigin, changeOrigin: true },
      "/readyz": { target: backendOrigin, changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
  test: {
    // Unit tests only; Playwright owns e2e/*.spec.ts.
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "node",
  },
});
