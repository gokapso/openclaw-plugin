import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeCompatibilityConfig, stateMigrations } from "./doctor-contract-api.js";

describe("Kapso Doctor contract", () => {
  it("preserves existing single-account, named-account, and unrelated settings", () => {
    const cfg = {
      channels: {
        "kapso-whatsapp": {
          enabled: true,
          apiKey: "kapso_test",
          phoneNumberId: 1234567890,
          webhookSecret: "existing-secret",
          webhookPath: "/kapso/webhook",
          defaultTo: 15551234567,
          dmSecurity: "allowlist",
          allowFrom: Array.from({ length: 16 }, (_, index) => `+1555123${index.toString().padStart(4, "0")}`),
          accounts: {
            support: {
              enabled: false,
              apiKey: "${SUPPORT_KAPSO_API_KEY}",
              phoneNumberId: "pn_support",
              webhookSecret: "${SUPPORT_WEBHOOK_SECRET}",
              webhookPath: "/kapso/support",
              allowFrom: ["15551234567"]
            }
          }
        }
      },
      plugins: { allow: ["codex", "kapso-whatsapp"], entries: { "kapso-whatsapp": { enabled: true } } },
      session: { store: "/existing/sessions/{agentId}.json" }
    };
    const before = structuredClone(cfg);
    freezeDeep(cfg);

    const result = normalizeCompatibilityConfig({ cfg });

    expect(result.config).toBe(cfg);
    expect(result.config).toEqual(before);
    expect(result.changes).toEqual([]);
  });

  it("does not create config or activate an absent or disabled channel", () => {
    for (const cfg of [{}, { channels: { "kapso-whatsapp": { enabled: false } } }]) {
      freezeDeep(cfg);
      expect(normalizeCompatibilityConfig({ cfg })).toEqual({ config: cfg, changes: [] });
    }
  });

  it("declares config inspection and an empty state migration list in the manifest", () => {
    const manifest = JSON.parse(readFileSync(new URL("../openclaw.plugin.json", import.meta.url), "utf8"));

    expect(manifest.doctorContract).toEqual({ configRepair: true, stateMigrations });
    expect(stateMigrations).toEqual([]);
  });

  it("ships a compiled Doctor artifact that loads without the channel, CLI, or SDK", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "kapso-doctor-artifact-"));
    try {
      copyFileSync(new URL("../dist/doctor-contract-api.js", import.meta.url), path.join(directory, "doctor-contract-api.js"));
      writeFileSync(path.join(directory, "package.json"), JSON.stringify({ type: "module" }));

      execFileSync(process.execPath, ["--input-type=module", "--eval", `
        import assert from "node:assert/strict";
        import { normalizeCompatibilityConfig, stateMigrations } from "./doctor-contract-api.js";
        const cfg = Object.freeze({});
        const result = normalizeCompatibilityConfig({ cfg });
        assert.equal(result.config, cfg);
        assert.deepEqual(result.changes, []);
        assert.deepEqual(stateMigrations, []);
      `], { cwd: directory, stdio: "pipe" });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

function freezeDeep(value: object): void {
  Object.freeze(value);
  for (const entry of Object.values(value)) {
    if (entry && typeof entry === "object") freezeDeep(entry);
  }
}
