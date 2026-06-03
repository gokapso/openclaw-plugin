export async function createKapsoClient(account) {
    if (!account.apiKey) {
        throw new Error("Kapso API key is required for outbound WhatsApp messages.");
    }
    const { WhatsAppClient } = await import("@kapso/whatsapp-cloud-api");
    return new WhatsAppClient({
        baseUrl: account.baseUrl,
        kapsoApiKey: account.apiKey
    });
}
export function firstKapsoMessageId(response) {
    return response.messages[0]?.id;
}
//# sourceMappingURL=kapso-client.js.map