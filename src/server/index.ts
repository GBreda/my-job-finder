import fs from "node:fs";
import path from "node:path";
import { createServer as createHttpServer } from "node:http";
import { fileURLToPath } from "node:url";
import express from "express";
import { DEFAULT_HOST, DEFAULT_PORT } from "../shared/constants";
import { createApp, registerErrorHandler } from "./app";
import { ensureSettings, openDatabase } from "./db";
import { startScheduler } from "./scheduler";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const isProduction = process.env.NODE_ENV === "production";

function readPort(): number {
  const raw = process.env.PORT;
  if (!raw) {
    return DEFAULT_PORT;
  }
  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0) {
    return DEFAULT_PORT;
  }
  return port;
}

const database = openDatabase(path.join(projectRoot, "data", "radar.db"));
ensureSettings(database);
const app = createApp(database);
const server = createHttpServer(app);

if (isProduction) {
  const clientDist = path.join(projectRoot, "dist", "client");
  const indexFile = path.join(clientDist, "index.html");
  app.use(express.static(clientDist, { index: false }));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api/")) {
      next();
      return;
    }
    if (!fs.existsSync(indexFile)) {
      res.status(500).send("Frontend ainda não foi compilado. Rode npm run build.");
      return;
    }
    res.sendFile(indexFile);
  });
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    root: projectRoot,
    server: { middlewareMode: { server } },
    appType: "spa",
  });
  app.use(vite.middlewares);
}

registerErrorHandler(app);

const port = readPort();
const host = process.env.HOST?.trim() || DEFAULT_HOST;

server.listen(port, host, () => {
  console.log(`[radar] http://${host}:${port}`);
  startScheduler(database);
});
