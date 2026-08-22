import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const bridgeTarget = process.env.HERDR_WEB_BRIDGE ?? "http://127.0.0.1:8787";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": bridgeTarget,
      "/ws": {
        target: bridgeTarget,
        ws: true,
      },
    },
  },
  resolve: {
    // The Foundation package is linked from the integration checkout during
    // development; keep its React peer on the web app's singleton instance.
    dedupe: ["react", "react-dom"],
  },
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        foundationConformance: "foundation-conformance.html",
      },
    },
  },
});
