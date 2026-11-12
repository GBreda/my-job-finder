export const SECOND_MS = 1000;
export const MINUTE_MS = 60 * SECOND_MS;
export const HOUR_MS = 60 * MINUTE_MS;

export const DEFAULT_PORT = 3333;
export const DEFAULT_HOST = "127.0.0.1";

export const SINGLETON_ROW_ID = 1;

export const DEFAULT_SCAN_INTERVAL_MINUTES = 60;

export const SCAN_INTERVAL_OPTIONS = [
  { minutes: 60, label: "A cada 1 hora" },
  { minutes: 120, label: "A cada 2 horas" },
  { minutes: 360, label: "A cada 6 horas" },
  { minutes: 720, label: "A cada 12 horas" },
  { minutes: 1440, label: "Uma vez por dia" },
] as const;

export const INITIAL_SCAN_DELAY_MS = 8 * SECOND_MS;
export const REQUEST_TIMEOUT_MS = 20 * SECOND_MS;
export const REQUEST_GAP_MS = 300;

export const FIRST_PAGE_OFFSET = 0;
export const GUPY_PAGE_SIZE = 30;
export const HIMALAYAS_PAGE_SIZE = 20;
export const JOBICY_PAGE_SIZE = 50;

export const SOURCE_CACHE_TTL_MS = {
  gupy: 15 * MINUTE_MS,
  himalayas: 30 * MINUTE_MS,
  jobicy: HOUR_MS,
} as const;

export const MAX_REMOTE_QUERIES = 8;
export const MIN_QUERY_LENGTH = 2;
export const JOBICY_MIN_TAG_LENGTH = 3;

export const ALERT_NAME_MAX_LENGTH = 80;
export const TERM_MAX_LENGTH = 80;
export const MAX_TERMS_PER_FIELD = 15;

export const MAX_DESCRIPTION_CHARS = 12_000;
export const EXCERPT_CHARS = 420;
export const MAX_LOCATION_PARTS = 4;
export const EMAIL_MAX_JOBS = 15;
export const MATCH_LIST_LIMIT = 200;
export const SCAN_HISTORY_LIMIT = 20;

export const JSON_BODY_LIMIT = "512kb";

export const SMTP_DEFAULT_PORT = 587;
export const SMTP_IMPLICIT_TLS_PORT = 465;

export const USER_AGENT = "RadarVagas/1.0";
export const APP_TIME_ZONE = "America/Sao_Paulo";

export const JOB_SOURCES = [
  {
    id: "gupy",
    label: "Gupy",
    description: "Vagas publicadas no portal brasileiro",
  },
  {
    id: "himalayas",
    label: "Himalayas",
    description: "Vagas remotas internacionais",
  },
  {
    id: "jobicy",
    label: "Jobicy",
    description: "Vagas remotas dos últimos dias",
  },
] as const;

export type JobSourceId = (typeof JOB_SOURCES)[number]["id"];

export const JAVASCRIPT_SUFFIX = "js";
export const SCRIPT_SUFFIX = "script";

export const LOCATION_SYNONYMS: Record<string, readonly string[]> = {
  remoto: ["remoto", "remote", "home office", "trabalho remoto"],
  remote: ["remoto", "remote", "home office", "trabalho remoto"],
  hibrido: ["hibrido", "hybrid"],
  hybrid: ["hibrido", "hybrid"],
  presencial: ["presencial", "on-site", "onsite"],
  brasil: ["brasil", "brazil"],
  brazil: ["brasil", "brazil"],
};
