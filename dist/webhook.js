import { Buffer } from "node:buffer";
import { createHmac, timingSafeEqual } from "node:crypto";
import { normalizeWhatsAppTarget } from "./targets.js";
export const KAPSO_MESSAGE_RECEIVED_EVENT = "whatsapp.message.received";
export function isKapsoWebhookHeaders(headers) {
    return Boolean(readHeader(headers, "x-webhook-signature") ||
        readHeader(headers, "x-webhook-event") ||
        readHeader(headers, "x-webhook-batch"));
}
export async function readRawRequestBody(req, limitBytes = 2_000_000) {
    const chunks = [];
    let total = 0;
    for await (const chunk of req) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += buffer.byteLength;
        if (total > limitBytes) {
            throw new Error(`request body exceeds ${limitBytes} bytes`);
        }
        chunks.push(buffer);
    }
    return Buffer.concat(chunks);
}
export function readHeader(headers, name) {
    const value = headers[name.toLowerCase()];
    if (Array.isArray(value))
        return value[0];
    return value;
}
export function verifyKapsoWebhookSignature(input) {
    const signature = input.signatureHeader?.replace(/^sha256=/i, "").trim();
    if (!signature)
        return false;
    const expected = createHmac("sha256", input.webhookSecret)
        .update(input.rawBody)
        .digest("hex");
    try {
        const actualBuffer = Buffer.from(signature, "hex");
        const expectedBuffer = Buffer.from(expected, "hex");
        return actualBuffer.byteLength === expectedBuffer.byteLength && timingSafeEqual(actualBuffer, expectedBuffer);
    }
    catch {
        return false;
    }
}
export function findVerifiedWebhookAccount(input) {
    return input.accounts.find((account) => {
        return Boolean(account.webhookSecret &&
            verifyKapsoWebhookSignature({
                rawBody: input.rawBody,
                signatureHeader: input.signatureHeader,
                webhookSecret: account.webhookSecret
            }));
    });
}
export function normalizeKapsoWebhook(payload, options = {}) {
    if (options.eventName && options.eventName !== KAPSO_MESSAGE_RECEIVED_EVENT) {
        return {
            phoneNumberId: options.defaultPhoneNumberId,
            events: []
        };
    }
    const events = extractKapsoWebhookEvents(payload, options.batchHeader);
    let phoneNumberId = options.defaultPhoneNumberId;
    let displayPhoneNumber;
    const inboundEvents = [];
    for (const event of events) {
        const eventName = readRecordString(event, "event", "type") ?? options.eventName ?? KAPSO_MESSAGE_RECEIVED_EVENT;
        if (eventName !== KAPSO_MESSAGE_RECEIVED_EVENT)
            continue;
        const message = readRecord(event, "message");
        if (!message || !isKapsoWebhookMessage(message))
            continue;
        const conversation = readRecord(event, "conversation");
        const eventPhoneNumberId = readRecordString(event, "phone_number_id", "phoneNumberId") ??
            readRecordString(conversation, "phone_number_id", "phoneNumberId") ??
            phoneNumberId;
        if (eventPhoneNumberId)
            phoneNumberId = eventPhoneNumberId;
        displayPhoneNumber =
            displayPhoneNumber ??
                readRecordString(conversation, "display_phone_number", "displayPhoneNumber");
        const inbound = normalizeKapsoInboundEvent({
            event,
            message,
            conversation,
            eventName,
            phoneNumberId: eventPhoneNumberId,
            displayPhoneNumber
        });
        if (inbound)
            inboundEvents.push(inbound);
    }
    return {
        phoneNumberId,
        displayPhoneNumber,
        events: inboundEvents
    };
}
export function selectKapsoAccountForEvent(accounts, event, fallback) {
    if (event.phoneNumberId) {
        const exact = accounts.find((account) => account.phoneNumberId === event.phoneNumberId);
        if (exact)
            return exact;
    }
    return fallback ?? accounts[0];
}
function normalizeKapsoInboundEvent(input) {
    const message = normalizeKapsoWebhookMessage(input.message, input.conversation, input.phoneNumberId);
    const from = normalizeWhatsAppTarget(readRecordString(message, "from")) ??
        normalizeWhatsAppTarget(readRecordString(input.conversation, "phone_number", "phoneNumber"));
    if (!from)
        return undefined;
    const type = readRecordString(message, "type") ?? "unknown";
    const transcript = type === "audio" ? extractKapsoTranscript(message) : undefined;
    const text = transcript?.text ?? extractMessageText(message, type);
    const media = extractMessageMedia(message, type);
    const messageId = readRecordString(message, "id") ?? `${from}:${Date.now()}`;
    const timestampMs = readTimestampMs(readRecordString(message, "timestamp"));
    return {
        eventName: input.eventName,
        messageId,
        type,
        from,
        text: text || fallbackTextForType(type, media),
        transcript: transcript?.text,
        transcriptSource: transcript?.source,
        timestampMs,
        phoneNumberId: input.phoneNumberId,
        displayPhoneNumber: input.displayPhoneNumber,
        conversationId: readRecordString(input.conversation, "id") ?? kapsoString(message, "whatsappConversationId"),
        contactName: kapsoString(message, "contactName", "contact_name") ??
            readRecordString(readRecord(input.conversation, "kapso"), "contactName", "contact_name"),
        media,
        raw: {
            event: input.event,
            message
        }
    };
}
function normalizeKapsoWebhookMessage(message, conversation, phoneNumberId) {
    const normalized = { ...message };
    const kapso = {
        ...(readRecord(message, "kapso") ?? {})
    };
    const conversationId = readRecordString(conversation, "id");
    if (conversationId && !kapso.whatsappConversationId)
        kapso.whatsappConversationId = conversationId;
    const contactName = readRecordString(readRecord(conversation, "kapso"), "contactName", "contact_name") ??
        readRecordString(conversation, "contactName", "contact_name");
    if (contactName && !kapso.contactName)
        kapso.contactName = contactName;
    const conversationPhone = readRecordString(conversation, "phone_number", "phoneNumber");
    if (phoneNumberId && !kapso.phoneNumberId)
        kapso.phoneNumberId = phoneNumberId;
    if (conversationPhone && !kapso.phoneNumber)
        kapso.phoneNumber = conversationPhone;
    if (!kapso.direction)
        kapso.direction = "inbound";
    if (kapso.media_url && !kapso.mediaUrl)
        kapso.mediaUrl = kapso.media_url;
    if (kapso.media_data && !kapso.mediaData)
        kapso.mediaData = kapso.media_data;
    normalized.kapso = kapso;
    const fallbackFrom = normalizeWhatsAppTarget(conversationPhone);
    if (!normalized.from && fallbackFrom)
        normalized.from = fallbackFrom;
    const reaction = readRecord(normalized, "reaction");
    if (reaction?.message_id && !reaction.messageId) {
        normalized.reaction = { ...reaction, messageId: reaction.message_id };
    }
    const interactive = readRecord(normalized, "interactive");
    if (interactive?.button_reply && !interactive.buttonReply) {
        normalized.interactive = { ...interactive, buttonReply: interactive.button_reply };
    }
    else if (interactive?.list_reply && !interactive.listReply) {
        normalized.interactive = { ...interactive, listReply: interactive.list_reply };
    }
    return normalized;
}
function extractKapsoWebhookEvents(payload, batchHeader) {
    const record = asRecord(payload);
    if (!record)
        return [];
    if (Array.isArray(record.data)) {
        return record.data.flatMap((item) => {
            const event = asRecord(item);
            return event ? [event] : [];
        });
    }
    if (batchHeader === "true")
        return [];
    return [record];
}
function extractMessageText(message, type) {
    const text = readRecordString(readRecord(message, "text"), "body");
    if (text)
        return text;
    const button = readRecordString(readRecord(message, "button"), "text", "payload");
    if (button)
        return button;
    const interactive = readRecord(message, "interactive");
    const buttonReply = readRecord(interactive, "buttonReply") ?? readRecord(interactive, "button_reply");
    const buttonTitle = readRecordString(buttonReply, "title", "id");
    if (buttonTitle)
        return buttonTitle;
    const listReply = readRecord(interactive, "listReply") ?? readRecord(interactive, "list_reply");
    const listTitle = readRecordString(listReply, "title", "id", "description");
    if (listTitle)
        return listTitle;
    const reaction = readRecord(message, "reaction");
    const emoji = readRecordString(reaction, "emoji");
    if (emoji)
        return `Reaction: ${emoji}`;
    const mediaCaption = readRecordString(readRecord(message, type), "caption");
    if (mediaCaption)
        return mediaCaption;
    const kapsoOrder = kapsoString(message, "orderText", "order_text");
    if (kapsoOrder)
        return kapsoOrder;
    return "";
}
function extractKapsoTranscript(message) {
    const kapso = readRecord(message, "kapso");
    if (!kapso)
        return undefined;
    const transcriptRecord = readRecord(kapso, "transcript") ?? readRecord(kapso, "transcription");
    const structuredTranscript = readRecordString(transcriptRecord, "text", "body", "content") ??
        readRecordString(kapso, "transcript", "transcription");
    if (structuredTranscript) {
        return {
            text: structuredTranscript,
            source: "kapso.transcript"
        };
    }
    const content = readKapsoContentString(kapso);
    const contentTranscript = content ? extractTranscriptFromContent(content) : undefined;
    if (!contentTranscript)
        return undefined;
    return {
        text: contentTranscript,
        source: "kapso.content"
    };
}
function readKapsoContentString(kapso) {
    const content = kapso.content;
    if (typeof content === "string" && content.trim())
        return content.trim();
    const contentRecord = asRecord(content);
    return readRecordString(contentRecord, "text", "body", "content");
}
function extractTranscriptFromContent(content) {
    const match = content.match(/\bTranscript:\s*([\s\S]*)$/i);
    const transcript = match?.[1]?.trim();
    return transcript || undefined;
}
function extractMessageMedia(message, type) {
    const directMedia = readRecord(message, type);
    const kapso = readRecord(message, "kapso");
    const mediaData = readRecord(kapso, "mediaData") ?? readRecord(kapso, "media_data");
    const url = readRecordString(kapso, "mediaUrl", "media_url") ??
        readRecordString(mediaData, "url", "downloadUrl", "download_url") ??
        readRecordString(directMedia, "link", "url");
    const id = readRecordString(mediaData, "id") ?? readRecordString(directMedia, "id");
    const contentType = readRecordString(mediaData, "mimeType", "mime_type") ??
        readRecordString(mediaData, "contentType", "content_type") ??
        readRecordString(directMedia, "mimeType", "mime_type") ??
        readRecordString(directMedia, "contentType", "content_type");
    const kind = normalizeMediaKind(type, contentType);
    if (!url && !id && kind === "unknown")
        return [];
    return [{ url, id, contentType, kind }];
}
function normalizeMediaKind(type, contentType) {
    if (type === "image" || contentType?.startsWith("image/"))
        return "image";
    if (type === "video" || contentType?.startsWith("video/"))
        return "video";
    if (type === "audio" || contentType?.startsWith("audio/"))
        return "audio";
    if (type === "document" || contentType === "application/pdf")
        return "document";
    return "unknown";
}
function fallbackTextForType(type, media) {
    if (media.length > 0)
        return `Received a ${media[0]?.kind ?? type} message.`;
    return `Received a ${type} message.`;
}
function isKapsoWebhookMessage(value) {
    return (typeof value.id === "string" &&
        typeof value.type === "string" &&
        typeof value.timestamp === "string");
}
function readTimestampMs(value) {
    if (!value)
        return undefined;
    const numeric = Number(value);
    if (!Number.isFinite(numeric))
        return undefined;
    return numeric > 9_999_999_999 ? numeric : numeric * 1000;
}
function asRecord(value) {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : undefined;
}
function readRecord(source, key) {
    return asRecord(source?.[key]);
}
function readRecordString(source, ...keys) {
    for (const key of keys) {
        const value = source?.[key];
        if (typeof value === "string" && value.trim())
            return value.trim();
    }
    return undefined;
}
function kapsoString(message, ...keys) {
    const kapso = readRecord(message, "kapso");
    return readRecordString(kapso, ...keys);
}
//# sourceMappingURL=webhook.js.map