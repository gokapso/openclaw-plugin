import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
/**
 * OpenClaw loads this artifact independently of the channel and Kapso CLI.
 * Existing Kapso config is already current, so inspection must preserve it.
 */
export declare function normalizeCompatibilityConfig({ cfg }: {
    cfg: OpenClawConfig;
}): {
    config: OpenClawConfig;
    changes: string[];
};
export declare const stateMigrations: never[];
//# sourceMappingURL=doctor-contract-api.d.ts.map