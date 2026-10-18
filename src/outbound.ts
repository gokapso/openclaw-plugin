import type { SendMessageResponse } from "@kapso/whatsapp-cloud-api";
import { createMessageReceiptFromOutboundResults, defineChannelMessageAdapter } from "openclaw/plugin-sdk/channel-outbound";
import type { OutboundDeliveryResult } from "openclaw/plugin-sdk/outbound-runtime";
import type { ChannelMessageSendMediaContext, ChannelMessageSendTextContext } from "openclaw/plugin-sdk/channel-message";
import type { ChannelOutboundAdapter, ChannelOutboundContext } from "openclaw/plugin-sdk/channel-runtime";
import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import { CHANNEL_ID } from "./constants.js";
import { resolveKapsoAccount } from "./config.js";
import type { ResolvedKapsoAccount } from "./config.js";
import { createKapsoClient, firstKapsoMessageId } from "./kapso-client.js";
import type { KapsoClientFactory } from "./kapso-client.js";
import { normalizeWhatsAppTarget } from "./targets.js";

export type KapsoSendOptions = {
  clientFactory?: KapsoClientFactory;
  signal?: AbortSignal;
};

export type KapsoSendResult = {
  messageId: string;
  response: SendMessageResponse;
  to: string;
};

export async function sendKapsoText(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
  to: string;
  text: string;
  replyToId?: string | null;
} & KapsoSendOptions): Promise<KapsoSendResult> {
  const account = requireOutboundAccount(resolveKapsoAccount(params.cfg, params.accountId));
  const to = requireTarget(params.to);
  const client = await (params.clientFactory ?? createKapsoClient)(account, params.signal);
  const response = await client.messages.sendText({
    phoneNumberId: account.phoneNumberId,
    to,
    body: params.text,
    ...(params.replyToId ? { contextMessageId: params.replyToId } : {})
  });

  return {
    messageId: firstKapsoMessageId(response) ?? `${to}:${Date.now()}`,
    response,
    to
  };
}

/**
 * Marks an inbound message as read and shows a WhatsApp typing indicator while the
 * agent prepares a reply. The indicator is dismissed when the reply is sent or after
 * ~25s (Meta's limit). Intended to be called best-effort/fire-and-forget on inbound.
 */
export async function sendKapsoTypingIndicator(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
  messageId: string;
} & KapsoSendOptions): Promise<void> {
  const account = requireOutboundAccount(resolveKapsoAccount(params.cfg, params.accountId));
  const client = await (params.clientFactory ?? createKapsoClient)(account, params.signal);
  await client.messages.markRead({
    phoneNumberId: account.phoneNumberId,
    messageId: params.messageId,
    typingIndicator: { type: "text" }
  });
}

export async function sendKapsoMedia(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
  to: string;
  mediaUrl: string;
  text?: string;
  replyToId?: string | null;
  forceDocument?: boolean;
  audioAsVoice?: boolean;
} & KapsoSendOptions): Promise<KapsoSendResult> {
  const account = requireOutboundAccount(resolveKapsoAccount(params.cfg, params.accountId));
  const to = requireTarget(params.to);
  const client = await (params.clientFactory ?? createKapsoClient)(account, params.signal);
  const media = {
    link: params.mediaUrl,
    ...(params.text ? { caption: params.text } : {})
  };
  const base = {
    phoneNumberId: account.phoneNumberId,
    to,
    ...(params.replyToId ? { contextMessageId: params.replyToId } : {})
  };

  const response = await sendMediaByUrl({
    client,
    base,
    mediaUrl: params.mediaUrl,
    caption: params.text,
    forceDocument: params.forceDocument,
    audioAsVoice: params.audioAsVoice,
    media
  });

  return {
    messageId: firstKapsoMessageId(response) ?? `${to}:${Date.now()}`,
    response,
    to
  };
}

export const kapsoMessageAdapter = defineChannelMessageAdapter({
  id: CHANNEL_ID,
  durableFinal: {
    capabilities: {
      text: true,
      media: true,
      replyTo: true,
      messageSendingHooks: true,
      afterSendSuccess: true,
      afterCommit: true
    }
  },
  send: {
    text: async (ctx: ChannelMessageSendTextContext) => {
      const sent = await sendKapsoText({
        cfg: ctx.cfg,
        accountId: ctx.accountId,
        to: ctx.to,
        text: ctx.text,
        replyToId: ctx.replyToId,
        signal: ctx.signal
      });

      return {
        messageId: sent.messageId,
        receipt: createMessageReceiptFromOutboundResults({
          results: [toOutboundDeliveryResult(sent)],
          kind: "text",
          threadId: ctx.threadId == null ? undefined : String(ctx.threadId),
          replyToId: ctx.replyToId ?? undefined
        })
      };
    },
    media: async (ctx: ChannelMessageSendMediaContext) => {
      const sent = await sendKapsoMedia({
        cfg: ctx.cfg,
        accountId: ctx.accountId,
        to: ctx.to,
        mediaUrl: ctx.mediaUrl,
        text: ctx.text,
        replyToId: ctx.replyToId,
        forceDocument: ctx.forceDocument,
        audioAsVoice: ctx.audioAsVoice,
        signal: ctx.signal
      });

      return {
        messageId: sent.messageId,
        receipt: createMessageReceiptFromOutboundResults({
          results: [toOutboundDeliveryResult(sent)],
          kind: "media",
          threadId: ctx.threadId == null ? undefined : String(ctx.threadId),
          replyToId: ctx.replyToId ?? undefined
        })
      };
    }
  },
  receive: {
    defaultAckPolicy: "after_agent_dispatch",
    supportedAckPolicies: ["after_receive_record", "after_agent_dispatch", "after_durable_send", "manual"]
  }
});

export const kapsoOutboundAdapter: ChannelOutboundAdapter = {
  deliveryMode: "direct",
  chunkerMode: "text",
  textChunkLimit: 4096,
  extractMarkdownImages: true,
  presentationCapabilities: {
    supported: false,
    limits: {
      text: {
        maxLength: 4096,
        markdownDialect: "markdown"
      }
    }
  },
  deliveryCapabilities: {
    durableFinal: {
      text: true,
      media: true,
      replyTo: true,
      messageSendingHooks: true,
      afterSendSuccess: true,
      afterCommit: true
    }
  },
  resolveTarget(params) {
    const to = normalizeWhatsAppTarget(params.to);
    return to ? { ok: true, to } : { ok: false, error: new Error("Expected a WhatsApp phone number target.") };
  },
  sendText: async (ctx: ChannelOutboundContext): Promise<OutboundDeliveryResult> => {
    const sent = await sendKapsoText({
      cfg: ctx.cfg,
      accountId: ctx.accountId,
      to: ctx.to,
      text: ctx.text,
      replyToId: ctx.replyToId
    });
    return toOutboundDeliveryResult(sent);
  },
  sendMedia: async (ctx: ChannelOutboundContext): Promise<OutboundDeliveryResult> => {
    if (!ctx.mediaUrl) {
      throw new Error("Kapso media send requires mediaUrl.");
    }
    const sent = await sendKapsoMedia({
      cfg: ctx.cfg,
      accountId: ctx.accountId,
      to: ctx.to,
      mediaUrl: ctx.mediaUrl,
      text: ctx.text,
      replyToId: ctx.replyToId,
      forceDocument: ctx.forceDocument,
      audioAsVoice: ctx.audioAsVoice
    });
    return toOutboundDeliveryResult(sent);
  }
};

export function toOutboundDeliveryResult(sent: Pick<KapsoSendResult, "messageId" | "to">): OutboundDeliveryResult {
  return {
    channel: CHANNEL_ID,
    messageId: sent.messageId,
    conversationId: sent.to
  };
}

function requireOutboundAccount(account: ResolvedKapsoAccount): ResolvedKapsoAccount & {
  apiKey: string;
  phoneNumberId: string;
} {
  if (!account.enabled) throw new Error(`Kapso account ${account.accountId} is disabled.`);
  if (!account.apiKey) throw new Error("Kapso API key is required for outbound WhatsApp messages.");
  if (!account.phoneNumberId) throw new Error("Kapso phoneNumberId is required for outbound WhatsApp messages.");
  return account as ResolvedKapsoAccount & { apiKey: string; phoneNumberId: string };
}

function requireTarget(raw: string): string {
  const to = normalizeWhatsAppTarget(raw);
  if (!to) throw new Error("Expected a WhatsApp phone number target.");
  return to;
}

async function sendMediaByUrl(params: {
  client: Awaited<ReturnType<KapsoClientFactory>>;
  base: {
    phoneNumberId: string;
    to: string;
    contextMessageId?: string;
  };
  mediaUrl: string;
  caption?: string;
  forceDocument?: boolean;
  audioAsVoice?: boolean;
  media: {
    link: string;
    caption?: string;
  };
}): Promise<SendMessageResponse> {
  const lower = stripQuery(params.mediaUrl).toLowerCase();

  if (!params.forceDocument && isImageUrl(lower)) {
    return params.client.messages.sendImage({
      ...params.base,
      image: params.media
    });
  }

  if (!params.forceDocument && isVideoUrl(lower)) {
    return params.client.messages.sendVideo({
      ...params.base,
      video: params.media
    });
  }

  if (!params.forceDocument && isAudioUrl(lower)) {
    return params.client.messages.sendAudio({
      ...params.base,
      audio: {
        link: params.mediaUrl,
        ...(params.audioAsVoice ? { voice: true } : {})
      }
    });
  }

  return params.client.messages.sendDocument({
    ...params.base,
    document: {
      link: params.mediaUrl,
      ...(params.caption ? { caption: params.caption } : {}),
      filename: filenameFromUrl(params.mediaUrl)
    }
  });
}

function stripQuery(url: string): string {
  return url.split(/[?#]/, 1)[0] ?? url;
}

function isImageUrl(url: string): boolean {
  return /\.(apng|avif|gif|jpeg|jpg|png|webp)$/.test(url);
}

function isVideoUrl(url: string): boolean {
  return /\.(3gp|m4v|mov|mp4|mpeg|webm)$/.test(url);
}

function isAudioUrl(url: string): boolean {
  return /\.(aac|amr|m4a|mp3|ogg|opus|wav)$/.test(url);
}

function filenameFromUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    const basename = parsed.pathname.split("/").filter(Boolean).pop();
    return basename || undefined;
  } catch {
    const basename = stripQuery(url).split("/").filter(Boolean).pop();
    return basename || undefined;
  }
}
