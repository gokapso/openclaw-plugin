import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import { buildJsonChannelConfigSchema } from "openclaw/plugin-sdk/core";
import {
  CHANNEL_ID,
  DEFAULT_ACCOUNT_ID,
  DEFAULT_KAPSO_BASE_URL,
  DEFAULT_WEBHOOK_PATH
} from "./constants.js";
import { normalizeWhatsAppTarget } from "./targets.js";

export type KapsoDmPolicy = "open" | "allowlist" | "disabled";

export type KapsoWhatsappAccountConfig = {
  enabled?: boolean;
  name?: string;
  apiKey?: string;
  phoneNumberId?: string;
  webhookSecret?: string;
  baseUrl?: string;
  webhookPath?: string;
  defaultTo?: string;
  dmSecurity?: KapsoDmPolicy;
  allowFrom?: string[];
};

export type KapsoWhatsappChannelConfig = KapsoWhatsappAccountConfig & {
  defaultAccountId?: string;
  accounts?: Record<string, KapsoWhatsappAccountConfig | undefined>;
};

export type ResolvedKapsoAccount = {
  accountId: string;
  enabled: boolean;
  name?: string;
  apiKey?: string;
  phoneNumberId?: string;
  webhookSecret?: string;
  baseUrl: string;
  webhookPath: string;
  defaultTo?: string;
  dmSecurity: KapsoDmPolicy;
  allowFrom: string[];
  configured: boolean;
  envBacked: {
    apiKey: boolean;
    phoneNumberId: boolean;
    webhookSecret: boolean;
    baseUrl: boolean;
  };
};

export const kapsoChannelConfigSchema: ReturnType<typeof buildJsonChannelConfigSchema> = buildJsonChannelConfigSchema({
  type: "object",
  additionalProperties: true,
  properties: {
    enabled: { type: "boolean" },
    name: { type: "string" },
    apiKey: { type: "string" },
    phoneNumberId: stringOrNumberSchema(),
    webhookSecret: { type: "string" },
    baseUrl: { type: "string" },
    webhookPath: { type: "string" },
    defaultTo: stringOrNumberSchema(),
    defaultAccountId: { type: "string" },
    dmSecurity: { enum: ["open", "allowlist", "disabled"] },
    allowFrom: {
      type: "array",
      items: { type: "string" }
    },
    accounts: {
      type: "object",
      additionalProperties: true
    }
  }
}, {
  uiHints: {
    apiKey: { label: "Kapso API key", sensitive: true },
    phoneNumberId: { label: "WhatsApp phone number ID" },
    webhookSecret: { label: "Webhook secret", sensitive: true },
    baseUrl: { label: "Kapso proxy URL", advanced: true },
    webhookPath: { label: "Webhook path", advanced: true },
    defaultTo: { label: "Default WhatsApp recipient" },
    allowFrom: { label: "Allowed WhatsApp senders" }
  }
});

export function getKapsoChannelSection(cfg: OpenClawConfig): KapsoWhatsappChannelConfig {
  const channels = readObject((cfg as { channels?: unknown }).channels);
  const section = readObject(channels?.[CHANNEL_ID]);
  return section ? normalizeChannelConfig(section) : {};
}

export function listKapsoAccountIds(cfg: OpenClawConfig): string[] {
  const section = getKapsoChannelSection(cfg);
  const ids = new Set<string>();
  const defaultId = normalizeAccountId(section.defaultAccountId) ?? DEFAULT_ACCOUNT_ID;
  ids.add(defaultId);

  const accounts = readObject(section.accounts);
  if (accounts) {
    for (const key of Object.keys(accounts)) {
      const normalized = normalizeAccountId(key);
      if (normalized) ids.add(normalized);
    }
  }

  return [...ids];
}

export function resolveDefaultKapsoAccountId(cfg: OpenClawConfig): string {
  return normalizeAccountId(getKapsoChannelSection(cfg).defaultAccountId) ?? DEFAULT_ACCOUNT_ID;
}

export function resolveKapsoAccount(
  cfg: OpenClawConfig,
  accountId?: string | null,
  env: NodeJS.ProcessEnv = process.env
): ResolvedKapsoAccount {
  const section = getKapsoChannelSection(cfg);
  const resolvedAccountId = normalizeAccountId(accountId) ?? resolveDefaultKapsoAccountId(cfg);
  const account = readObject(section.accounts)?.[resolvedAccountId];
  const accountConfig = readObject(account);
  const merged = {
    ...section,
    accounts: undefined,
    ...(accountConfig ? normalizeAccountConfig(accountConfig) : {})
  };

  const apiKey = firstNonEmpty(merged.apiKey, env.KAPSO_API_KEY);
  const phoneNumberId = firstNonEmpty(merged.phoneNumberId, env.KAPSO_PHONE_NUMBER_ID);
  const webhookSecret = firstNonEmpty(merged.webhookSecret, env.KAPSO_WEBHOOK_SECRET);
  const baseUrl = firstNonEmpty(merged.baseUrl, env.KAPSO_BASE_URL) ?? DEFAULT_KAPSO_BASE_URL;
  const webhookPath = normalizeWebhookPath(firstNonEmpty(merged.webhookPath, env.KAPSO_WEBHOOK_PATH));
  const defaultTo = normalizeWhatsAppTarget(firstNonEmpty(merged.defaultTo, env.KAPSO_DEFAULT_TO));

  return {
    accountId: resolvedAccountId,
    enabled: merged.enabled !== false,
    name: firstNonEmpty(merged.name, env.KAPSO_BOT_USERNAME),
    apiKey,
    phoneNumberId,
    webhookSecret,
    baseUrl,
    webhookPath,
    defaultTo,
    dmSecurity: normalizeDmPolicy(merged.dmSecurity),
    allowFrom: normalizeAllowFrom(merged.allowFrom),
    configured: Boolean(apiKey && phoneNumberId),
    envBacked: {
      apiKey: !merged.apiKey && Boolean(env.KAPSO_API_KEY),
      phoneNumberId: !merged.phoneNumberId && Boolean(env.KAPSO_PHONE_NUMBER_ID),
      webhookSecret: !merged.webhookSecret && Boolean(env.KAPSO_WEBHOOK_SECRET),
      baseUrl: !merged.baseUrl && Boolean(env.KAPSO_BASE_URL)
    }
  };
}

export function inspectKapsoAccount(cfg: OpenClawConfig, accountId?: string | null): Record<string, unknown> {
  const account = resolveKapsoAccount(cfg, accountId);
  return {
    accountId: account.accountId,
    enabled: account.enabled,
    configured: account.configured,
    name: account.name,
    phoneNumberId: account.phoneNumberId,
    baseUrl: account.baseUrl,
    webhookPath: account.webhookPath,
    apiKeyStatus: account.apiKey ? "available" : "missing",
    webhookSecretStatus: account.webhookSecret ? "available" : "missing",
    dmSecurity: account.dmSecurity,
    allowFromCount: account.allowFrom.length,
    envBacked: account.envBacked
  };
}

export function setKapsoAccountEnabled(params: {
  cfg: OpenClawConfig;
  accountId: string;
  enabled: boolean;
}): OpenClawConfig {
  const cfg = cloneConfig(params.cfg);
  const section = ensureKapsoSection(cfg);
  const accountId = normalizeAccountId(params.accountId) ?? DEFAULT_ACCOUNT_ID;

  if (accountId === DEFAULT_ACCOUNT_ID && !section.accounts?.[accountId]) {
    section.enabled = params.enabled;
    return cfg;
  }

  section.accounts = {
    ...section.accounts,
    [accountId]: {
      ...(section.accounts?.[accountId] ?? {}),
      enabled: params.enabled
    }
  };
  return cfg;
}

export function applyKapsoAccountName(params: {
  cfg: OpenClawConfig;
  accountId: string;
  name?: string;
}): OpenClawConfig {
  const cfg = cloneConfig(params.cfg);
  const section = ensureKapsoSection(cfg);
  const accountId = normalizeAccountId(params.accountId) ?? DEFAULT_ACCOUNT_ID;

  section.accounts = {
    ...section.accounts,
    [accountId]: {
      ...(section.accounts?.[accountId] ?? {}),
      name: params.name
    }
  };
  return cfg;
}

export function applyKapsoAccountConfig(params: {
  cfg: OpenClawConfig;
  accountId: string;
  input: Record<string, unknown>;
}): OpenClawConfig {
  const cfg = cloneConfig(params.cfg);
  const section = ensureKapsoSection(cfg);
  const accountId = normalizeAccountId(params.accountId) ?? DEFAULT_ACCOUNT_ID;
  const input = params.input;

  const next: KapsoWhatsappAccountConfig = {
    ...(section.accounts?.[accountId] ?? {})
  };

  assignString(next, "apiKey", input.token ?? input.apiKey ?? input.kapsoApiKey);
  assignString(next, "phoneNumberId", input.phoneNumberId, { coerceNumber: true });
  assignString(next, "webhookSecret", input.secret ?? input.webhookSecret);
  assignString(next, "baseUrl", input.baseUrl);
  assignString(next, "webhookPath", input.webhookPath);
  assignString(next, "defaultTo", input.defaultTo ?? input.to, { coerceNumber: true });

  if (Array.isArray(input.dmAllowlist)) {
    next.allowFrom = input.dmAllowlist.map(String).map((entry) => entry.trim()).filter(Boolean);
  } else if (Array.isArray(input.allowFrom)) {
    next.allowFrom = input.allowFrom.map(String).map((entry) => entry.trim()).filter(Boolean);
  }

  const dmSecurity = normalizeDmPolicy(String(input.dmSecurity ?? input.dmPolicy ?? ""));
  if (dmSecurity) next.dmSecurity = dmSecurity;

  if (typeof input.enabled === "boolean") {
    next.enabled = input.enabled;
  }

  section.accounts = {
    ...section.accounts,
    [accountId]: next
  };

  return cfg;
}

export function validateKapsoSetupInput(input: Record<string, unknown>): string | null {
  const apiKey = firstNonEmpty(input.token, input.apiKey, input.kapsoApiKey, process.env.KAPSO_API_KEY);
  const phoneNumberId = firstNonEmpty(readStringOrNumber(input.phoneNumberId), process.env.KAPSO_PHONE_NUMBER_ID);

  if (!apiKey) return "Kapso API key is required. Provide token/apiKey or set KAPSO_API_KEY.";
  if (!phoneNumberId) {
    return "Kapso WhatsApp phone number ID is required. Provide phoneNumberId or set KAPSO_PHONE_NUMBER_ID.";
  }
  return null;
}

export function normalizeWebhookPath(path: string | undefined): string {
  if (!path) return DEFAULT_WEBHOOK_PATH;
  const trimmed = path.trim();
  if (!trimmed) return DEFAULT_WEBHOOK_PATH;
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function ensureKapsoSection(cfg: OpenClawConfig): KapsoWhatsappChannelConfig {
  const mutable = cfg as { channels?: Record<string, unknown> };
  mutable.channels = readObject(mutable.channels) ?? {};
  const current = normalizeChannelConfig(readObject(mutable.channels[CHANNEL_ID]) ?? {});
  mutable.channels[CHANNEL_ID] = current;
  return current;
}

function cloneConfig(cfg: OpenClawConfig): OpenClawConfig {
  if (typeof structuredClone === "function") {
    return structuredClone(cfg);
  }
  return JSON.parse(JSON.stringify(cfg)) as OpenClawConfig;
}

function normalizeChannelConfig(raw: Record<string, unknown>): KapsoWhatsappChannelConfig {
  return {
    ...normalizeAccountConfig(raw),
    defaultAccountId: readString(raw.defaultAccountId),
    accounts: normalizeAccounts(raw.accounts)
  };
}

function normalizeAccountConfig(raw: Record<string, unknown>): KapsoWhatsappAccountConfig {
  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : undefined,
    name: readString(raw.name),
    apiKey: readString(raw.apiKey ?? raw.kapsoApiKey ?? raw.token),
    phoneNumberId: readStringOrNumber(raw.phoneNumberId),
    webhookSecret: readString(raw.webhookSecret ?? raw.secret),
    baseUrl: readString(raw.baseUrl),
    webhookPath: readString(raw.webhookPath),
    defaultTo: readStringOrNumber(raw.defaultTo),
    dmSecurity: normalizeDmPolicy(raw.dmSecurity ?? raw.dmPolicy),
    allowFrom: Array.isArray(raw.allowFrom) ? raw.allowFrom.map(String) : undefined
  };
}

function normalizeAccounts(raw: unknown): Record<string, KapsoWhatsappAccountConfig> | undefined {
  const source = readObject(raw);
  if (!source) return undefined;

  const accounts: Record<string, KapsoWhatsappAccountConfig> = {};
  for (const [key, value] of Object.entries(source)) {
    const accountId = normalizeAccountId(key);
    const config = readObject(value);
    if (accountId && config) {
      accounts[accountId] = normalizeAccountConfig(config);
    }
  }
  return accounts;
}

function normalizeAccountId(value: unknown): string | undefined {
  const text = readString(value);
  return text || undefined;
}

function normalizeDmPolicy(value: unknown): KapsoDmPolicy {
  if (value === "open" || value === "allowlist" || value === "disabled") return value;
  return "allowlist";
}

function normalizeAllowFrom(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => normalizeWhatsAppTarget(String(entry)) ?? String(entry).trim()).filter(Boolean);
}

function readObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readStringOrNumber(value: unknown): string | undefined {
  const text = readString(value);
  if (text) return text;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function firstNonEmpty(...values: unknown[]): string | undefined {
  for (const value of values) {
    const text = readString(value);
    if (text) return text;
  }
  return undefined;
}

function assignString(
  target: KapsoWhatsappAccountConfig,
  key: keyof KapsoWhatsappAccountConfig,
  value: unknown,
  options: { coerceNumber?: boolean } = {}
): void {
  const text = options.coerceNumber ? readStringOrNumber(value) : readString(value);
  if (text) {
    (target as Record<string, unknown>)[key] = text;
  }
}

function stringOrNumberSchema(): Record<string, unknown> {
  return {
    anyOf: [
      { type: "string" },
      { type: "number" }
    ]
  };
}
