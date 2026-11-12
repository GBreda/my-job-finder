const MARK_PATTERN = /\p{M}/gu;
const TAG_PATTERN = /<[^>]+>/g;
const SCRIPT_BLOCK_PATTERN = /<script[\s\S]*?<\/script>/gi;
const STYLE_BLOCK_PATTERN = /<style[\s\S]*?<\/style>/gi;
const NUMERIC_ENTITY_PATTERN = /&#(\d+);/g;
const MAX_UNICODE_CODE_POINT = 0x10ffff;

export function normalizeForMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(MARK_PATTERN, "")
    .toLowerCase()
    .replace(/[._]/g, "")
    .replace(/[^a-z0-9#+]+/g, " ")
    .replace(/ js\b/g, "js")
    .replace(/\s+/g, " ")
    .trim();
}

export function htmlToText(value: string): string {
  return value
    .replace(SCRIPT_BLOCK_PATTERN, " ")
    .replace(STYLE_BLOCK_PATTERN, " ")
    .replace(TAG_PATTERN, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(NUMERIC_ENTITY_PATTERN, (_match, digits: string) => {
      const codePoint = Number(digits);
      if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > MAX_UNICODE_CODE_POINT) {
        return " ";
      }
      return String.fromCodePoint(codePoint);
    })
    .replace(/\s+/g, " ")
    .trim();
}

export function excerpt(value: string, maxChars: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= maxChars) {
    return clean;
  }
  return `${clean.slice(0, maxChars).trimEnd()}…`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function safeHttpUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return parsed.toString();
    }
  } catch {
    return null;
  }
  return null;
}

export function clip(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  return value.slice(0, maxChars);
}
