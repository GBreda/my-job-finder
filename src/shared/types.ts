import type { JobSourceId } from "./constants";

export type AlertInput = {
  name: string;
  acceptedSkills: string[];
  requiredTerms: string[];
  excludedTerms: string[];
  locations: string[];
  sources: JobSourceId[];
  active: boolean;
  notifyExisting: boolean;
};

export type Alert = AlertInput & {
  id: string;
  primed: boolean;
  createdAt: string;
  matchCount: number;
};

export type NotifyStatus = "pending" | "sent" | "baseline" | "error";

export type JobMatch = {
  id: string;
  alertId: string;
  alertName: string;
  title: string;
  company: string;
  location: string;
  workplace: string;
  url: string;
  source: JobSourceId;
  sourceLabel: string;
  excerpt: string;
  publishedAt: string | null;
  matchedSkills: string[];
  foundAt: string;
  notifyStatus: NotifyStatus;
  notifyError: string | null;
};

export type ScanReason = "manual" | "schedule";

export type ScanSummary = {
  id: string;
  reason: ScanReason;
  startedAt: string;
  finishedAt: string;
  fetchedCount: number;
  newMatchCount: number;
  baselineCount: number;
  emailedCount: number;
  emailSkipped: boolean;
  errors: string[];
};

export type AppStatus = {
  notifyEmail: string;
  scanIntervalMinutes: number;
  smtpConfigured: boolean;
  smtpFrom: string | null;
  pendingNotificationCount: number;
  scanning: boolean;
  lastScan: ScanSummary | null;
};

export type JobContent = {
  title: string;
  company: string;
  location: string;
  workplace: string;
  description: string;
};
