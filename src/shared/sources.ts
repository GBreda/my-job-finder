import { JOB_SOURCES, type JobSourceId } from "./constants";

const WORKPLACE_LABELS: Record<string, string> = {
  remote: "Remoto",
  hybrid: "Híbrido",
  "on-site": "Presencial",
  onsite: "Presencial",
};

export function sourceLabel(source: JobSourceId): string {
  return JOB_SOURCES.find((item) => item.id === source)?.label ?? source;
}

export function workplaceLabel(value: string): string {
  const key = value.trim().toLowerCase();
  if (!key) {
    return "";
  }
  return WORKPLACE_LABELS[key] ?? value.trim();
}

export function isJobSourceId(value: string): value is JobSourceId {
  return JOB_SOURCES.some((source) => source.id === value);
}
