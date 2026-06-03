import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import type { ResolvedKapsoAccount } from "./config.js";
export declare function registerKapsoWebhookRoutes(api: OpenClawPluginApi): void;
export declare function handleKapsoWebhookRequest(params: {
    api: OpenClawPluginApi;
    req: IncomingMessage;
    res: ServerResponse;
    accounts: ResolvedKapsoAccount[];
}): Promise<void>;
//# sourceMappingURL=http.d.ts.map