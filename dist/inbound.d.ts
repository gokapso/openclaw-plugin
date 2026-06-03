import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import type { ResolvedKapsoAccount } from "./config.js";
import type { KapsoInboundEvent } from "./webhook.js";
export declare function dispatchKapsoInboundEvent(params: {
    api: OpenClawPluginApi;
    account: ResolvedKapsoAccount;
    event: KapsoInboundEvent;
}): Promise<void>;
//# sourceMappingURL=inbound.d.ts.map