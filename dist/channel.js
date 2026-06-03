import { buildChannelOutboundSessionRoute } from "openclaw/plugin-sdk/channel-core";
import { CHANNEL_ID, CHANNEL_LABEL, DEFAULT_ACCOUNT_ID, TARGET_PREFIXES } from "./constants.js";
import { applyKapsoAccountConfig, applyKapsoAccountName, inspectKapsoAccount, kapsoChannelConfigSchema, listKapsoAccountIds, resolveDefaultKapsoAccountId, resolveKapsoAccount, setKapsoAccountEnabled, validateKapsoSetupInput } from "./config.js";
import { kapsoMessageAdapter, kapsoOutboundAdapter } from "./outbound.js";
import { looksLikeWhatsAppTarget, normalizeWhatsAppTarget } from "./targets.js";
export const kapsoWhatsappPlugin = {
    id: CHANNEL_ID,
    meta: {
        id: CHANNEL_ID,
        label: CHANNEL_LABEL,
        selectionLabel: "WhatsApp via Kapso",
        docsPath: "https://docs.kapso.ai",
        docsLabel: "Kapso docs",
        blurb: "Send and receive WhatsApp messages through Kapso.",
        aliases: ["kapso", "whatsapp", "wa"],
        markdownCapable: true,
        showConfigured: true,
        showInSetup: true,
        quickstartAllowFrom: true,
        preferOver: ["whatsapp"]
    },
    capabilities: {
        chatTypes: ["direct"],
        reply: true,
        media: true
    },
    defaults: {
        queue: {
            debounceMs: 750
        }
    },
    reload: {
        configPrefixes: [`channels.${CHANNEL_ID}`],
        noopPrefixes: [`channels.${CHANNEL_ID}.name`]
    },
    configSchema: kapsoChannelConfigSchema,
    config: {
        listAccountIds: listKapsoAccountIds,
        resolveAccount: resolveKapsoAccount,
        inspectAccount: inspectKapsoAccount,
        defaultAccountId: resolveDefaultKapsoAccountId,
        setAccountEnabled: setKapsoAccountEnabled,
        isEnabled: (account) => account.enabled,
        disabledReason: (account) => `Kapso account ${account.accountId} is disabled.`,
        isConfigured: (account) => account.configured,
        unconfiguredReason: () => "Set KAPSO_API_KEY and KAPSO_PHONE_NUMBER_ID, or configure apiKey and phoneNumberId.",
        describeAccount: (account) => buildKapsoAccountSnapshot(account),
        resolveAllowFrom: ({ cfg, accountId }) => resolveKapsoAccount(cfg, accountId).allowFrom,
        formatAllowFrom: ({ allowFrom }) => allowFrom.map(String),
        hasConfiguredState: ({ cfg, env }) => {
            const account = resolveKapsoAccount(cfg, resolveDefaultKapsoAccountId(cfg), env);
            return account.configured;
        },
        hasPersistedAuthState: ({ cfg, env }) => {
            const account = resolveKapsoAccount(cfg, resolveDefaultKapsoAccountId(cfg), env);
            return Boolean(account.apiKey || account.webhookSecret);
        },
        resolveDefaultTo: ({ cfg, accountId }) => resolveKapsoAccount(cfg, accountId).defaultTo
    },
    setup: {
        resolveAccountId: ({ accountId, input }) => {
            const inputRecord = input;
            const fromInput = typeof inputRecord?.accountId === "string" ? inputRecord.accountId : undefined;
            return accountId ?? fromInput ?? DEFAULT_ACCOUNT_ID;
        },
        applyAccountName: applyKapsoAccountName,
        applyAccountConfig: ({ cfg, accountId, input }) => applyKapsoAccountConfig({
            cfg,
            accountId,
            input: input
        }),
        validateInput: ({ input }) => validateKapsoSetupInput(input),
        singleAccountKeysToMove: [
            "apiKey",
            "phoneNumberId",
            "webhookSecret",
            "baseUrl",
            "webhookPath",
            "defaultTo",
            "allowFrom",
            "dmSecurity"
        ],
        namedAccountPromotionKeys: ["phoneNumberId", "name"]
    },
    security: {
        resolveDmPolicy: ({ account }) => ({
            policy: account.dmSecurity,
            allowFrom: account.allowFrom,
            allowFromPath: `channels.${CHANNEL_ID}.allowFrom`,
            approveHint: "Add the sender phone number to allowFrom or set dmSecurity to open.",
            normalizeEntry: (raw) => normalizeWhatsAppTarget(raw) ?? raw.trim()
        }),
        collectWarnings: ({ account }) => {
            const warnings = [];
            if (account.dmSecurity === "open") {
                warnings.push("Kapso WhatsApp DMs are open to any sender that can reach the webhook.");
            }
            if (!account.webhookSecret) {
                warnings.push("KAPSO_WEBHOOK_SECRET is missing; inbound webhooks will be rejected.");
            }
            return warnings;
        }
    },
    status: {
        defaultRuntime: {
            accountId: DEFAULT_ACCOUNT_ID,
            enabled: true,
            configured: false,
            connected: false,
            statusState: "not configured"
        },
        buildAccountSnapshot: ({ account }) => buildKapsoAccountSnapshot(account),
        buildCapabilitiesDiagnostics: async ({ account }) => ({
            lines: [
                {
                    text: account.configured
                        ? `Kapso phone number ${account.phoneNumberId} is configured.`
                        : "Kapso credentials are not configured.",
                    tone: account.configured ? "success" : "warn"
                },
                {
                    text: account.webhookSecret
                        ? `Webhook route ${account.webhookPath} expects Kapso signatures.`
                        : `Webhook route ${account.webhookPath} is missing a secret.`,
                    tone: account.webhookSecret ? "success" : "error"
                }
            ],
            details: inspectAccountDetails(account)
        })
    },
    outbound: kapsoOutboundAdapter,
    message: kapsoMessageAdapter,
    messaging: {
        targetPrefixes: TARGET_PREFIXES,
        normalizeTarget: normalizeWhatsAppTarget,
        inferTargetChatType: ({ to }) => looksLikeWhatsAppTarget(to) ? "direct" : undefined,
        resolveOutboundSessionRoute: ({ cfg, agentId, accountId, target, replyToId, threadId }) => {
            const to = normalizeWhatsAppTarget(target);
            if (!to)
                return null;
            const route = buildChannelOutboundSessionRoute({
                cfg,
                agentId,
                channel: CHANNEL_ID,
                accountId,
                peer: {
                    kind: "direct",
                    id: to
                },
                chatType: "direct",
                from: CHANNEL_ID,
                to,
                ...(threadId ? { threadId } : {})
            });
            if (!replyToId)
                return route;
            return {
                ...route,
                threadId: route.threadId ?? replyToId
            };
        },
        targetResolver: {
            looksLikeId: (raw) => looksLikeWhatsAppTarget(raw),
            hint: "WhatsApp phone number, for example wa:+15551234567",
            resolveTarget: async ({ input, normalized }) => {
                const to = normalizeWhatsAppTarget(normalized) ?? normalizeWhatsAppTarget(input);
                return to ? {
                    to,
                    kind: "user",
                    display: to,
                    source: "normalized"
                } : null;
            }
        },
        formatTargetDisplay: ({ target }) => normalizeWhatsAppTarget(target) ?? target
    },
    agentPrompt: {
        messageToolHints: () => [
            "Use Kapso WhatsApp targets as phone numbers, for example wa:+15551234567.",
            "WhatsApp supports text and media delivery; long text is split at channel limits."
        ],
        messageToolCapabilities: () => ["text", "media", "reply-to-message"],
        inboundFormattingHints: () => ({
            text_markup: "whatsapp-markdown",
            rules: [
                "Keep replies concise.",
                "Use WhatsApp-friendly Markdown."
            ]
        })
    }
};
function buildKapsoAccountSnapshot(account) {
    return {
        accountId: account.accountId,
        name: account.name ?? account.phoneNumberId ?? account.accountId,
        enabled: account.enabled,
        configured: account.configured,
        linked: account.configured,
        connected: account.configured,
        statusState: account.enabled ? (account.configured ? "configured" : "not configured") : "disabled",
        mode: "kapso-cloud-api",
        dmPolicy: account.dmSecurity,
        allowFrom: account.allowFrom,
        tokenStatus: account.apiKey ? "available" : "missing",
        signingSecretStatus: account.webhookSecret ? "available" : "missing",
        webhookPath: account.webhookPath,
        baseUrl: account.baseUrl,
        audienceType: "whatsapp",
        audience: account.phoneNumberId
    };
}
function inspectAccountDetails(account) {
    return {
        accountId: account.accountId,
        phoneNumberId: account.phoneNumberId,
        baseUrl: account.baseUrl,
        webhookPath: account.webhookPath,
        dmSecurity: account.dmSecurity,
        allowFromCount: account.allowFrom.length,
        configured: account.configured,
        enabled: account.enabled
    };
}
//# sourceMappingURL=channel.js.map