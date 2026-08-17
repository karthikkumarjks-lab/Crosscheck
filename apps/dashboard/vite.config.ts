import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // Proxies API calls through this same dev-server origin instead of the
    // browser fetching apps/api's separate port directly. On GitHub
    // Codespaces, each forwarded port is a genuinely different origin
    // requiring its own browser-side auth handshake -- a handshake that
    // top-level navigation completes but a cross-origin fetch()/XHR call
    // cannot, so the dashboard's API calls failed ("Failed to fetch") even
    // after the port-4000 URL had been visited directly. Routing through
    // this origin's own proxy (server-to-server, not browser-to-browser)
    // sidesteps the problem entirely, in local dev too.
    proxy: {
      "/api": "http://localhost:4000",
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
  },
});
