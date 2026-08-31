import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // `crosscheck.localhost` (and any other *.localhost name) resolves to
    // 127.0.0.1 in every modern browser with no hosts-file/DNS setup, so
    // the dev server can be reached at a branded
    // `http://crosscheck.localhost:5173` instead of a bare
    // `http://localhost:5173`. Vite rejects unrecognized Host headers by
    // default, so the name has to be allow-listed here to be usable.
    allowedHosts: ["localhost", "crosscheck.localhost"],
    // Bind every interface, not just the default single `localhost`
    // binding: browsers resolve `crosscheck.localhost` to IPv4 127.0.0.1
    // while `localhost` alone can bind IPv6 ::1 only, which makes the
    // branded hostname fail with "connection refused" even though the
    // server is running.
    host: true,
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
