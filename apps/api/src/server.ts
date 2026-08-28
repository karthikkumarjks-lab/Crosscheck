import { randomUUID } from "node:crypto";
import express, { type Express } from "express";
import type { ProgressSnapshot } from "@crosscheck/core";
import { startRun } from "./adapter.js";
import type { RunStore } from "./runStore.js";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

/**
 * Component: routing and serialization only (ADR-011) — no route here
 * computes an outcome, institution, or comparison status; every such
 * value in a response originates from the one `startRun` call in
 * adapter.ts. `store` is injected as the `RunStore` interface, never the
 * concrete `InMemoryRunStore`, so a persistent implementation can be
 * substituted later without touching this file.
 */
export function createApp(store: RunStore): Express {
  const app = express();
  app.use(express.json());

  // Minimal, dependency-free CORS for the dashboard's dev server (a
  // different origin/port during development) -- not a new package, just
  // the headers a browser cross-origin request needs.
  //
  // 2026-08-28: `Access-Control-Allow-Private-Network: true` added --
  // live-confirmed necessary once the dashboard is deployed to a public
  // HTTPS origin (crosscheck-app.netlify.app) while this API stays on
  // localhost. Chrome's Private Network Access policy treats that as a
  // public-page-to-private-network request and sends an ADDITIONAL
  // preflight header (`Access-Control-Request-Private-Network: true`)
  // asking the server to explicitly opt in; without this response header
  // the browser silently hangs the request (never rejects it outright,
  // never logs a console error -- it just never resolves), which is
  // exactly what a `localhost`-only dev setup never surfaces, since a
  // request from one `localhost` origin to another isn't cross-origin in
  // the sense this policy cares about.
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Private-Network", "true");
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.post("/api/runs", (req, res) => {
    const { masterUrl, targetUrls } = req.body ?? {};
    if (!isNonEmptyString(masterUrl) || !isStringArray(targetUrls) || targetUrls.length === 0) {
      res.status(400).json({ error: "invalid_request", message: "masterUrl (string) and targetUrls (non-empty string[]) are required" });
      return;
    }

    const runId = randomUUID();
    store.create(runId, masterUrl, targetUrls);

    // Fire-and-forget: the HTTP response returns immediately with the
    // runId; the dashboard polls GET /api/runs/:runId for progress/result.
    // A run can take up to ~3 minutes (the backend's own documented
    // goal), far longer than a request should reasonably stay open.
    startRun(masterUrl, targetUrls, (snapshot: ProgressSnapshot) => store.updateProgress(runId, snapshot))
      .then((result) => store.complete(runId, result))
      .catch((error: unknown) => store.fail(runId, error instanceof Error ? error.message : String(error)));

    res.status(202).json({ runId });
  });

  app.get("/api/runs/:runId", (req, res) => {
    const record = store.get(req.params.runId);
    if (!record) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.status(200).json(record);
  });

  return app;
}
