import express, { type NextFunction, type Request, type Response } from "express";
import { JSON_BODY_LIMIT } from "../shared/constants";
import type { AppDatabase } from "./db";
import { HttpError } from "./errors";
import { createRouter } from "./routes";

export function createApp(db: AppDatabase): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use("/api", createRouter(db));
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Rota não encontrada." });
  });
  return app;
}

export function registerErrorHandler(app: express.Express): void {
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    if (error instanceof SyntaxError && "body" in error) {
      res.status(400).json({ error: "JSON inválido." });
      return;
    }
    console.error("[radar]", error);
    res.status(500).json({ error: "Erro interno." });
  });
}
