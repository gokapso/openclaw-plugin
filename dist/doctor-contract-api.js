/**
 * OpenClaw loads this artifact independently of the channel and Kapso CLI.
 * Existing Kapso config is already current, so inspection must preserve it.
 */
export function normalizeCompatibilityConfig({ cfg }) {
    return { config: cfg, changes: [] };
}
// Kapso owns no local session or credential store. OpenClaw owns channel sessions,
// and webhook registrations remain in Kapso; neither needs a plugin migration.
export const stateMigrations = [];
//# sourceMappingURL=doctor-contract-api.js.map