import { Router, type NextFunction, type Request, type Response } from "express";
import { SCAN_HISTORY_LIMIT, SCAN_INTERVAL_OPTIONS } from "../shared/constants";
import { validateAlertInput, validateNotifyEmail } from "../shared/validation";
import {
  countPendingNotifications,
  deleteAlert,
  getAlert,
  getSettings,
  insertAlert,
  latestScan,
  listAlerts,
  listJobs,
  listMatches,
  listScans,
  syncAlertMatches,
  updateAlert,
  updateSettings,
  withTransaction,
  type AppDatabase,
} from "./db";
import { HttpError } from "./errors";
import { readSmtpConfig, sendMail } from "./mailer";
import { isScanRunning, runScan, ScanBusyError } from "./scanner";
import { reschedule } from "./scheduler";

function wrap(handler: (req: Request, res: Response) => Promise<void> | void) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve()
      .then(() => handler(req, res))
      .catch(next);
  };
}

function clampHistoryLimit(value: unknown): number {
  const parsed = typeof value === "string" ? Number(value) : SCAN_HISTORY_LIMIT;
  if (!Number.isInteger(parsed) || parsed < 1) {
    return 1;
  }
  return Math.min(parsed, SCAN_HISTORY_LIMIT);
}

function alertId(req: Request): string {
  const value = req.params.id;
  return Array.isArray(value) ? value[0] ?? "" : value;
}

export function createRouter(db: AppDatabase): Router {
  const router = Router();

  router.get(
    "/status",
    wrap((_req, res) => {
      const settings = getSettings(db);
      const smtp = readSmtpConfig();
      res.json({
        notifyEmail: settings.notifyEmail,
        scanIntervalMinutes: settings.scanIntervalMinutes,
        smtpConfigured: smtp.configured,
        smtpFrom: smtp.configured ? smtp.from : null,
        pendingNotificationCount: countPendingNotifications(db),
        scanning: isScanRunning(),
        lastScan: latestScan(db),
      });
    }),
  );

  router.put(
    "/settings",
    wrap((req, res) => {
      const email = validateNotifyEmail(req.body?.notifyEmail);
      if (!email.ok) {
        throw new HttpError(400, email.error);
      }
      const minutes = req.body?.scanIntervalMinutes;
      const allowed = SCAN_INTERVAL_OPTIONS.some((option) => option.minutes === minutes);
      if (!allowed) {
        throw new HttpError(400, "Escolha um intervalo da lista.");
      }
      const settings = updateSettings(db, { notifyEmail: email.value, scanIntervalMinutes: minutes });
      reschedule(db);
      res.json(settings);
    }),
  );

  router.get(
    "/alerts",
    wrap((_req, res) => {
      res.json({ alerts: listAlerts(db) });
    }),
  );

  router.post(
    "/alerts",
    wrap((req, res) => {
      const parsed = validateAlertInput(req.body);
      if (!parsed.ok) {
        throw new HttpError(400, parsed.error);
      }
      const alert = insertAlert(db, parsed.value);
      withTransaction(db, () => {
        syncAlertMatches(db, alert, listJobs(db));
      });
      res.status(201).json(getAlert(db, alert.id));
    }),
  );

  router.put(
    "/alerts/:id",
    wrap((req, res) => {
      const parsed = validateAlertInput(req.body);
      if (!parsed.ok) {
        throw new HttpError(400, parsed.error);
      }
      const updated = updateAlert(db, alertId(req), parsed.value);
      if (!updated) {
        throw new HttpError(404, "Alerta não encontrado.");
      }
      withTransaction(db, () => {
        syncAlertMatches(db, updated, listJobs(db));
      });
      res.json(getAlert(db, updated.id));
    }),
  );

  router.delete(
    "/alerts/:id",
    wrap((req, res) => {
      if (!deleteAlert(db, alertId(req))) {
        throw new HttpError(404, "Alerta não encontrado.");
      }
      res.json({ ok: true });
    }),
  );

  router.get(
    "/matches",
    wrap((req, res) => {
      const alertIdQuery = typeof req.query.alertId === "string" ? req.query.alertId : "";
      res.json({ matches: listMatches(db, alertIdQuery) });
    }),
  );

  router.post(
    "/scan",
    wrap(async (_req, res) => {
      try {
        const scan = await runScan(db, "manual");
        res.json({ scan });
      } catch (error) {
        if (error instanceof ScanBusyError) {
          throw new HttpError(409, error.message);
        }
        throw error;
      }
    }),
  );

  router.get(
    "/scans",
    wrap((req, res) => {
      res.json({ scans: listScans(db, clampHistoryLimit(req.query.limit)) });
    }),
  );

  router.post(
    "/email/test",
    wrap(async (_req, res) => {
      const smtp = readSmtpConfig();
      if (!smtp.configured) {
        throw new HttpError(400, "Configure o SMTP nas variáveis de ambiente.");
      }
      const notifyEmail = getSettings(db).notifyEmail;
      if (!notifyEmail) {
        throw new HttpError(400, "Informe o e-mail que vai receber os avisos.");
      }
      try {
        await sendMail({
          to: notifyEmail,
          subject: "Radar de vagas: teste de aviso",
          text: "Se esta mensagem chegou, o Radar de vagas consegue avisar quando aparecer uma vaga.",
          html: "<p>Se esta mensagem chegou, o Radar de vagas consegue avisar quando aparecer uma vaga.</p>",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Não foi possível enviar o e-mail.";
        throw new HttpError(400, message);
      }
      res.json({ ok: true });
    }),
  );

  return router;
}
