import { buildJsonChannelConfigSchema } from "openclaw/plugin-sdk/core";
import { CHANNEL_ID, DEFAULT_ACCOUNT_ID, DEFAULT_KAPSO_BASE_URL, DEFAULT_WEBHOOK_PATH } from "./constants.js";
import { normalizeWhatsAppTarget } from "./targets.js";
export const kapsoChannelConfigSchema = buildJsonChannelConfigSchema({
    type: "object",
    additionalProperties: true,
    properties: {
        enabled: { type: "boolean" },
        name: { type: "string" },
        apiKey: { type: "string" },
        phoneNumberId: { type: "string" },
        webhookSecret: { type: "string" },
        baseUrl: { type: "string" },
        webhookPath: { type: "string" },
        defaultTo: { type: "string" },
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
export function getKapsoChannelSection(cfg) {
    const channels = readObject(cfg.channels);
    const section = readObject(channels?.[CHANNEL_ID]);
    return section ? normalizeChannelConfig(section) : {};
}
export function listKapsoAccountIds(cfg) {
    const section = getKapsoChannelSection(cfg);
    const ids = new Set();
    const defaultId = normalizeAccountId(section.defaultAccountId) ?? DEFAULT_ACCOUNT_ID;
    ids.add(defaultId);
    const accounts = readObject(section.accounts);
    if (accounts) {
        for (const key of Object.keys(accounts)) {
            const normalized = normalizeAccountId(key);
            if (normalized)
                ids.add(normalized);
        }
    }
    return [...ids];
}
export function resolveDefaultKapsoAccountId(cfg) {
    return normalizeAccountId(getKapsoChannelSection(cfg).defaultAccountId) ?? DEFAULT_ACCOUNT_ID;
}
export function resolveKapsoAccount(cfg, accountId, env = process.env) {
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
export function inspectKapsoAccount(cfg, accountId) {
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
export function setKapsoAccountEnabled(params) {
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
export function applyKapsoAccountName(params) {
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
export function applyKapsoAccountConfig(params) {
    const cfg = cloneConfig(params.cfg);
    const section = ensureKapsoSection(cfg);
    const accountId = normalizeAccountId(params.accountId) ?? DEFAULT_ACCOUNT_ID;
    const input = params.input;
    const next = {
        ...(section.accounts?.[accountId] ?? {})
    };
    assignString(next, "apiKey", input.token ?? input.apiKey ?? input.kapsoApiKey);
    assignString(next, "phoneNumberId", input.phoneNumberId);
    assignString(next, "webhookSecret", input.secret ?? input.webhookSecret);
    assignString(next, "baseUrl", input.baseUrl);
    assignString(next, "webhookPath", input.webhookPath);
    assignString(next, "defaultTo", input.defaultTo ?? input.to);
    if (Array.isArray(input.dmAllowlist)) {
        next.allowFrom = input.dmAllowlist.map(String).map((entry) => entry.trim()).filter(Boolean);
    }
    else if (Array.isArray(input.allowFrom)) {
        next.allowFrom = input.allowFrom.map(String).map((entry) => entry.trim()).filter(Boolean);
    }
    const dmSecurity = normalizeDmPolicy(String(input.dmSecurity ?? input.dmPolicy ?? ""));
    if (dmSecurity)
        next.dmSecurity = dmSecurity;
    if (typeof input.enabled === "boolean") {
        next.enabled = input.enabled;
    }
    section.accounts = {
        ...section.accounts,
        [accountId]: next
    };
    return cfg;
}
export function validateKapsoSetupInput(input) {
    const apiKey = firstNonEmpty(input.token, input.apiKey, input.kapsoApiKey, process.env.KAPSO_API_KEY);
    const phoneNumberId = firstNonEmpty(input.phoneNumberId, process.env.KAPSO_PHONE_NUMBER_ID);
    if (!apiKey)
        return "Kapso API key is required. Provide token/apiKey or set KAPSO_API_KEY.";
    if (!phoneNumberId) {
        return "Kapso WhatsApp phone number ID is required. Provide phoneNumberId or set KAPSO_PHONE_NUMBER_ID.";
    }
    return null;
}
export function normalizeWebhookPath(path) {
    if (!path)
        return DEFAULT_WEBHOOK_PATH;
    const trimmed = path.trim();
    if (!trimmed)
        return DEFAULT_WEBHOOK_PATH;
    return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}
function ensureKapsoSection(cfg) {
    const mutable = cfg;
    mutable.channels = readObject(mutable.channels) ?? {};
    const current = normalizeChannelConfig(readObject(mutable.channels[CHANNEL_ID]) ?? {});
    mutable.channels[CHANNEL_ID] = current;
    return current;
}
function cloneConfig(cfg) {
    if (typeof structuredClone === "function") {
        return structuredClone(cfg);
    }
    return JSON.parse(JSON.stringify(cfg));
}
function normalizeChannelConfig(raw) {
    return {
        ...normalizeAccountConfig(raw),
        defaultAccountId: readString(raw.defaultAccountId),
        accounts: normalizeAccounts(raw.accounts)
    };
}
function normalizeAccountConfig(raw) {
    return {
        enabled: typeof raw.enabled === "boolean" ? raw.enabled : undefined,
        name: readString(raw.name),
        apiKey: readString(raw.apiKey ?? raw.kapsoApiKey ?? raw.token),
        phoneNumberId: readString(raw.phoneNumberId),
        webhookSecret: readString(raw.webhookSecret ?? raw.secret),
        baseUrl: readString(raw.baseUrl),
        webhookPath: readString(raw.webhookPath),
        defaultTo: readString(raw.defaultTo),
        dmSecurity: normalizeDmPolicy(raw.dmSecurity ?? raw.dmPolicy),
        allowFrom: Array.isArray(raw.allowFrom) ? raw.allowFrom.map(String) : undefined
    };
}
function normalizeAccounts(raw) {
    const source = readObject(raw);
    if (!source)
        return undefined;
    const accounts = {};
    for (const [key, value] of Object.entries(source)) {
        const accountId = normalizeAccountId(key);
        const config = readObject(value);
        if (accountId && config) {
            accounts[accountId] = normalizeAccountConfig(config);
        }
    }
    return accounts;
}
function normalizeAccountId(value) {
    const text = readString(value);
    return text || undefined;
}
function normalizeDmPolicy(value) {
    if (value === "open" || value === "allowlist" || value === "disabled")
        return value;
    return "allowlist";
}
function normalizeAllowFrom(value) {
    if (!Array.isArray(value))
        return [];
    return value.map((entry) => normalizeWhatsAppTarget(String(entry)) ?? String(entry).trim()).filter(Boolean);
}
function readObject(value) {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : undefined;
}
function readString(value) {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function firstNonEmpty(...values) {
    for (const value of values) {
        const text = readString(value);
        if (text)
            return text;
    }
    return undefined;
}
function assignString(target, key, value) {
    const text = readString(value);
    if (text) {
        target[key] = text;
    }
}
//# sourceMappingURL=config.js.map