import {
  ALERT_NAME_MAX_LENGTH,
  JOB_SOURCES,
  MAX_TERMS_PER_FIELD,
  MIN_QUERY_LENGTH,
  TERM_MAX_LENGTH,
  type JobSourceId,
} from "./constants";
import type { AlertInput } from "./types";
import { termKey } from "./match";

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const SOURCE_IDS = new Set<string>(JOB_SOURCES.map((source) => source.id));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeTerms(value: unknown, label: string): ValidationResult<string[]> {
  if (!Array.isArray(value)) {
    return { ok: false, error: `${label} precisa ser uma lista.` };
  }
  if (value.length > MAX_TERMS_PER_FIELD) {
    return { ok: false, error: `${label} aceita no máximo ${MAX_TERMS_PER_FIELD} termos.` };
  }

  const terms: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") {
      return { ok: false, error: `${label} só pode ter texto.` };
    }
    const trimmed = item.trim();
    if (!trimmed) {
      continue;
    }
    if (trimmed.length > TERM_MAX_LENGTH) {
      return { ok: false, error: `"${trimmed.slice(0, TERM_MAX_LENGTH)}" passa de ${TERM_MAX_LENGTH} caracteres.` };
    }
    const key = termKey(trimmed);
    if (key.length < MIN_QUERY_LENGTH) {
      return { ok: false, error: `"${trimmed}" é curto demais para buscar com segurança.` };
    }
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    terms.push(trimmed);
  }

  return { ok: true, value: terms };
}

export function validateAlertInput(input: unknown): ValidationResult<AlertInput> {
  if (!isRecord(input)) {
    return { ok: false, error: "Dados do alerta inválidos." };
  }

  if (typeof input.name !== "string") {
    return { ok: false, error: "Dê um nome ao alerta." };
  }
  const name = input.name.trim();
  if (!name) {
    return { ok: false, error: "Dê um nome ao alerta." };
  }
  if (name.length > ALERT_NAME_MAX_LENGTH) {
    return { ok: false, error: `O nome pode ter até ${ALERT_NAME_MAX_LENGTH} caracteres.` };
  }

  const acceptedSkills = sanitizeTerms(input.acceptedSkills, "Habilidades aceitas");
  if (!acceptedSkills.ok) {
    return acceptedSkills;
  }
  if (acceptedSkills.value.length === 0) {
    return { ok: false, error: "Informe pelo menos uma habilidade aceita." };
  }

  const requiredTerms = sanitizeTerms(input.requiredTerms, "Termos obrigatórios");
  if (!requiredTerms.ok) {
    return requiredTerms;
  }
  const excludedTerms = sanitizeTerms(input.excludedTerms, "Termos ignorados");
  if (!excludedTerms.ok) {
    return excludedTerms;
  }
  const locations = sanitizeTerms(input.locations, "Lugares");
  if (!locations.ok) {
    return locations;
  }

  const acceptedKeys = new Set(acceptedSkills.value.map((term) => termKey(term)));
  const clash = excludedTerms.value.find((term) => acceptedKeys.has(termKey(term)));
  if (clash) {
    return { ok: false, error: `"${clash}" não pode ser aceito e ignorado ao mesmo tempo.` };
  }

  if (!Array.isArray(input.sources) || input.sources.length === 0) {
    return { ok: false, error: "Escolha pelo menos uma fonte." };
  }
  const sources: JobSourceId[] = [];
  for (const source of input.sources) {
    if (typeof source !== "string" || !SOURCE_IDS.has(source)) {
      return { ok: false, error: "Fonte de vagas desconhecida." };
    }
    const typed = source as JobSourceId;
    if (!sources.includes(typed)) {
      sources.push(typed);
    }
  }

  if (typeof input.active !== "boolean" || typeof input.notifyExisting !== "boolean") {
    return { ok: false, error: "Dados do alerta inválidos." };
  }

  return {
    ok: true,
    value: {
      name,
      acceptedSkills: acceptedSkills.value,
      requiredTerms: requiredTerms.value,
      excludedTerms: excludedTerms.value,
      locations: locations.value,
      sources,
      active: input.active,
      notifyExisting: input.notifyExisting,
    },
  };
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateNotifyEmail(value: unknown): ValidationResult<string> {
  if (typeof value !== "string") {
    return { ok: false, error: "Informe um e-mail." };
  }
  const email = value.trim();
  if (!email) {
    return { ok: true, value: "" };
  }
  if (!EMAIL_PATTERN.test(email)) {
    return { ok: false, error: "Esse e-mail não parece válido." };
  }
  return { ok: true, value: email };
}
