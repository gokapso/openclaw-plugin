import { createMessageReceiptFromOutboundResults } from "openclaw/plugin-sdk/channel-outbound";
import { CHANNEL_ID } from "./constants.js";
import { whatsAppTargetsEquivalent } from "./targets.js";
import { sendKapsoMedia, sendKapsoText, toOutboundDeliveryResult } from "./outbound.js";
export async function dispatchKapsoInboundEvent(params) {
    const { api, account, event } = params;
    await api.runtime.channel.inbound.run({
        channel: CHANNEL_ID,
        accountId: account.accountId,
        raw: event,
        adapter: {
            ingest: () => ({
                id: event.messageId,
                timestamp: event.timestampMs,
                rawText: event.text,
                textForAgent: event.text,
                textForCommands: event.text,
                raw: event.raw
            }),
            classify: () => ({
                kind: "message",
                canStartAgentTurn: true
            }),
            preflight: () => {
                const admission = resolveAdmission(account, event.from);
                return {
                    ...(admission ? { admission } : {}),
                    message: buildMessageFacts(event),
                    media: buildOpenClawMedia(event),
                    supplemental: {
                        untrustedContext: [{
                                label: "Kapso webhook metadata",
                                source: CHANNEL_ID,
                                type: "kapso.whatsapp.message",
                                payload: {
                                    conversationId: event.conversationId,
                                    phoneNumberId: event.phoneNumberId,
                                    displayPhoneNumber: event.displayPhoneNumber,
                                    type: event.type,
                                    transcriptSource: event.transcriptSource
                                }
                            }]
                    }
                };
            },
            resolveTurn: (input, _eventClass, preflight) => {
                const peer = {
                    kind: "direct",
                    id: event.from
                };
                const route = api.runtime.channel.routing.resolveAgentRoute({
                    cfg: api.config,
                    channel: CHANNEL_ID,
                    accountId: account.accountId,
                    peer
                });
                const storePath = api.runtime.channel.session.resolveStorePath(api.config.session?.store, {
                    agentId: route.agentId
                });
                const ctxPayload = api.runtime.channel.inbound.buildContext({
                    channel: CHANNEL_ID,
                    accountId: route.accountId,
                    provider: CHANNEL_ID,
                    surface: "whatsapp",
                    messageId: event.messageId,
                    messageIdFull: event.messageId,
                    timestamp: event.timestampMs,
                    from: event.from,
                    sender: {
                        id: event.from,
                        name: event.contactName,
                        username: event.from,
                        displayLabel: event.contactName ?? event.from
                    },
                    conversation: {
                        kind: "direct",
                        id: event.from,
                        label: event.contactName ?? event.from,
                        routePeer: peer
                    },
                    route: {
                        agentId: route.agentId,
                        accountId: route.accountId,
                        routeSessionKey: route.sessionKey,
                        dispatchSessionKey: route.sessionKey,
                        persistedSessionKey: route.mainSessionKey,
                        mainSessionKey: route.mainSessionKey,
                        createIfMissing: true
                    },
                    reply: {
                        to: event.from,
                        originatingTo: event.from,
                        replyTarget: event.from,
                        deliveryTarget: event.from,
                        replyToId: event.messageId,
                        replyToIdFull: event.messageId
                    },
                    message: {
                        ...buildMessageFacts(event),
                        ...preflight.message
                    },
                    media: buildOpenClawMedia(event),
                    supplemental: preflight.supplemental,
                    extra: {
                        kapso: {
                            conversationId: event.conversationId,
                            phoneNumberId: event.phoneNumberId,
                            displayPhoneNumber: event.displayPhoneNumber,
                            type: event.type,
                            transcriptSource: event.transcriptSource
                        }
                    }
                });
                return {
                    cfg: api.config,
                    channel: CHANNEL_ID,
                    accountId: route.accountId,
                    agentId: route.agentId,
                    routeSessionKey: route.sessionKey,
                    storePath,
                    ctxPayload,
                    recordInboundSession: api.runtime.channel.session.recordInboundSession,
                    dispatchReplyWithBufferedBlockDispatcher: api.runtime.channel.reply.dispatchReplyWithBufferedBlockDispatcher,
                    delivery: createInboundDeliveryAdapter(api.config, account, event),
                    record: {
                        createIfMissing: true,
                        updateLastRoute: {
                            sessionKey: route.mainSessionKey,
                            channel: CHANNEL_ID,
                            to: event.from,
                            accountId: route.accountId
                        },
                        onRecordError: (err) => {
                            api.logger.warn(`kapso-whatsapp: failed to record inbound session: ${String(err)}`);
                        }
                    },
                    admission: preflight.admission?.kind === "dispatch" || preflight.admission?.kind === "observeOnly"
                        ? preflight.admission
                        : undefined,
                    botLoopProtection: {
                        scopeId: CHANNEL_ID,
                        conversationId: event.from,
                        senderId: event.from,
                        receiverId: account.phoneNumberId ?? CHANNEL_ID,
                        defaultEnabled: true
                    },
                    messageId: input.id
                };
            }
        }
    });
}
function buildMessageFacts(event) {
    return {
        inboundEventKind: "user_request",
        body: event.text,
        rawBody: event.text,
        bodyForAgent: event.text,
        commandBody: event.text,
        envelopeFrom: event.from,
        senderLabel: event.contactName ?? event.from,
        preview: event.text.slice(0, 160),
        transcript: event.transcript,
        transcriptSource: event.transcriptSource
    };
}
function buildOpenClawMedia(event) {
    return event.media.flatMap((media) => {
        if (!media.url)
            return [];
        if (event.transcript && (event.type === "audio" || media.kind === "audio"))
            return [];
        return [{
                url: media.url,
                contentType: media.contentType,
                kind: media.kind,
                messageId: event.messageId
            }];
    });
}
function resolveAdmission(account, from) {
    if (!account.enabled) {
        return { kind: "drop", reason: "kapso account disabled", recordHistory: false };
    }
    if (account.dmSecurity === "disabled") {
        return { kind: "drop", reason: "kapso DM ingress disabled", recordHistory: false };
    }
    if (account.dmSecurity === "allowlist" && account.allowFrom.length > 0 && !isAllowedSender(account.allowFrom, from)) {
        return { kind: "drop", reason: "sender is not in kapso allowFrom", recordHistory: false };
    }
    return undefined;
}
function isAllowedSender(allowFrom, from) {
    return allowFrom.some((entry) => entry === from || whatsAppTargetsEquivalent(entry, from));
}
function createInboundDeliveryAdapter(cfg, account, event) {
    return {
        durable: {
            to: event.from,
            replyToId: event.messageId,
            requiredCapabilities: {
                text: true,
                media: true,
                replyTo: true
            }
        },
        deliver: async (payload) => {
            const text = typeof payload.text === "string" ? payload.text : "";
            const mediaUrls = listPayloadMediaUrls(payload);
            const results = [];
            for (const mediaUrl of mediaUrls) {
                const sent = await sendKapsoMedia({
                    cfg,
                    accountId: account.accountId,
                    to: event.from,
                    mediaUrl,
                    text,
                    replyToId: event.messageId
                });
                results.push(toOutboundDeliveryResult(sent));
            }
            if (text && mediaUrls.length === 0) {
                const sent = await sendKapsoText({
                    cfg,
                    accountId: account.accountId,
                    to: event.from,
                    text,
                    replyToId: event.messageId
                });
                results.push(toOutboundDeliveryResult(sent));
            }
            if (results.length === 0) {
                return {
                    visibleReplySent: false
                };
            }
            return {
                messageIds: results.map((result) => result.messageId),
                receipt: createMessageReceiptFromOutboundResults({
                    results,
                    kind: mediaUrls.length > 0 ? "media" : "text",
                    replyToId: event.messageId
                }),
                replyToId: event.messageId,
                visibleReplySent: true
            };
        },
        onError: (err) => {
            // The OpenClaw dispatcher surfaces the actual error. This hook just keeps
            // the channel delivery adapter complete for older dispatch paths.
            void err;
        }
    };
}
function listPayloadMediaUrls(payload) {
    const urls = new Set();
    const record = payload;
    if (typeof record.mediaUrl === "string" && record.mediaUrl)
        urls.add(record.mediaUrl);
    if (Array.isArray(record.mediaUrls)) {
        for (const url of record.mediaUrls) {
            if (typeof url === "string" && url)
                urls.add(url);
        }
    }
    return [...urls];
}
//# sourceMappingURL=inbound.js.map