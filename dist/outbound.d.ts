import type { SendMessageResponse } from "@kapso/whatsapp-cloud-api";
import type { OutboundDeliveryResult } from "openclaw/plugin-sdk/outbound-runtime";
import type { ChannelMessageSendMediaContext, ChannelMessageSendTextContext } from "openclaw/plugin-sdk/channel-message";
import type { ChannelOutboundAdapter } from "openclaw/plugin-sdk/channel-runtime";
import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import type { KapsoClientFactory } from "./kapso-client.js";
export type KapsoSendOptions = {
    clientFactory?: KapsoClientFactory;
    signal?: AbortSignal;
};
export type KapsoSendResult = {
    messageId: string;
    response: SendMessageResponse;
    to: string;
};
export declare function sendKapsoText(params: {
    cfg: OpenClawConfig;
    accountId?: string | null;
    to: string;
    text: string;
    replyToId?: string | null;
} & KapsoSendOptions): Promise<KapsoSendResult>;
export declare function sendKapsoMedia(params: {
    cfg: OpenClawConfig;
    accountId?: string | null;
    to: string;
    mediaUrl: string;
    text?: string;
    replyToId?: string | null;
    forceDocument?: boolean;
    audioAsVoice?: boolean;
} & KapsoSendOptions): Promise<KapsoSendResult>;
export declare const kapsoMessageAdapter: {
    readonly id: "kapso-whatsapp";
    readonly durableFinal: {
        readonly capabilities: {
            readonly text: true;
            readonly media: true;
            readonly replyTo: true;
            readonly messageSendingHooks: true;
            readonly afterSendSuccess: true;
            readonly afterCommit: true;
        };
    };
    readonly send: {
        readonly text: (ctx: ChannelMessageSendTextContext) => Promise<{
            messageId: string;
            receipt: import("openclaw/plugin-sdk/channel-outbound").MessageReceipt;
        }>;
        readonly media: (ctx: ChannelMessageSendMediaContext) => Promise<{
            messageId: string;
            receipt: import("openclaw/plugin-sdk/channel-outbound").MessageReceipt;
        }>;
    };
    readonly receive: {
        readonly defaultAckPolicy: "after_agent_dispatch";
        readonly supportedAckPolicies: readonly ["after_receive_record", "after_agent_dispatch", "after_durable_send", "manual"];
    };
} & {
    receive: {
        readonly defaultAckPolicy: "after_agent_dispatch";
        readonly supportedAckPolicies: readonly ["after_receive_record", "after_agent_dispatch", "after_durable_send", "manual"];
    };
};
export declare const kapsoOutboundAdapter: ChannelOutboundAdapter;
export declare function toOutboundDeliveryResult(sent: Pick<KapsoSendResult, "messageId" | "to">): OutboundDeliveryResult;
//# sourceMappingURL=outbound.d.ts.map