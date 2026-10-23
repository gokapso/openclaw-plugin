import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { normalizeChannelId } from "openclaw/plugin-sdk/channel-targets";
import { kapsoWhatsappPlugin } from "./channel.js";
import { CHANNEL_ID, TARGET_PREFIXES } from "./constants.js";
import { normalizeWhatsAppTarget } from "./targets.js";

// OpenClaw's plugin SDK has no public way to install channels for a test, so this uses the global key
// OpenClaw itself uses to share the active channel registry between copies of its runtime. Lookups then
// go through OpenClaw's own channel-name resolution.
const REGISTRY_STATE = Symbol.for("openclaw.pluginRegistryState");
const nativeWhatsapp = { id: "whatsapp", meta: { id: "whatsapp", label: "WhatsApp" } };
let registryVersion = 0;

type GlobalWithRegistry = typeof globalThis & Record<symbol, unknown>;
const registryGlobal = globalThis as GlobalWithRegistry;
const hadRegistryState = REGISTRY_STATE in registryGlobal;
const previousRegistryState = registryGlobal[REGISTRY_STATE];

function registerChannels(...plugins: Array<{ id: string }>) {
  // A fresh registry object and version each time, so OpenClaw's lookup cache cannot carry over.
  registryGlobal[REGISTRY_STATE] = {
    activeRegistry: { channels: plugins.map((plugin) => ({ plugin, pluginId: plugin.id })) },
    activeVersion: ++registryVersion
  };
}

describe("Kapso channel identity", () => {
  afterEach(() => {
    if (hadRegistryState) registryGlobal[REGISTRY_STATE] = previousRegistryState;
    else delete registryGlobal[REGISTRY_STATE];
  });

  it("does not shadow OpenClaw's WhatsApp channel, whichever registers first", () => {
    for (const order of [[kapsoWhatsappPlugin, nativeWhatsapp], [nativeWhatsapp, kapsoWhatsappPlugin]]) {
      registerChannels(...order);
      expect(normalizeChannelId("whatsapp")).toBe("whatsapp");
      expect(normalizeChannelId("wa")).toBeNull();
      expect(normalizeChannelId("kapso-whatsapp")).toBe(CHANNEL_ID);
      expect(normalizeChannelId("kapso")).toBe(CHANNEL_ID);
    }
  });

  it("resolves only its own names when it is the only WhatsApp channel", () => {
    registerChannels(kapsoWhatsappPlugin);
    expect(normalizeChannelId("kapso-whatsapp")).toBe(CHANNEL_ID);
    expect(normalizeChannelId("kapso")).toBe(CHANNEL_ID);
    expect(normalizeChannelId("whatsapp")).toBeNull();
    expect(normalizeChannelId("wa")).toBeNull();
  });

  it("declares the same aliases in package metadata and at runtime", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    expect(pkg.openclaw.channel.id).toBe(CHANNEL_ID);
    expect(kapsoWhatsappPlugin.meta.aliases).toEqual(["kapso"]);
    expect(pkg.openclaw.channel.aliases).toEqual(kapsoWhatsappPlugin.meta.aliases);
  });

  it("keeps accepting every documented phone-number target format", () => {
    for (const prefix of ["kapso:", "kapso-whatsapp:", "whatsapp:", "wa:", ""]) {
      expect(normalizeWhatsAppTarget(`${prefix}+15551234567`)).toBe("+15551234567");
    }
    expect(normalizeWhatsAppTarget("15551234567")).toBe("15551234567");
  });

  it("does not claim generic target prefixes for routing", () => {
    // OpenClaw matches target prefixes without the trailing colon, so a bare "whatsapp" or "wa" here
    // would compete with OpenClaw's WhatsApp channel for whatsapp:/wa: targets.
    expect(kapsoWhatsappPlugin.messaging?.targetPrefixes).toEqual(TARGET_PREFIXES);
    expect(kapsoWhatsappPlugin.messaging?.targetPrefixes).not.toContain("whatsapp");
    expect(kapsoWhatsappPlugin.messaging?.targetPrefixes).not.toContain("wa");
  });
});
