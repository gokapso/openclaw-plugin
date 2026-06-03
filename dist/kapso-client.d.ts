import type { SendMessageResponse, WhatsAppClient } from "@kapso/whatsapp-cloud-api";
import type { ResolvedKapsoAccount } from "./config.js";
export type KapsoClient = Pick<WhatsAppClient, "messages">;
export type KapsoClientFactory = (account: ResolvedKapsoAccount, signal?: AbortSignal) => Promise<KapsoClient>;
export declare function createKapsoClient(account: ResolvedKapsoAccount): Promise<KapsoClient>;
export declare function firstKapsoMessageId(response: SendMessageResponse): string | undefined;
//# sourceMappingURL=kapso-client.d.ts.map