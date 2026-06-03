import type { SendMessageResponse, WhatsAppClient } from "@kapso/whatsapp-cloud-api";
import type { ResolvedKapsoAccount } from "./config.js";

export type KapsoClient = Pick<WhatsAppClient, "messages">;

export type KapsoClientFactory = (account: ResolvedKapsoAccount, signal?: AbortSignal) => Promise<KapsoClient>;

export async function createKapsoClient(account: ResolvedKapsoAccount): Promise<KapsoClient> {
  if (!account.apiKey) {
    throw new Error("Kapso API key is required for outbound WhatsApp messages.");
  }

  const { WhatsAppClient } = await import("@kapso/whatsapp-cloud-api");
  return new WhatsAppClient({
    baseUrl: account.baseUrl,
    kapsoApiKey: account.apiKey
  });
}

export function firstKapsoMessageId(response: SendMessageResponse): string | undefined {
  return response.messages[0]?.id;
}
