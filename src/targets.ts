import { TARGET_PREFIXES } from "./constants.js";

export function normalizeWhatsAppTarget(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;

  let value = raw.trim();
  for (const prefix of TARGET_PREFIXES) {
    if (value.toLowerCase().startsWith(prefix)) {
      value = value.slice(prefix.length).trim();
      break;
    }
  }

  if (!value) return undefined;

  const hasLeadingPlus = value.startsWith("+");
  const digits = value.replace(/[^\d]/g, "");
  if (!digits) return undefined;

  return hasLeadingPlus ? `+${digits}` : digits;
}

export function looksLikeWhatsAppTarget(raw: string | null | undefined): boolean {
  return Boolean(normalizeWhatsAppTarget(raw));
}
