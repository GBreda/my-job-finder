import { randomUUID } from "node:crypto";
import {
  JOBICY_MIN_TAG_LENGTH,
  REQUEST_GAP_MS,
  SOURCE_CACHE_TTL_MS,
  type JobSourceId,
} from "../shared/constants";
import { buildSearchQueries, termKey } from "../shared/match";
import { sourceLabel } from "../shared/sources";
import type { ScanReason, ScanSummary } from "../shared/types";
import {
  getSettings,
  insertScan,
  listAlerts,
  listJobs,
  listPendingDigests,
  markAlertsPrimed,
  markDigestResult,
  readCache,
  syncAlertMatches,
  upsertJobs,
  withTransaction,
  writeCache,
  type AppDatabase,
} from "./db";
import { buildDigest, readSmtpConfig, sendMail } from "./mailer";
import { fetchSourceJobs } from "./sources";

export class ScanBusyError extends Error {
  constructor() {
    super("Já existe uma busca em andamento.");
  }
}

let currentScan: Promise<ScanSummary> | null = null;

export function isScanRunning(): boolean {
  return currentScan !== null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "falha desconhecida";
}

async function loadJobs(db: AppDatabase, source: JobSourceId, query: string, cacheKey: string) {
  const cached = readCache(db, cacheKey);
  const ttl = SOURCE_CACHE_TTL_MS[source];
  if (cached && Date.now() - Date.parse(cached.fetchedAt) < ttl) {
    return { jobs: cached.jobs, network: false, notice: null as string | null };
  }
  try {
    const jobs = await fetchSourceJobs(source, query);
    writeCache(db, cacheKey, jobs);
    return { jobs, network: true, notice: null as string | null };
  } catch (error) {
    if (cached) {
      return {
        jobs: cached.jobs,
        network: true,
        notice: `${sourceLabel(source)} (“${query}”): falha ao atualizar, usando a busca anterior.`,
      };
    }
    throw error;
  }
}

async function deliverDigests(db: AppDatabase, errors: string[]): Promise<{ emailedCount: number; emailSkipped: boolean }> {
  const digests = listPendingDigests(db);
  const pendingCount = digests.reduce((total, digest) => total + digest.jobs.length, 0);
  if (pendingCount === 0) {
    return { emailedCount: 0, emailSkipped: false };
  }

  const smtp = readSmtpConfig();
  const notifyEmail = getSettings(db).notifyEmail;
  if (!smtp.configured || !notifyEmail) {
    return { emailedCount: 0, emailSkipped: true };
  }

  let emailedCount = 0;
  for (const digest of digests) {
    const message = buildDigest({
      alertName: digest.alertName,
      jobs: digest.jobs,
      totalCount: digest.jobs.length,
    });
    const matchIds = digest.jobs.map((job) => job.matchId);
    try {
      await sendMail({ to: notifyEmail, ...message });
      markDigestResult(db, matchIds, "sent", null);
      emailedCount += matchIds.length;
    } catch (error) {
      const messageText = errorMessage(error);
      markDigestResult(db, matchIds, "error", messageText);
      errors.push(`E-mail do alerta “${digest.alertName}”: ${messageText}`);
    }
  }
  return { emailedCount, emailSkipped: false };
}

async function executeScan(db: AppDatabase, reason: ScanReason): Promise<ScanSummary> {
  const startedAt = new Date().toISOString();
  const errors: string[] = [];
  const alerts = listAlerts(db).filter((alert) => alert.active);
  if (alerts.length === 0) {
    const summary: ScanSummary = {
      id: randomUUID(),
      reason,
      startedAt,
      finishedAt: new Date().toISOString(),
      fetchedCount: 0,
      newMatchCount: 0,
      baselineCount: 0,
      emailedCount: 0,
      emailSkipped: false,
      errors,
    };
    if (reason === "manual") {
      insertScan(db, summary);
    }
    return summary;
  }
  let fetchedCount = 0;
  const seenQueries = new Set<string>();

  for (const alert of alerts) {
    for (const source of alert.sources) {
      for (const query of buildSearchQueries(alert)) {
        if (source === "jobicy" && query.trim().length < JOBICY_MIN_TAG_LENGTH) {
          continue;
        }
        const cacheKey = `${source}:${termKey(query)}`;
        if (seenQueries.has(cacheKey)) {
          continue;
        }
        seenQueries.add(cacheKey);
        try {
          const loaded = await loadJobs(db, source, query, cacheKey);
          if (loaded.notice) {
            errors.push(loaded.notice);
          }
          upsertJobs(db, loaded.jobs);
          fetchedCount += loaded.jobs.length;
          if (loaded.network) {
            await delay(REQUEST_GAP_MS);
          }
        } catch (error) {
          errors.push(`${sourceLabel(source)} (“${query}”): ${errorMessage(error)}`);
        }
      }
    }
  }

  const jobs = listJobs(db);
  const recorded = withTransaction(db, () => {
    let pending = 0;
    let baseline = 0;
    for (const alert of alerts) {
      const stats = syncAlertMatches(db, alert, jobs);
      pending += stats.pending;
      baseline += stats.baseline;
    }
    markAlertsPrimed(
      db,
      alerts.map((alert) => alert.id),
    );
    return { pending, baseline };
  });

  const delivery = await deliverDigests(db, errors);
  const summary: ScanSummary = {
    id: randomUUID(),
    reason,
    startedAt,
    finishedAt: new Date().toISOString(),
    fetchedCount,
    newMatchCount: recorded.pending,
    baselineCount: recorded.baseline,
    emailedCount: delivery.emailedCount,
    emailSkipped: delivery.emailSkipped,
    errors,
  };
  insertScan(db, summary);
  return summary;
}

export function runScan(db: AppDatabase, reason: ScanReason): Promise<ScanSummary> {
  if (currentScan) {
    if (reason === "manual") {
      return Promise.reject(new ScanBusyError());
    }
    return currentScan;
  }
  currentScan = executeScan(db, reason).finally(() => {
    currentScan = null;
  });
  return currentScan;
}

export async function sendPendingDigests(db: AppDatabase): Promise<{ emailedCount: number; emailSkipped: boolean; errors: string[] }> {
  const errors: string[] = [];
  const delivery = await deliverDigests(db, errors);
  return { ...delivery, errors };
}
