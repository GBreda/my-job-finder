import type { Alert, AlertInput, AppStatus, JobMatch, ScanSummary } from "../shared/types";

export class ApiError extends Error {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    throw new ApiError(body.error || "Não foi possível concluir a operação.");
  }
  return body as T;
}

export function fetchStatus(): Promise<AppStatus> {
  return request<AppStatus>("/api/status");
}

export function fetchAlerts(): Promise<Alert[]> {
  return request<{ alerts: Alert[] }>("/api/alerts").then((body) => body.alerts);
}

export function fetchMatches(alertId = ""): Promise<JobMatch[]> {
  const query = alertId ? `?alertId=${encodeURIComponent(alertId)}` : "";
  return request<{ matches: JobMatch[] }>(`/api/matches${query}`).then((body) => body.matches);
}

export function createAlert(input: AlertInput): Promise<Alert> {
  return request<Alert>("/api/alerts", { method: "POST", body: JSON.stringify(input) });
}

export function updateAlert(id: string, input: AlertInput): Promise<Alert> {
  return request<Alert>(`/api/alerts/${id}`, { method: "PUT", body: JSON.stringify(input) });
}

export function removeAlert(id: string): Promise<void> {
  return request<{ ok: boolean }>(`/api/alerts/${id}`, { method: "DELETE" }).then(() => undefined);
}

export function saveSettings(input: { notifyEmail: string; scanIntervalMinutes: number }): Promise<void> {
  return request("/api/settings", { method: "PUT", body: JSON.stringify(input) }).then(() => undefined);
}

export function runScan(): Promise<ScanSummary> {
  return request<{ scan: ScanSummary }>("/api/scan", { method: "POST" }).then((body) => body.scan);
}

export function sendTestEmail(): Promise<void> {
  return request<{ ok: boolean }>("/api/email/test", { method: "POST" }).then(() => undefined);
}

export function fetchScans(): Promise<ScanSummary[]> {
  return request<{ scans: ScanSummary[] }>("/api/scans").then((body) => body.scans);
}
