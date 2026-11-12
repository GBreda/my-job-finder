import {
  FIRST_PAGE_OFFSET,
  GUPY_PAGE_SIZE,
  HIMALAYAS_PAGE_SIZE,
  JOBICY_PAGE_SIZE,
  MAX_DESCRIPTION_CHARS,
  MAX_LOCATION_PARTS,
  REQUEST_TIMEOUT_MS,
  USER_AGENT,
  type JobSourceId,
} from "../shared/constants";
import { workplaceLabel } from "../shared/sources";
import { clip, htmlToText, safeHttpUrl } from "../shared/text";
import type { FetchedJob } from "./db";

const GUPY_SEARCH_URL = "https://portal.gupy.io/api/job-search/jobs";
const HIMALAYAS_SEARCH_URL = "https://himalayas.app/jobs/api/search";
const JOBICY_SEARCH_URL = "https://jobicy.com/api/jobs";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

function idField(record: Record<string, unknown>): string {
  const value = record.id ?? record.guid;
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return "";
}

function joinLocation(parts: string[]): string {
  const clean = parts.map((part) => part.trim()).filter(Boolean);
  if (clean.length <= MAX_LOCATION_PARTS) {
    return clean.join(", ");
  }
  return `${clean.slice(0, MAX_LOCATION_PARTS).join(", ")} e outros`;
}

function descriptionFrom(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = textField(record, key);
    if (value) {
      return clip(htmlToText(value), MAX_DESCRIPTION_CHARS);
    }
  }
  return "";
}

async function fetchJson(url: URL): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  try {
    return await response.json();
  } catch {
    throw new Error("resposta inválida");
  }
}

function gupyJob(record: Record<string, unknown>): FetchedJob | null {
  const externalId = idField(record);
  const url = safeHttpUrl(textField(record, "jobUrl"));
  const title = textField(record, "name");
  if (!externalId || !url || !title) {
    return null;
  }
  return {
    source: "gupy",
    externalId,
    title,
    company: textField(record, "careerPageName"),
    location: joinLocation([textField(record, "city"), textField(record, "state")]),
    workplace: workplaceLabel(textField(record, "workplaceType")),
    url,
    description: descriptionFrom(record, ["description"]),
    publishedAt: textField(record, "publishedDate") || null,
  };
}

function himalayasJob(record: Record<string, unknown>): FetchedJob | null {
  const externalId = idField(record);
  const url = safeHttpUrl(textField(record, "applicationLink"));
  const title = textField(record, "title");
  if (!externalId || !url || !title) {
    return null;
  }
  const restrictions = Array.isArray(record.locationRestrictions)
    ? record.locationRestrictions.filter((item): item is string => typeof item === "string")
    : [];
  return {
    source: "himalayas",
    externalId,
    title,
    company: textField(record, "companyName"),
    location: joinLocation(restrictions),
    workplace: workplaceLabel("remote"),
    url,
    description: descriptionFrom(record, ["description", "excerpt"]),
    publishedAt: textField(record, "pubDate") || null,
  };
}

function jobicyJob(record: Record<string, unknown>): FetchedJob | null {
  const externalId = idField(record);
  const url = safeHttpUrl(textField(record, "url"));
  const title = textField(record, "jobTitle");
  if (!externalId || !url || !title) {
    return null;
  }
  return {
    source: "jobicy",
    externalId,
    title,
    company: textField(record, "companyName"),
    location: textField(record, "jobGeo"),
    workplace: workplaceLabel("remote"),
    url,
    description: descriptionFrom(record, ["jobDescription", "jobExcerpt"]),
    publishedAt: textField(record, "pubDate") || null,
  };
}

function jobsFromPayload(payload: unknown, key: string, mapJob: (record: Record<string, unknown>) => FetchedJob | null): FetchedJob[] {
  if (!isRecord(payload) || !Array.isArray(payload[key])) {
    throw new Error("resposta sem lista de vagas");
  }
  const jobs: FetchedJob[] = [];
  for (const item of payload[key]) {
    if (!isRecord(item)) {
      continue;
    }
    const job = mapJob(item);
    if (job) {
      jobs.push(job);
    }
  }
  return jobs;
}

export async function fetchSourceJobs(source: JobSourceId, query: string): Promise<FetchedJob[]> {
  if (source === "gupy") {
    const url = new URL(GUPY_SEARCH_URL);
    url.searchParams.set("jobName", query);
    url.searchParams.set("limit", String(GUPY_PAGE_SIZE));
    url.searchParams.set("offset", String(FIRST_PAGE_OFFSET));
    const payload = await fetchJson(url);
    return jobsFromPayload(payload, "data", gupyJob);
  }

  if (source === "himalayas") {
    const url = new URL(HIMALAYAS_SEARCH_URL);
    url.searchParams.set("q", query);
    url.searchParams.set("limit", String(HIMALAYAS_PAGE_SIZE));
    const payload = await fetchJson(url);
    return jobsFromPayload(payload, "jobs", himalayasJob);
  }

  const url = new URL(JOBICY_SEARCH_URL);
  url.searchParams.set("count", String(JOBICY_PAGE_SIZE));
  url.searchParams.set("tag", query);
  const payload = await fetchJson(url);
  return jobsFromPayload(payload, "jobs", jobicyJob);
}
