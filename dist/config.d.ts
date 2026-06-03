import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import { buildJsonChannelConfigSchema } from "openclaw/plugin-sdk/core";
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
export declare const kapsoChannelConfigSchema: ReturnType<typeof buildJsonChannelConfigSchema>;
export declare function getKapsoChannelSection(cfg: OpenClawConfig): KapsoWhatsappChannelConfig;
export declare function listKapsoAccountIds(cfg: OpenClawConfig): string[];
export declare function resolveDefaultKapsoAccountId(cfg: OpenClawConfig): string;
export declare function resolveKapsoAccount(cfg: OpenClawConfig, accountId?: string | null, env?: NodeJS.ProcessEnv): ResolvedKapsoAccount;
export declare function inspectKapsoAccount(cfg: OpenClawConfig, accountId?: string | null): Record<string, unknown>;
export declare function setKapsoAccountEnabled(params: {
    cfg: OpenClawConfig;
    accountId: string;
    enabled: boolean;
}): OpenClawConfig;
export declare function applyKapsoAccountName(params: {
    cfg: OpenClawConfig;
    accountId: string;
    name?: string;
}): OpenClawConfig;
export declare function applyKapsoAccountConfig(params: {
    cfg: OpenClawConfig;
    accountId: string;
    input: Record<string, unknown>;
}): OpenClawConfig;
export declare function validateKapsoSetupInput(input: Record<string, unknown>): string | null;
export declare function normalizeWebhookPath(path: string | undefined): string;
//# sourceMappingURL=config.d.ts.map