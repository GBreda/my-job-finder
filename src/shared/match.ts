import {
  JAVASCRIPT_SUFFIX,
  LOCATION_SYNONYMS,
  MAX_REMOTE_QUERIES,
  MIN_QUERY_LENGTH,
  SCRIPT_SUFFIX,
} from "./constants";
import type { JobContent } from "./types";
import { normalizeForMatch } from "./text";

export type MatchCriteria = {
  acceptedSkills: string[];
  requiredTerms: string[];
  excludedTerms: string[];
  locations: string[];
};

export type MatchResult = {
  matched: boolean;
  matchedSkills: string[];
};

const OPTIONAL_JS_SUFFIX = "(?:js)?";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function termKey(term: string): string {
  const normalized = normalizeForMatch(term);
  return javascriptStem(normalized) ?? normalized;
}

function javascriptStem(normalized: string): string | null {
  if (normalized.includes(" ")) {
    return null;
  }
  if (!normalized.endsWith(JAVASCRIPT_SUFFIX) || normalized.endsWith(SCRIPT_SUFFIX)) {
    return null;
  }
  const stem = normalized.slice(0, -JAVASCRIPT_SUFFIX.length);
  if (stem.length < MIN_QUERY_LENGTH) {
    return null;
  }
  return stem;
}

function patternForNormalizedTerm(normalized: string): RegExp {
  const tokens = normalized.split(" ").map(escapeRegExp);
  const suffix =
    tokens.length === 1 && !normalized.endsWith(JAVASCRIPT_SUFFIX) ? OPTIONAL_JS_SUFFIX : "";
  return new RegExp(`(^|[^a-z0-9#+])${tokens.join("\\s+")}${suffix}(?=$|[^a-z0-9#+])`, "i");
}

function patternsForTerm(term: string): RegExp[] {
  const normalized = normalizeForMatch(term);
  if (!normalized) {
    return [];
  }
  const forms = [normalized];
  const stem = javascriptStem(normalized);
  if (stem) {
    forms.push(stem);
  }
  return forms.map(patternForNormalizedTerm);
}

export function termMatches(text: string, term: string): boolean {
  const haystack = normalizeForMatch(text);
  return patternsForTerm(term).some((pattern) => pattern.test(haystack));
}

function haystackFor(job: JobContent): string {
  return normalizeForMatch(
    [job.title, job.company, job.location, job.workplace, job.description].join("\n"),
  );
}

function locationTermMatches(haystack: string, term: string): boolean {
  const normalized = normalizeForMatch(term);
  const synonyms = LOCATION_SYNONYMS[normalized] ?? [term];
  return synonyms.some((synonym) => termMatches(haystack, synonym));
}

export function matchJob(job: JobContent, criteria: MatchCriteria): MatchResult {
  const skills = criteria.acceptedSkills.map((skill) => skill.trim()).filter(Boolean);
  if (skills.length === 0) {
    return { matched: false, matchedSkills: [] };
  }

  const haystack = haystackFor(job);
  const excluded = criteria.excludedTerms.some((term) => term.trim() && termMatches(haystack, term));
  if (excluded) {
    return { matched: false, matchedSkills: [] };
  }

  const requiredOk = criteria.requiredTerms
    .filter((term) => term.trim())
    .every((term) => termMatches(haystack, term));
  if (!requiredOk) {
    return { matched: false, matchedSkills: [] };
  }

  const locations = criteria.locations.filter((term) => term.trim());
  if (locations.length > 0 && !locations.some((term) => locationTermMatches(haystack, term))) {
    return { matched: false, matchedSkills: [] };
  }

  const matchedSkills = skills.filter((skill) => termMatches(haystack, skill));
  if (matchedSkills.length === 0) {
    return { matched: false, matchedSkills: [] };
  }

  return { matched: true, matchedSkills };
}

export function buildSearchQueries(criteria: Pick<MatchCriteria, "acceptedSkills" | "requiredTerms">): string[] {
  const seen = new Set<string>();
  const queries: string[] = [];

  for (const term of [...criteria.acceptedSkills, ...criteria.requiredTerms]) {
    const trimmed = term.trim();
    const key = termKey(trimmed);
    if (key.length < MIN_QUERY_LENGTH || seen.has(key)) {
      continue;
    }
    seen.add(key);
    queries.push(trimmed);
    if (queries.length >= MAX_REMOTE_QUERIES) {
      break;
    }
  }

  return queries;
}
