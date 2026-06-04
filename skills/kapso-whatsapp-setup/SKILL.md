---
name: kapso-whatsapp-setup
description: "Set up, repair, or verify the Kapso WhatsApp OpenClaw channel with the Kapso CLI, OpenClaw plugin CLI, Tailscale Funnel, phone-number webhooks, and media diagnostics."
metadata:
  {
    "openclaw":
      {
        "requires": { "bins": ["openclaw"] },
        "install":
          [
            {
              "id": "kapso-cli",
              "kind": "node",
              "package": "@kapso/cli",
              "bins": ["kapso"],
              "label": "Install Kapso CLI (npm)"
            }
          ]
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
command -v kapso && kapso status --output json
```

If the `kapso-whatsapp` command is missing, install and enable the plugin:

```bash
openclaw plugins install clawhub:@kapso/openclaw-whatsapp
openclaw config set 'plugins.allow' '["codex","kapso-whatsapp"]' --strict-json
openclaw config set 'channels["kapso-whatsapp"].enabled' true --strict-json
```

Preserve any existing `plugins.allow` entries instead of replacing unrelated trusted plugins.

2. Confirm the Kapso CLI is available if number resolution or CLI webhook registration is needed:

```bash
npm install -g @kapso/cli
kapso login
kapso status --output json
```

If the CLI is not logged in and the user did not provide `phoneNumberId`, ask them to run `kapso login` or provide the Kapso/Meta `phone_number_id`.

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
kapso whatsapp numbers list --output json
kapso whatsapp numbers resolve "+15551234567" --output json
```

Prefer an existing `channels["kapso-whatsapp"].phoneNumberId` or a user-provided `phoneNumberId` when available. Otherwise, use `kapso whatsapp numbers list --output json` to find available WhatsApp numbers. If there is exactly one active number, use it; if there are multiple, show the choices and ask the user which sender number to connect.

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

6. Verify after setup:

```bash
openclaw kapso-whatsapp doctor
openclaw channels status --channel kapso-whatsapp --probe
openclaw logs --plain --limit 500 | grep -Ei 'kapso|whatsapp|media|image|audio|document|webhook|signature'
```

7. Media expectations:

- Images, videos, and documents can work when Kapso includes a downloadable media URL and the selected OpenClaw model/runtime can process that media type.
- If logs show a media ID but no URL, the model received metadata but not the file bytes.
- Voice notes need an audio transcription provider. Without one, the agent may only see audio metadata.
- Hosted speech-to-text options include OpenAI `gpt-4o-transcribe`, `gpt-4o-mini-transcribe`, and `whisper-1`.
- Self-hosted ASR can work if the deployment exposes a compatible transcription provider; NVIDIA Parakeet TDT 0.6B v3 is a reasonable GPU-backed model to evaluate but is not bundled by this plugin.

8. Report only the remaining manual steps, such as Kapso login, API key creation, selecting the correct number, Meta/Kapso permission issues, or restarting the gateway.
