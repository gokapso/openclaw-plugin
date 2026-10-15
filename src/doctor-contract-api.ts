import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";

/**
 * OpenClaw loads this artifact independently of the channel and Kapso CLI.
 * Existing Kapso config is already current, so inspection must preserve it.
 */
export function normalizeCompatibilityConfig({ cfg }: { cfg: OpenClawConfig }): {
  config: OpenClawConfig;
  changes: string[];
} {
  return { config: cfg, changes: [] };
}

// Kapso owns no local session or credential store. OpenClaw owns channel sessions,
// and webhook registrations remain in Kapso; neither needs a plugin migration.
export const stateMigrations = [];
