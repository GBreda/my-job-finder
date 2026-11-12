import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import {
  DEFAULT_SCAN_INTERVAL_MINUTES,
  EXCERPT_CHARS,
  MATCH_LIST_LIMIT,
  SCAN_HISTORY_LIMIT,
  SCAN_INTERVAL_OPTIONS,
  SINGLETON_ROW_ID,
  type JobSourceId,
} from "../shared/constants";
import { matchJob } from "../shared/match";
import { isJobSourceId, sourceLabel } from "../shared/sources";
import { excerpt } from "../shared/text";
import type { Alert, AlertInput, JobContent, JobMatch, NotifyStatus, ScanSummary } from "../shared/types";

export type AppDatabase = DatabaseSync;

export type StoredJob = JobContent & {
  id: string;
  source: JobSourceId;
  externalId: string;
  url: string;
  publishedAt: string | null;
};

export type FetchedJob = Omit<StoredJob, "id">;

type AlertRow = {
  id: string;
  name: string;
  accepted_skills: string;
  required_terms: string;
  excluded_terms: string;
  locations: string;
  sources: string;
  active: number;
  notify_existing: number;
  primed: number;
  created_at: string;
  match_count: number;
};

type MatchRow = {
  id: string;
  alert_id: string;
  alert_name: string;
  title: string;
  company: string;
  location: string;
  workplace: string;
  url: string;
  source: string;
  description: string;
  published_at: string | null;
  matched_terms: string;
  created_at: string;
  notify_status: string;
  notify_error: string | null;
};

type ScanRow = {
  id: string;
  reason: string;
  started_at: string;
  finished_at: string;
  fetched_count: number;
  new_match_count: number;
  baseline_count: number;
  emailed_count: number;
  email_skipped: number;
  errors: string;
};

const NOTIFY_STATUSES = new Set<NotifyStatus>(["pending", "sent", "baseline", "error"]);

export function openDatabase(filePath: string): AppDatabase {
  if (filePath !== ":memory:") {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }
  const db = new DatabaseSync(filePath);
  db.exec("PRAGMA foreign_keys = ON");
  if (filePath !== ":memory:") {
    db.exec("PRAGMA journal_mode = WAL");
  }
  migrate(db);
  return db;
}

function migrate(db: AppDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = ${SINGLETON_ROW_ID}),
      notify_email TEXT NOT NULL,
      scan_interval_minutes INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      accepted_skills TEXT NOT NULL,
      required_terms TEXT NOT NULL,
      excluded_terms TEXT NOT NULL,
      locations TEXT NOT NULL,
      sources TEXT NOT NULL,
      active INTEGER NOT NULL,
      notify_existing INTEGER NOT NULL,
      primed INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      external_id TEXT NOT NULL,
      title TEXT NOT NULL,
      company TEXT NOT NULL,
      location TEXT NOT NULL,
      workplace TEXT NOT NULL,
      url TEXT NOT NULL,
      description TEXT NOT NULL,
      published_at TEXT,
      first_seen_at TEXT NOT NULL,
      UNIQUE (source, external_id)
    );

    CREATE TABLE IF NOT EXISTS matches (
      id TEXT PRIMARY KEY,
      alert_id TEXT NOT NULL,
      job_id TEXT NOT NULL,
      matched_terms TEXT NOT NULL,
      created_at TEXT NOT NULL,
      notify_status TEXT NOT NULL,
      notify_error TEXT,
      notified_at TEXT,
      UNIQUE (alert_id, job_id),
      FOREIGN KEY (alert_id) REFERENCES alerts(id) ON DELETE CASCADE,
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS scans (
      id TEXT PRIMARY KEY,
      reason TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT NOT NULL,
      fetched_count INTEGER NOT NULL,
      new_match_count INTEGER NOT NULL,
      baseline_count INTEGER NOT NULL,
      emailed_count INTEGER NOT NULL,
      email_skipped INTEGER NOT NULL,
      errors TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS source_cache (
      cache_key TEXT PRIMARY KEY,
      fetched_at TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_matches_created ON matches (created_at);
    CREATE INDEX IF NOT EXISTS idx_matches_status ON matches (notify_status);
  `);
}

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

function parseSources(value: string): JobSourceId[] {
  return parseStringArray(value).filter(isJobSourceId);
}

function flag(value: boolean): number {
  return value ? 1 : 0;
}

export function ensureSettings(db: AppDatabase): void {
  const existing = db.prepare("SELECT id FROM settings WHERE id = ?").get(SINGLETON_ROW_ID);
  if (existing) {
    return;
  }
  const fromEnv = process.env.SCAN_INTERVAL_MINUTES;
  const parsed = fromEnv ? Number(fromEnv) : DEFAULT_SCAN_INTERVAL_MINUTES;
  const allowed = SCAN_INTERVAL_OPTIONS.some((option) => option.minutes === parsed);
  db.prepare("INSERT INTO settings (id, notify_email, scan_interval_minutes) VALUES (?, ?, ?)").run(
    SINGLETON_ROW_ID,
    process.env.NOTIFY_EMAIL?.trim() ?? "",
    allowed ? parsed : DEFAULT_SCAN_INTERVAL_MINUTES,
  );
}

export function getSettings(db: AppDatabase): { notifyEmail: string; scanIntervalMinutes: number } {
  ensureSettings(db);
  const row = db
    .prepare("SELECT notify_email, scan_interval_minutes FROM settings WHERE id = ?")
    .get(SINGLETON_ROW_ID) as { notify_email: string; scan_interval_minutes: number };
  return {
    notifyEmail: row.notify_email,
    scanIntervalMinutes: row.scan_interval_minutes,
  };
}

export function updateSettings(
  db: AppDatabase,
  settings: { notifyEmail: string; scanIntervalMinutes: number },
): { notifyEmail: string; scanIntervalMinutes: number } {
  ensureSettings(db);
  db.prepare("UPDATE settings SET notify_email = ?, scan_interval_minutes = ? WHERE id = ?").run(
    settings.notifyEmail,
    settings.scanIntervalMinutes,
    SINGLETON_ROW_ID,
  );
  return settings;
}

function mapAlert(row: AlertRow): Alert {
  return {
    id: row.id,
    name: row.name,
    acceptedSkills: parseStringArray(row.accepted_skills),
    requiredTerms: parseStringArray(row.required_terms),
    excludedTerms: parseStringArray(row.excluded_terms),
    locations: parseStringArray(row.locations),
    sources: parseSources(row.sources),
    active: row.active === 1,
    notifyExisting: row.notify_existing === 1,
    primed: row.primed === 1,
    createdAt: row.created_at,
    matchCount: row.match_count,
  };
}

const ALERT_SELECT = `
  SELECT alerts.*, (
    SELECT COUNT(*) FROM matches WHERE matches.alert_id = alerts.id
  ) AS match_count
  FROM alerts
`;

export function listAlerts(db: AppDatabase): Alert[] {
  const rows = db.prepare(`${ALERT_SELECT} ORDER BY created_at DESC`).all() as AlertRow[];
  return rows.map(mapAlert);
}

export function getAlert(db: AppDatabase, id: string): Alert | null {
  const row = db.prepare(`${ALERT_SELECT} WHERE alerts.id = ?`).get(id) as AlertRow | undefined;
  return row ? mapAlert(row) : null;
}

export function insertAlert(db: AppDatabase, input: AlertInput): Alert {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO alerts (
      id, name, accepted_skills, required_terms, excluded_terms, locations, sources,
      active, notify_existing, primed, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.name,
    JSON.stringify(input.acceptedSkills),
    JSON.stringify(input.requiredTerms),
    JSON.stringify(input.excludedTerms),
    JSON.stringify(input.locations),
    JSON.stringify(input.sources),
    flag(input.active),
    flag(input.notifyExisting),
    0,
    createdAt,
  );
  const alert = getAlert(db, id);
  if (!alert) {
    throw new Error("Alerta não foi gravado.");
  }
  return alert;
}

export function updateAlert(db: AppDatabase, id: string, input: AlertInput): Alert | null {
  const result = db
    .prepare(
      `UPDATE alerts SET
        name = ?, accepted_skills = ?, required_terms = ?, excluded_terms = ?, locations = ?,
        sources = ?, active = ?, notify_existing = ?
      WHERE id = ?`,
    )
    .run(
      input.name,
      JSON.stringify(input.acceptedSkills),
      JSON.stringify(input.requiredTerms),
      JSON.stringify(input.excludedTerms),
      JSON.stringify(input.locations),
      JSON.stringify(input.sources),
      flag(input.active),
      flag(input.notifyExisting),
      id,
    );
  if (result.changes === 0) {
    return null;
  }
  return getAlert(db, id);
}

export function deleteAlert(db: AppDatabase, id: string): boolean {
  const result = db.prepare("DELETE FROM alerts WHERE id = ?").run(id);
  return result.changes > 0;
}

export function listJobs(db: AppDatabase): StoredJob[] {
  const rows = db.prepare("SELECT * FROM jobs").all() as Array<Record<string, unknown>>;
  return rows.flatMap((row) => {
    const source = String(row.source);
    if (!isJobSourceId(source)) {
      return [];
    }
    return [
      {
        id: String(row.id),
        source,
        externalId: String(row.external_id),
        title: String(row.title),
        company: String(row.company),
        location: String(row.location),
        workplace: String(row.workplace),
        url: String(row.url),
        description: String(row.description),
        publishedAt: row.published_at ? String(row.published_at) : null,
      },
    ];
  });
}

export function upsertJobs(db: AppDatabase, jobs: FetchedJob[]): void {
  const statement = db.prepare(
    `INSERT INTO jobs (
      id, source, external_id, title, company, location, workplace, url, description, published_at, first_seen_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (source, external_id) DO UPDATE SET
      title = excluded.title,
      company = excluded.company,
      location = excluded.location,
      workplace = excluded.workplace,
      url = excluded.url,
      description = excluded.description,
      published_at = excluded.published_at`,
  );
  const seenAt = new Date().toISOString();
  for (const job of jobs) {
    statement.run(
      `${job.source}:${job.externalId}`,
      job.source,
      job.externalId,
      job.title,
      job.company,
      job.location,
      job.workplace,
      job.url,
      job.description,
      job.publishedAt,
      seenAt,
    );
  }
}

export function syncAlertMatches(db: AppDatabase, alert: Alert, jobs: StoredJob[]): { pending: number; baseline: number } {
  const existingRows = db.prepare("SELECT job_id FROM matches WHERE alert_id = ?").all(alert.id) as Array<{
    job_id: string;
  }>;
  const existing = new Set(existingRows.map((row) => row.job_id));
  const matchedJobIds = new Set<string>();
  let pending = 0;
  let baselineCount = 0;
  const baseline = !alert.primed && !alert.notifyExisting;
  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO matches (id, alert_id, job_id, matched_terms, created_at, notify_status)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const updateTerms = db.prepare("UPDATE matches SET matched_terms = ? WHERE alert_id = ? AND job_id = ?");
  const remove = db.prepare("DELETE FROM matches WHERE alert_id = ? AND job_id = ?");

  for (const job of jobs) {
    const result = matchJob(job, alert);
    if (!result.matched) {
      continue;
    }
    matchedJobIds.add(job.id);
    const terms = JSON.stringify(result.matchedSkills);
    if (existing.has(job.id)) {
      updateTerms.run(terms, alert.id, job.id);
      continue;
    }
    insert.run(randomUUID(), alert.id, job.id, terms, now, baseline ? "baseline" : "pending");
    if (baseline) {
      baselineCount += 1;
    } else {
      pending += 1;
    }
  }

  for (const jobId of existing) {
    if (!matchedJobIds.has(jobId)) {
      remove.run(alert.id, jobId);
    }
  }

  return { pending, baseline: baselineCount };
}

export function markAlertsPrimed(db: AppDatabase, alertIds: string[]): void {
  const statement = db.prepare("UPDATE alerts SET primed = 1 WHERE id = ?");
  for (const id of alertIds) {
    statement.run(id);
  }
}

function isNotifyStatus(value: string): value is NotifyStatus {
  return NOTIFY_STATUSES.has(value as NotifyStatus);
}

function mapMatch(row: MatchRow): JobMatch | null {
  if (!isJobSourceId(row.source) || !isNotifyStatus(row.notify_status)) {
    return null;
  }
  return {
    id: row.id,
    alertId: row.alert_id,
    alertName: row.alert_name,
    title: row.title,
    company: row.company,
    location: row.location,
    workplace: row.workplace,
    url: row.url,
    source: row.source,
    sourceLabel: sourceLabel(row.source),
    excerpt: excerpt(row.description, EXCERPT_CHARS),
    publishedAt: row.published_at,
    matchedSkills: parseStringArray(row.matched_terms),
    foundAt: row.created_at,
    notifyStatus: row.notify_status,
    notifyError: row.notify_error,
  };
}

export function listMatches(db: AppDatabase, alertId: string): JobMatch[] {
  const rows = db
    .prepare(
      `SELECT matches.id, matches.alert_id, alerts.name AS alert_name, jobs.title, jobs.company,
        jobs.location, jobs.workplace, jobs.url, jobs.source, jobs.description, jobs.published_at,
        matches.matched_terms, matches.created_at, matches.notify_status, matches.notify_error
      FROM matches
      JOIN alerts ON alerts.id = matches.alert_id
      JOIN jobs ON jobs.id = matches.job_id
      WHERE (? = '' OR matches.alert_id = ?)
      ORDER BY matches.created_at DESC
      LIMIT ?`,
    )
    .all(alertId, alertId, MATCH_LIST_LIMIT) as MatchRow[];
  return rows.flatMap((row) => {
    const match = mapMatch(row);
    return match ? [match] : [];
  });
}

export type PendingDigest = {
  alertId: string;
  alertName: string;
  jobs: Array<{
    matchId: string;
    title: string;
    company: string;
    location: string;
    url: string;
    matchedSkills: string[];
  }>;
};

export function listPendingDigests(db: AppDatabase): PendingDigest[] {
  const rows = db
    .prepare(
      `SELECT matches.id, matches.alert_id, alerts.name AS alert_name, jobs.title, jobs.company,
        jobs.location, jobs.url, matches.matched_terms
      FROM matches
      JOIN alerts ON alerts.id = matches.alert_id
      JOIN jobs ON jobs.id = matches.job_id
      WHERE matches.notify_status IN ('pending', 'error') AND alerts.active = 1
      ORDER BY matches.created_at ASC`,
    )
    .all() as Array<{
    id: string;
    alert_id: string;
    alert_name: string;
    title: string;
    company: string;
    location: string;
    url: string;
    matched_terms: string;
  }>;

  const grouped = new Map<string, PendingDigest>();
  for (const row of rows) {
    const current = grouped.get(row.alert_id) ?? {
      alertId: row.alert_id,
      alertName: row.alert_name,
      jobs: [],
    };
    current.jobs.push({
      matchId: row.id,
      title: row.title,
      company: row.company,
      location: row.location,
      url: row.url,
      matchedSkills: parseStringArray(row.matched_terms),
    });
    grouped.set(row.alert_id, current);
  }
  return [...grouped.values()];
}

export function markDigestResult(db: AppDatabase, matchIds: string[], status: "sent" | "error", error: string | null): void {
  const statement = db.prepare(
    `UPDATE matches
     SET notify_status = ?, notify_error = ?, notified_at = ?
     WHERE id = ?`,
  );
  const notifiedAt = status === "sent" ? new Date().toISOString() : null;
  for (const id of matchIds) {
    statement.run(status, error, notifiedAt, id);
  }
}

export function countPendingNotifications(db: AppDatabase): number {
  const row = db
    .prepare("SELECT COUNT(*) AS total FROM matches WHERE notify_status IN ('pending', 'error')")
    .get() as { total: number };
  return row.total;
}

export function insertScan(db: AppDatabase, scan: ScanSummary): void {
  db.prepare(
    `INSERT INTO scans (
      id, reason, started_at, finished_at, fetched_count, new_match_count, baseline_count, emailed_count, email_skipped, errors
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    scan.id,
    scan.reason,
    scan.startedAt,
    scan.finishedAt,
    scan.fetchedCount,
    scan.newMatchCount,
    scan.baselineCount,
    scan.emailedCount,
    flag(scan.emailSkipped),
    JSON.stringify(scan.errors),
  );
  db.prepare(
    `DELETE FROM scans WHERE id NOT IN (
      SELECT id FROM scans ORDER BY finished_at DESC LIMIT ?
    )`,
  ).run(SCAN_HISTORY_LIMIT);
}

export function listScans(db: AppDatabase, limit: number): ScanSummary[] {
  const rows = db
    .prepare(
      `SELECT id, reason, started_at, finished_at, fetched_count, new_match_count, baseline_count, emailed_count, email_skipped, errors
       FROM scans ORDER BY finished_at DESC LIMIT ?`,
    )
    .all(limit) as ScanRow[];
  return rows.map((row) => ({
    id: row.id,
    reason: row.reason === "manual" ? "manual" : "schedule",
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    fetchedCount: row.fetched_count,
    newMatchCount: row.new_match_count,
    baselineCount: row.baseline_count,
    emailedCount: row.emailed_count,
    emailSkipped: row.email_skipped === 1,
    errors: parseStringArray(row.errors),
  }));
}

export function latestScan(db: AppDatabase): ScanSummary | null {
  return listScans(db, 1)[0] ?? null;
}

type CacheRow = { fetched_at: string; payload: string };

export function readCache(db: AppDatabase, cacheKey: string): { fetchedAt: string; jobs: FetchedJob[] } | null {
  const row = db.prepare("SELECT fetched_at, payload FROM source_cache WHERE cache_key = ?").get(cacheKey) as
    | CacheRow
    | undefined;
  if (!row) {
    return null;
  }
  try {
    const parsed = JSON.parse(row.payload) as unknown;
    if (!Array.isArray(parsed)) {
      return null;
    }
    return { fetchedAt: row.fetched_at, jobs: parsed as FetchedJob[] };
  } catch {
    return null;
  }
}

export function writeCache(db: AppDatabase, cacheKey: string, jobs: FetchedJob[]): void {
  db.prepare(
    `INSERT INTO source_cache (cache_key, fetched_at, payload) VALUES (?, ?, ?)
     ON CONFLICT (cache_key) DO UPDATE SET fetched_at = excluded.fetched_at, payload = excluded.payload`,
  ).run(cacheKey, new Date().toISOString(), JSON.stringify(jobs));
}

export function withTransaction<T>(db: AppDatabase, work: () => T): T {
  db.exec("BEGIN");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
