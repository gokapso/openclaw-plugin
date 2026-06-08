---
name: kapso-whatsapp-setup
description: "Set up, repair, or verify the Kapso WhatsApp OpenClaw channel with the Kapso CLI, OpenClaw plugin CLI, Tailscale Funnel, phone-number webhooks, and media diagnostics."
metadata:
  {
    "openclaw":
      {
        "requires": { "bins": ["openclaw"] }
      }
  }
---

# Kapso WhatsApp OpenClaw Setup

Use this skill when the user wants to connect Kapso WhatsApp to OpenClaw, run the `@kapso/openclaw-whatsapp` setup flow, register or repair webhooks, configure Tailscale Funnel, set a default WhatsApp target, or debug inbound media.

## Workflow

1. Inspect the current state before changing config:

```bash
openclaw kapso-whatsapp doctor
openclaw config get 'channels["kapso-whatsapp"]'
openclaw kapso-whatsapp cli status --output json
```

If the `kapso-whatsapp` command is missing, install and enable the plugin:

```bash
openclaw plugins install clawhub:@kapso/openclaw-whatsapp
openclaw config set 'plugins.allow' '["codex","kapso-whatsapp"]' --strict-json
openclaw config set 'channels["kapso-whatsapp"].enabled' true --strict-json
```

Preserve any existing `plugins.allow` entries instead of replacing unrelated trusted plugins.

2. Confirm the Kapso CLI is authenticated if number resolution or CLI webhook registration is needed. The plugin bundles `@kapso/cli`; use the OpenClaw wrapper instead of asking the user to install a global CLI:

```bash
openclaw kapso-whatsapp cli status --output json
```

Do not run `openclaw kapso-whatsapp cli login` during an agent-driven setup turn. It is interactive and can look like a hidden hang. If the CLI is not logged in and the user did not provide `phoneNumberId`, stop and ask them to run `openclaw kapso-whatsapp cli login` in their terminal, then retry.

3. Determine the public OpenClaw webhook URL. Prefer discovery before asking the user:

- If the user pasted a full public webhook URL, use it.
- If the user named a tunnel or gateway service, inspect that service when a CLI is available.
- For Tailscale Funnel, check the active Funnel config:

```bash
command -v tailscale && tailscale funnel status --json
```

Use the public Funnel hostname or URL for the OpenClaw gateway and append `/kapso/webhook` unless the channel has a custom `webhookPath`. Tailscale Serve is private to the tailnet; Kapso Cloud needs Funnel or another public HTTPS URL.

For Tailscale Funnel, run the gateway with password auth when it is not already running:

```bash
mkdir -p ~/.openclaw
openssl rand -base64 32 > ~/.openclaw/gateway-password
chmod 600 ~/.openclaw/gateway-password

openclaw gateway run \
  --bind loopback \
  --auth password \
  --password-file ~/.openclaw/gateway-password \
  --tailscale funnel \
  --force
```

The webhook URL normally ends in `/kapso/webhook`, for example:

```text
https://your-machine.your-tailnet.ts.net/kapso/webhook
```

If the URL cannot be discovered with confidence, ask the user to paste the final public HTTPS webhook URL.

4. Resolve the Kapso WhatsApp sender number and phone number ID. Do not assume the default outbound recipient is the Kapso sender number.

```bash
openclaw kapso-whatsapp cli whatsapp numbers list --output json
openclaw kapso-whatsapp cli whatsapp numbers resolve "+15551234567" --output json
```

Prefer an existing `channels["kapso-whatsapp"].phoneNumberId` or a user-provided `phoneNumberId` when available. Otherwise, use `openclaw kapso-whatsapp cli whatsapp numbers list --output json` to find available WhatsApp numbers. If there is exactly one active number, use it; if there are multiple, show the choices and ask the user which sender number to connect.

5. Run the plugin setup command. If the user says their Kapso API key is already configured on the server, do not ask them to paste it into chat and do not print it back.

Use `--phone-number-id` when known:

```bash
openclaw kapso-whatsapp setup \
  --phone-number-id "1234567890" \
  --webhook-url "https://your-machine.your-tailnet.ts.net/kapso/webhook" \
  --webhook-secret "$(openssl rand -hex 32)" \
  --register-webhook \
  --write-config
```

Use `--phone-number` when the Kapso CLI should resolve it:

```bash
openclaw kapso-whatsapp setup \
  --phone-number "+15551234567" \
  --webhook-url "https://your-machine.your-tailnet.ts.net/kapso/webhook" \
  --webhook-secret "$(openssl rand -hex 32)" \
  --register-webhook \
  --write-config
```

Add `--default-to "+15551234567"` when the user wants a default outbound WhatsApp recipient. Add `--dry-run` first when you are unsure.

When configuring inbound allowlists, remember that Kapso webhook sender IDs often arrive digits-only, for example `56975746426`, while users may type `+56975746426`. Current plugin versions treat those forms as equivalent; when repairing older installs or raw config, include both variants in `channels["kapso-whatsapp"].allowFrom`.

6. Verify after setup:

```bash
openclaw kapso-whatsapp doctor
openclaw channels status --channel kapso-whatsapp --probe
openclaw logs --plain --limit 500 | grep -Ei 'kapso|whatsapp|media|image|audio|document|webhook|signature'
```

7. Media expectations:

- Images, videos, and documents can work when Kapso includes a downloadable media URL and the selected OpenClaw model/runtime can process that media type.
- If logs show a media ID but no URL, the model received metadata but not the file bytes.
- Voice notes normally use Kapso's webhook transcript (`message.kapso.transcript.text`) as the OpenClaw message text, so no OpenAI/Whisper/STT setup is required for that path.
- When Kapso includes a transcript, the plugin does not forward the audio file to OpenClaw for transcription.
- If Kapso sends audio without a transcript, fallback audio transcription can work through OpenClaw `tools.media.audio`.
- Fallback options include OpenAI `gpt-4o-transcribe`, `gpt-4o-mini-transcribe`, `whisper-1`, or a local CLI media model such as `faster-whisper`.

8. Report only the remaining manual steps, such as Kapso login, API key creation, selecting the correct number, Meta/Kapso permission issues, or restarting the gateway.
