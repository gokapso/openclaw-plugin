import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import { CHANNEL_ID } from "./constants.js";
import { resolveKapsoAccount } from "./config.js";
import { dispatchKapsoInboundEvent } from "./inbound.js";
import { sendKapsoText } from "./outbound.js";
import { normalizeWhatsAppTarget, whatsAppTargetsEquivalent } from "./targets.js";
import {
  KAPSO_MESSAGE_RECEIVED_EVENT,
  normalizeKapsoWebhook,
  verifyKapsoWebhookSignature
} from "./webhook.js";

describe("Kapso OpenClaw plugin", () => {
  it("normalizes WhatsApp phone targets and provider prefixes", () => {
    expect(normalizeWhatsAppTarget("wa:+1 (555) 123-4567")).toBe("+15551234567");
    expect(normalizeWhatsAppTarget("kapso-whatsapp: 15551234567")).toBe("15551234567");
    expect(normalizeWhatsAppTarget("not-a-phone")).toBeUndefined();
    expect(whatsAppTargetsEquivalent("+56975746426", "56975746426")).toBe(true);
  });

  it("resolves env-backed account configuration", () => {
    const account = resolveKapsoAccount(emptyConfig(), undefined, {
      KAPSO_API_KEY: "kapso_test",
      KAPSO_PHONE_NUMBER_ID: "pn_123",
      KAPSO_WEBHOOK_SECRET: "secret",
      KAPSO_BASE_URL: "https://api.example.test/meta/whatsapp"
    });

    expect(account.configured).toBe(true);
    expect(account.apiKey).toBe("kapso_test");
    expect(account.phoneNumberId).toBe("pn_123");
    expect(account.baseUrl).toBe("https://api.example.test/meta/whatsapp");
    expect(account.webhookPath).toBe("/kapso/webhook");
  });

  it("prefers account config over env defaults", () => {
    const cfg = {
      channels: {
        [CHANNEL_ID]: {
          accounts: {
            support: {
              apiKey: "from-config",
              phoneNumberId: "pn_config",
              webhookPath: "webhooks/kapso/support",
              allowFrom: ["+1 (555) 123-4567"]
            }
          }
        }
      }
    } as unknown as OpenClawConfig;

    const account = resolveKapsoAccount(cfg, "support", {
      KAPSO_API_KEY: "from-env",
      KAPSO_PHONE_NUMBER_ID: "pn_env"
    });

    expect(account.apiKey).toBe("from-config");
    expect(account.phoneNumberId).toBe("pn_config");
    expect(account.webhookPath).toBe("/webhooks/kapso/support");
    expect(account.allowFrom).toEqual(["+15551234567"]);
  });

  it("coerces number-like channel config values to strings", () => {
    const cfg = {
      channels: {
        [CHANNEL_ID]: {
          apiKey: "from-config",
          phoneNumberId: 1234567890,
          defaultTo: 15551234567
        }
      }
    } as unknown as OpenClawConfig;

    const account = resolveKapsoAccount(cfg);

    expect(account.phoneNumberId).toBe("1234567890");
    expect(account.defaultTo).toBe("15551234567");
  });

  it("verifies Kapso webhook signatures", () => {
    const rawBody = Buffer.from(JSON.stringify({ ok: true }));
    const signature = createHmac("sha256", "shared-secret").update(rawBody).digest("hex");

    expect(verifyKapsoWebhookSignature({
      rawBody,
      signatureHeader: `sha256=${signature}`,
      webhookSecret: "shared-secret"
    })).toBe(true);
    expect(verifyKapsoWebhookSignature({
      rawBody,
      signatureHeader: "sha256=deadbeef",
      webhookSecret: "shared-secret"
    })).toBe(false);
  });

  it("normalizes batched Kapso message received webhooks", () => {
    const normalized = normalizeKapsoWebhook({
      data: [{
        event: KAPSO_MESSAGE_RECEIVED_EVENT,
        phone_number_id: "pn_123",
        conversation: {
          id: "conv_123",
          phone_number: "+1 (555) 123-4567",
          kapso: {
            contactName: "Ada"
          }
        },
        message: {
          id: "wamid.123",
          from: "15551234567",
          type: "text",
          timestamp: "1710000000",
          text: {
            body: "hello"
          }
        }
      }]
    }, {
      eventName: KAPSO_MESSAGE_RECEIVED_EVENT,
      batchHeader: "true"
    });

    expect(normalized.phoneNumberId).toBe("pn_123");
    expect(normalized.events).toHaveLength(1);
    expect(normalized.events[0]).toMatchObject({
      messageId: "wamid.123",
      from: "15551234567",
      text: "hello",
      conversationId: "conv_123",
      contactName: "Ada"
    });
  });

  it("prefers Kapso audio transcripts over OpenClaw audio transcription", async () => {
    const normalized = normalizeKapsoWebhook({
      event: KAPSO_MESSAGE_RECEIVED_EVENT,
      phone_number_id: "pn_123",
      conversation: {
        id: "conv_123",
        phone_number: "+1 (555) 123-4567"
      },
      message: {
        id: "wamid.voice",
        from: "15551234567",
        type: "audio",
        timestamp: "1710000000",
        audio: {
          id: "media_123"
        },
        kapso: {
          has_media: true,
          media_url: "https://api.kapso.ai/media/voice.ogg",
          media_data: {
            filename: "voice.ogg",
            content_type: "audio/ogg"
          },
          content: "[Audio attached] (voice.ogg) URL: https://api.kapso.ai/media/voice.ogg\nTranscript: Hello, I need help with my order",
          transcript: {
            text: "Hello, I need help with my order"
          }
        }
      }
    }, {
      eventName: KAPSO_MESSAGE_RECEIVED_EVENT
    });

    const event = normalized.events[0];
    expect(event).toMatchObject({
      text: "Hello, I need help with my order",
      transcript: "Hello, I need help with my order",
      transcriptSource: "kapso.transcript",
      media: [{
        url: "https://api.kapso.ai/media/voice.ogg",
        id: "media_123",
        contentType: "audio/ogg",
        kind: "audio"
      }]
    });

    const run = vi.fn(async (input) => {
      const preflight = input.adapter.preflight();
      expect(preflight.message.body).toBe("Hello, I need help with my order");
      expect(preflight.media).toEqual([]);
      expect(preflight.supplemental.untrustedContext[0]?.payload).toMatchObject({
        transcriptSource: "kapso.transcript"
      });
    });

    await dispatchKapsoInboundEvent({
      api: {
        runtime: {
          channel: {
            inbound: { run }
          }
        }
      } as never,
      account: {
        accountId: "default",
        enabled: true,
        dmSecurity: "open",
        allowFrom: []
      } as never,
      event: event!
    });

    expect(run).toHaveBeenCalledOnce();
  });

  it("sends outbound text through the Kapso WhatsApp SDK", async () => {
    const sendText = vi.fn().mockResolvedValue({
      messagingProduct: "whatsapp",
      contacts: [{ input: "15551234567", waId: "15551234567" }],
      messages: [{ id: "wamid.outbound" }]
    });
    const clientFactory = vi.fn().mockResolvedValue({
      messages: { sendText }
    });
    const cfg = {
      channels: {
        [CHANNEL_ID]: {
          apiKey: "kapso_test",
          phoneNumberId: "pn_123"
        }
      }
    } as unknown as OpenClawConfig;

    const sent = await sendKapsoText({
      cfg,
      to: "wa:+1 (555) 123-4567",
      text: "hello from OpenClaw",
      replyToId: "wamid.inbound",
      clientFactory
    });

    expect(sent.messageId).toBe("wamid.outbound");
    expect(sendText).toHaveBeenCalledWith({
      phoneNumberId: "pn_123",
      to: "+15551234567",
      body: "hello from OpenClaw",
      contextMessageId: "wamid.inbound"
    });
  });
});

function emptyConfig(): OpenClawConfig {
  return { channels: {} } as unknown as OpenClawConfig;
}
