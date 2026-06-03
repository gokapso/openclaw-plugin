import { defineChannelPluginEntry } from "openclaw/plugin-sdk/channel-core";
import { CHANNEL_ID, CHANNEL_LABEL } from "./constants.js";
import { kapsoWhatsappPlugin } from "./channel.js";
import { registerKapsoWebhookRoutes } from "./http.js";
const entry = defineChannelPluginEntry({
    id: CHANNEL_ID,
    name: CHANNEL_LABEL,
    description: "Official Kapso WhatsApp channel plugin for OpenClaw.",
    plugin: kapsoWhatsappPlugin,
    registerCliMetadata(api) {
        api.registerCli(({ program }) => {
            program
                .command("kapso-whatsapp")
                .description("Kapso WhatsApp channel management");
        }, {
            descriptors: [{
                    name: "kapso-whatsapp",
                    description: "Kapso WhatsApp channel management",
                    hasSubcommands: false
                }]
        });
    },
    registerFull(api) {
        registerKapsoWebhookRoutes(api);
    }
});
export default entry;
//# sourceMappingURL=index.js.map