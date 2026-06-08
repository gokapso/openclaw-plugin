import { Buffer } from "node:buffer";
import type { IncomingMessage } from "node:http";
import type { ResolvedKapsoAccount } from "./config.js";
export declare const KAPSO_MESSAGE_RECEIVED_EVENT = "whatsapp.message.received";
export type KapsoInboundMedia = {
    url?: string;
    id?: string;
    contentType?: string;
    kind: "image" | "video" | "audio" | "document" | "unknown";
};
export type KapsoInboundEvent = {
    eventName: string;
    messageId: string;
    type: string;
    from: string;
    text: string;
    transcript?: string;
    transcriptSource?: "kapso.transcript" | "kapso.content";
    timestampMs?: number;
    phoneNumberId?: string;
    displayPhoneNumber?: string;
    conversationId?: string;
    contactName?: string;
    media: KapsoInboundMedia[];
    raw: Record<string, unknown>;
};
export type NormalizedKapsoWebhook = {
    phoneNumberId?: string;
    displayPhoneNumber?: string;
    events: KapsoInboundEvent[];
};
export declare function isKapsoWebhookHeaders(headers: IncomingMessage["headers"]): boolean;
export declare function readRawRequestBody(req: IncomingMessage, limitBytes?: number): Promise<Buffer>;
export declare function readHeader(headers: IncomingMessage["headers"], name: string): string | undefined;
export declare function verifyKapsoWebhookSignature(input: {
    rawBody: Buffer | string;
    signatureHeader: string | undefined;
    webhookSecret: string;
}): boolean;
export declare function findVerifiedWebhookAccount(input: {
    accounts: ResolvedKapsoAccount[];
    rawBody: Buffer | string;
    signatureHeader: string | undefined;
}): ResolvedKapsoAccount | undefined;
export declare function normalizeKapsoWebhook(payload: unknown, options?: {
    defaultPhoneNumberId?: string;
    eventName?: string;
    batchHeader?: string;
}): NormalizedKapsoWebhook;
export declare function selectKapsoAccountForEvent(accounts: ResolvedKapsoAccount[], event: Pick<KapsoInboundEvent, "phoneNumberId">, fallback?: ResolvedKapsoAccount): ResolvedKapsoAccount | undefined;
//# sourceMappingURL=webhook.d.ts.map