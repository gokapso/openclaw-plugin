# Kapso WhatsApp for OpenClaw

Official OpenClaw channel plugin for sending and receiving WhatsApp messages through Kapso.

## Quickstart

```bash
openclaw plugins install clawhub:@kapso/openclaw-whatsapp
openclaw config set 'plugins.allow' '["codex","kapso-whatsapp"]' --strict-json
openclaw config set 'channels["kapso-whatsapp"].enabled' true --strict-json
```

OpenClaw resolves the package from ClawHub and installs runtime dependencies declared in `package.json`, including `@kapso/whatsapp-cloud-api`. You do not need to run a separate `npm install` for this plugin.

The Kapso CLI is optional but recommended for setup:

```bash
npm install -g @kapso/cli
kapso login
kapso status
```

After your OpenClaw gateway has a public URL, let the plugin resolve the number, register the webhook, and write OpenClaw config:

```bash
openclaw kapso-whatsapp setup \
  --api-key "kapso_..." \
  --phone-number "+15551234567" \
  --webhook-url "https://your-machine.your-tailnet.ts.net/kapso/webhook" \
  --webhook-secret "$(openssl rand -hex 32)" \
  --register-webhook \
  --write-config
```

If you already know the Kapso/Meta `phone_number_id`, use `--phone-number-id` instead of `--phone-number`. If you omit `--write-config`, the command prints the `openclaw config set` commands without applying them.

## Agent-Driven Setup

The plugin ships an OpenClaw skill named `kapso-whatsapp-setup`. When the plugin is enabled, OpenClaw can use that skill to remember the Kapso CLI, plugin setup command, Tailscale Funnel shape, phone-number webhook requirements, default target config, and media debugging workflow.

You can check that OpenClaw sees it with:

```bash
openclaw skills list | grep kapso
openclaw skills info kapso-whatsapp-setup
```

After you create the Kapso API key and configure it on the server yourself, paste something like this into OpenClaw:

```text
Use the kapso-whatsapp-setup skill to finish my Kapso WhatsApp OpenClaw setup.

I already configured my Kapso API key on this server.
Default outbound recipient: +15551234567
Public gateway: discover it if possible. I am using Tailscale Funnel on this machine.
Kapso WhatsApp sender number: discover it with the Kapso CLI. If there is more than one available number, ask me which one to use.

Please verify the Kapso CLI and @kapso/openclaw-whatsapp plugin are installed, discover the public webhook URL, resolve the phone_number_id, generate a webhook secret, register the Kapso phone-number webhook for whatsapp.message.received, write the OpenClaw channel config, set the default outbound recipient, run diagnostics, and tell me exactly what remains manual.
```

If you already know the public webhook URL, replace the gateway line with:

```text
Public gateway webhook URL: https://your-openclaw-host.example.com/kapso/webhook
```

If you are using a different public tunnel or reverse proxy, name it instead:

```text
Public gateway: discover it if possible. I am using ngrok on this machine.
```

If you already know the Kapso/Meta number ID, replace the sender-number line with:

```text
Kapso/Meta phone_number_id: 1234567890
```

If the Kapso CLI is not logged in, the agent may ask you to run `kapso login` once in the terminal. If it cannot discover the public HTTPS URL from the gateway or tunnel service, it should ask you for that URL rather than guessing.

## Configure

You can configure the channel manually with OpenClaw config:

```bash
openclaw config set 'channels["kapso-whatsapp"].apiKey' '"kapso_..."' --strict-json
openclaw config set 'channels["kapso-whatsapp"].phoneNumberId' '"1234567890"' --strict-json
openclaw config set 'channels["kapso-whatsapp"].webhookSecret' '"shared webhook secret"' --strict-json
```

Use JSON strings for IDs and secrets, especially digit-only values. Newer plugin versions coerce numeric `phoneNumberId` and `defaultTo` values, but JSON strings avoid precision loss for large IDs.

Optional channel settings:

```bash
openclaw config set 'channels["kapso-whatsapp"].baseUrl' '"https://api.kapso.ai/meta/whatsapp"' --strict-json
openclaw config set 'channels["kapso-whatsapp"].webhookPath' '"/kapso/webhook"' --strict-json
openclaw config set 'channels["kapso-whatsapp"].defaultTo' '"+15551234567"' --strict-json
openclaw config set 'channels["kapso-whatsapp"].dmSecurity' '"allowlist"' --strict-json
openclaw config set 'channels["kapso-whatsapp"].allowFrom' '["+15551234567"]' --strict-json
```

You can also use environment variables:

```bash
export KAPSO_API_KEY="kapso_..."
export KAPSO_PHONE_NUMBER_ID="1234567890"
export KAPSO_WEBHOOK_SECRET="shared webhook secret"
export KAPSO_BASE_URL="https://api.kapso.ai/meta/whatsapp"
export KAPSO_WEBHOOK_PATH="/kapso/webhook"
export KAPSO_BOT_USERNAME="support"
export KAPSO_DEFAULT_TO="+15551234567"
```

## Default Recipient

Set `defaultTo` when you want OpenClaw to have a default outbound WhatsApp target for this channel:

```bash
openclaw config set 'channels["kapso-whatsapp"].defaultTo' '"+15551234567"' --strict-json
```

For explicit sends, use one of the channel target prefixes below.

## Gateway With Tailscale Funnel

Kapso Cloud must reach your OpenClaw webhook over the public internet. A normal Tailscale tailnet URL is private to your tailnet; use Tailscale Funnel when the gateway is running on your own machine or VPS.

Run OpenClaw with password auth and Funnel:

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

Prefer `--password-file` over passing `--password` directly, because process arguments can appear in logs or process listings.

The Kapso webhook URL should use your Funnel hostname plus the channel webhook path:

```text
https://your-machine.your-tailnet.ts.net/kapso/webhook
```

To discover an existing Funnel URL from the machine running OpenClaw, use:

```bash
tailscale funnel status --json
```

## Kapso Webhook

Create a phone-number scoped Kapso webhook, not a project webhook, for inbound WhatsApp messages.

Use:

```text
Method: POST
URL: https://your-openclaw-host.example.com/kapso/webhook
Events: whatsapp.message.received
Secret: same value as channels["kapso-whatsapp"].webhookSecret or KAPSO_WEBHOOK_SECRET
Payload version: v2 recommended
```

If you use the Kapso CLI, first authenticate and resolve the number:

```bash
kapso login
kapso status
kapso whatsapp numbers list --output json
kapso whatsapp numbers resolve "+15551234567" --output json
kapso whatsapp webhooks new \
  --phone-number-id "1234567890" \
  --url "https://your-openclaw-host.example.com/kapso/webhook" \
  --event whatsapp.message.received \
  --active \
  --output json
```

The plugin does not require the Kapso CLI, but the CLI is helpful for finding `phone_number_id`, checking project access, and confirming recent messages.

## Diagnostics

Check the plugin configuration:

```bash
openclaw kapso-whatsapp setup --help
openclaw kapso-whatsapp doctor
openclaw kapso-whatsapp doctor --json
openclaw channels status --channel kapso-whatsapp --probe
```

Tail OpenClaw gateway logs:

```bash
openclaw logs --follow --plain --limit 500
openclaw channels logs --lines 500 | grep -Ei 'kapso|whatsapp|media|image|audio|document|webhook|signature'
```

If the gateway prints a log file path, you can tail that file directly:

```bash
tail -f /tmp/openclaw/openclaw-YYYY-MM-DD.log
```

For inbound media, debug logs show whether the webhook included a media URL, a media ID, content type, and whether the event was dispatched.

## Media Support

Images, videos, and documents can be forwarded to OpenClaw when Kapso includes a downloadable media URL such as `mediaUrl`, `media_data.url`, `media_data.downloadUrl`, or a direct media `link`/`url`. Models can only inspect those files if the selected model/runtime supports that media type.

If Kapso sends only a media ID and no URL, the plugin records that media exists but cannot give the model the actual file. The logs will warn about `id but no URL`.

Voice notes and audio messages are different from images. The plugin can pass audio media URLs through when present, but normal text/chat models do not automatically transcribe voice notes unless your OpenClaw setup has an audio transcription path. Practical options include:

- Use OpenAI speech-to-text with an API key, for example `gpt-4o-mini-transcribe`, `gpt-4o-transcribe`, or `whisper-1`.
- Use a self-hosted ASR service and connect it to OpenClaw if your deployment supports a compatible transcription provider.
- For GPU-backed self-hosting, NVIDIA Parakeet TDT 0.6B v3 is a good candidate to evaluate for multilingual offline transcription, but it is not bundled or auto-configured by this plugin.

Until a transcription provider is configured, an inbound voice note may only appear to the agent as an audio message rather than usable text.

## Channel Targets

The plugin accepts WhatsApp phone-number targets with these prefixes:

```text
kapso:+15551234567
kapso-whatsapp:+15551234567
whatsapp:+15551234567
wa:+15551234567
```

Plain E.164 or digits-only numbers are also accepted.

## Troubleshooting

### Config values rejected as "must be string"

Use strict JSON strings:

```bash
openclaw config set 'channels["kapso-whatsapp"].phoneNumberId' '"1234567890"' --strict-json
openclaw config set 'channels["kapso-whatsapp"].defaultTo' '"+15551234567"' --strict-json
```

### Webhook returns 401

The Kapso webhook secret and `channels["kapso-whatsapp"].webhookSecret` do not match, or the request is missing the Kapso signature header.

### Webhook is reachable but no messages arrive

Confirm the webhook is phone-number scoped and subscribed to `whatsapp.message.received`. Project webhooks do not receive WhatsApp message events.

### Images sometimes work and sometimes do not

Check the logs for `media=image/url=yes`. If the log says `url=no` or warns that the event had an ID but no URL, the model did not receive the actual image bytes.

## References

- [Kapso docs](https://docs.kapso.ai)
- [OpenAI speech-to-text](https://platform.openai.com/docs/guides/speech-to-text)
- [NVIDIA Parakeet TDT 0.6B v3](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3)
- [NVIDIA Speech NIM ASR overview](https://docs.nvidia.com/nim/speech/latest/asr/index.html)

## Publishing

Before publishing to ClawHub:

```bash
npm run build
npm test
npm run plugin:validate
npx -y clawhub@latest package publish . --family code-plugin --owner kapso --dry-run
```

ClawHub requires the package scope to match the selected owner.

This package does not need to be published to npm unless you explicitly want npm fallback installs. ClawHub is the primary distribution path for OpenClaw plugins.
