# Kapso WhatsApp for OpenClaw

Official OpenClaw channel plugin for WhatsApp through Kapso. It receives Kapso platform webhooks, turns inbound WhatsApp messages and media into OpenClaw channel turns, and sends OpenClaw replies through Kapso's WhatsApp Cloud API proxy.

## Install

### Prerequisites

- An OpenClaw install with the gateway enabled.
- A Kapso account. Sign up at [kapso.ai](https://kapso.ai/), create or open a project, and create a project API key in the Kapso dashboard.
- A connected Kapso WhatsApp number. If you do not have one yet, run `kapso setup` or complete WhatsApp onboarding in the Kapso dashboard.
- A public HTTPS URL that can reach the OpenClaw gateway. Tailscale Funnel works well for local machines and VPS instances.
- Node.js/npm only if you are developing this plugin locally. ClawHub installs runtime dependencies for normal plugin installs.

Install and enable the plugin:

```bash
openclaw plugins install clawhub:@kapso/openclaw-whatsapp
openclaw config set 'plugins.allow' '["codex","kapso-whatsapp"]' --strict-json
openclaw config set 'channels["kapso-whatsapp"].enabled' true --strict-json
```

OpenClaw resolves the package from ClawHub and installs runtime dependencies declared in `package.json`, including `@kapso/whatsapp-cloud-api` and `@kapso/cli`. You do not need to run a separate `npm install` for this plugin.

The plugin uses the bundled Kapso CLI automatically. To authenticate or run Kapso CLI commands without installing a global `kapso` binary, use:

```bash
openclaw kapso-whatsapp cli login
openclaw kapso-whatsapp cli status
```

You can still install `@kapso/cli` globally if you want a standalone `kapso` command in your shell.

## Quickstart

Recommended setup after your OpenClaw gateway has a public URL:

```bash
openclaw kapso-whatsapp setup \
  --api-key "kapso_..." \
  --phone-number "+15551234567" \
  --webhook-url "https://your-machine.your-tailnet.ts.net/kapso/webhook" \
  --webhook-secret "$(openssl rand -hex 32)" \
  --register-webhook \
  --write-config
```

That command can:

- resolve the Kapso/Meta `phone_number_id` from a display phone number
- register a phone-number scoped Kapso webhook for `whatsapp.message.received`
- write the Kapso channel config into OpenClaw
- set the webhook secret used for signature verification

If you already know the Kapso/Meta `phone_number_id`, use `--phone-number-id` instead of `--phone-number`. If you omit `--write-config`, the command prints the `openclaw config set` commands without applying them.

Restart the gateway if it was already running while you changed channel config:

```bash
openclaw gateway restart
openclaw gateway status
```

## Agent-Driven Setup

The plugin ships an OpenClaw skill named `kapso-whatsapp-setup`. When the plugin is enabled, OpenClaw can use that skill to remember the Kapso CLI, plugin setup command, Tailscale Funnel shape, phone-number webhook requirements, default target config, and media debugging workflow.

You can check that OpenClaw sees it with:

```bash
openclaw skills list | grep kapso
openclaw skills info kapso-whatsapp-setup
```

Before asking the agent to finish setup, do the interactive and secret-bearing steps yourself:

```bash
openclaw kapso-whatsapp cli login
openclaw kapso-whatsapp cli status
openclaw config set 'channels["kapso-whatsapp"].apiKey' '"kapso_..."' --strict-json
```

For maximum visibility while the agent works, use the browser dashboard and keep the Activity tab open:

```bash
openclaw dashboard
```

If you prefer the terminal UI, start `openclaw tui` and send these slash commands before the setup prompt:

```text
/verbose full
/trace on
/tools verbose
```

After that, paste something like this into OpenClaw:

```text
Use the kapso-whatsapp-setup skill to finish my Kapso WhatsApp OpenClaw setup.

I already configured my Kapso API key on this server.
I already ran openclaw kapso-whatsapp cli login successfully.
Default outbound recipient: +15551234567
Public gateway: discover it if possible. I am using Tailscale Funnel on this machine.
Kapso WhatsApp sender number: discover it with the Kapso CLI. If there is more than one available number, ask me which one to use.

Please verify the Kapso CLI and @kapso/openclaw-whatsapp plugin are installed, but do not run interactive login. Discover the public webhook URL, resolve the phone_number_id, generate a webhook secret, register the Kapso phone-number webhook for whatsapp.message.received, write the OpenClaw channel config, set the default outbound recipient, run diagnostics, and tell me exactly what remains manual.
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

If the Kapso CLI is not logged in, the agent should stop and ask you to run `openclaw kapso-whatsapp cli login` in the terminal. If it cannot discover the public HTTPS URL from the gateway or tunnel service, it should ask you for that URL rather than guessing.

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
openclaw config set 'channels["kapso-whatsapp"].allowFrom' '["+15551234567","15551234567"]' --strict-json
```

Kapso webhook sender IDs often arrive as digits-only values such as `15551234567`, while users naturally type E.164 values such as `+15551234567`. Current plugin versions treat those two forms as the same sender for allowlist checks. Including both forms is harmless and helps when testing older installs or raw config edits.

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

The Kapso CLI is bundled with the plugin. To run it through OpenClaw, first authenticate and resolve the number:

```bash
openclaw kapso-whatsapp cli login
openclaw kapso-whatsapp cli status
openclaw kapso-whatsapp cli whatsapp numbers list --output json
openclaw kapso-whatsapp cli whatsapp numbers resolve "+15551234567" --output json
openclaw kapso-whatsapp cli whatsapp webhooks new \
  --phone-number-id "1234567890" \
  --url "https://your-openclaw-host.example.com/kapso/webhook" \
  --event whatsapp.message.received \
  --active \
  --output json
```

The setup command also uses the bundled CLI internally for finding `phone_number_id`, checking project access, and registering webhooks.

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

## Voice Notes

Inbound WhatsApp voice notes are passed through as audio media when Kapso includes a downloadable media URL. OpenClaw then transcribes the audio through `tools.media.audio` before the agent turn. The plugin should not call STT providers directly; it keeps the channel adapter provider-neutral.

For OpenAI transcription:

```bash
export OPENAI_API_KEY="sk-..."
openclaw config set 'tools.media.audio.enabled' true --strict-json
openclaw config set 'tools.media.audio.models' '[{"provider":"openai","model":"gpt-4o-mini-transcribe"}]' --strict-json
openclaw gateway restart
```

Other OpenAI model options include `whisper-1` and `gpt-4o-transcribe`.

For local, no-key transcription with `faster-whisper`, expose it as an OpenClaw CLI media model. The command must print only the transcript to stdout:

```bash
mkdir -p ~/.openclaw/bin ~/.openclaw/venvs
python3 -m venv ~/.openclaw/venvs/faster-whisper
~/.openclaw/venvs/faster-whisper/bin/python -m pip install -U pip setuptools wheel faster-whisper

cat > ~/.openclaw/bin/faster-whisper-transcribe <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
~/.openclaw/venvs/faster-whisper/bin/python - "$1" <<'PY'
import os
import sys
from faster_whisper import WhisperModel

audio_path = sys.argv[1]
model_name = os.environ.get("FASTER_WHISPER_MODEL", "base")
model = WhisperModel(model_name, device="auto", compute_type="auto")
segments, _ = model.transcribe(audio_path, vad_filter=True)
print(" ".join(segment.text.strip() for segment in segments).strip())
PY
EOF

chmod +x ~/.openclaw/bin/faster-whisper-transcribe

openclaw config set 'tools.media.audio.enabled' true --strict-json
openclaw config set 'tools.media.audio.models' '[{"type":"cli","command":"~/.openclaw/bin/faster-whisper-transcribe","args":["{{MediaPath}}"],"timeoutSeconds":90}]' --strict-json
openclaw gateway restart
```

For an ordered local-then-OpenAI fallback, configure both entries:

```bash
openclaw config set 'tools.media.audio.models' '[{"type":"cli","command":"~/.openclaw/bin/faster-whisper-transcribe","args":["{{MediaPath}}"],"timeoutSeconds":90},{"provider":"openai","model":"gpt-4o-mini-transcribe"}]' --strict-json
```

Verify voice-note processing while sending a WhatsApp voice note:

```bash
openclaw logs --follow --plain --limit 500 \
  | grep --line-buffered -Ei 'kapso|audio|voice|media|transcrib|whisper|openai'
```

Healthy channel logs include `type=audio` and `media=audio/url=yes`. If you only see `id but no URL`, confirm the Kapso webhook payload includes `kapso.mediaUrl`, `kapso.media_url`, `media_data.url`, `media_data.downloadUrl`, or direct media `link`/`url`.

Practical transcription options:

- Use OpenAI speech-to-text with an API key, for example `gpt-4o-mini-transcribe`, `gpt-4o-transcribe`, or `whisper-1`.
- Use a local CLI model through `tools.media.audio.models`, such as the `faster-whisper` wrapper above.
- Use a self-hosted ASR service and connect it to OpenClaw as a compatible transcription provider or CLI command.
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

### Webhook dispatches but no agent session or reply

If logs show `kapso-whatsapp: webhook dispatch account=...` but no OpenClaw session or outbound reply starts, check `allowFrom`. Kapso commonly sends inbound sender IDs without a leading `+`, for example `56975746426`, even if your allowlist was configured as `+56975746426`.

Current plugin versions compare those forms as the same sender. On older installs, or while editing raw config, include both variants and restart the gateway:

```bash
openclaw config set 'channels["kapso-whatsapp"].allowFrom' '["+56975746426","56975746426"]' --strict-json
```

Restart the running OpenClaw gateway process after changing channel config.

### Images sometimes work and sometimes do not

Check the logs for `media=image/url=yes`. If the log says `url=no` or warns that the event had an ID but no URL, the model did not receive the actual image bytes.

### Voice notes do not transcribe

First confirm the channel received downloadable audio:

```bash
openclaw logs --plain --limit 500 | grep -Ei 'kapso|audio|voice|media|transcrib|whisper|openai'
```

If the Kapso log says `type=audio media=audio/url=yes`, the channel delivered the audio to OpenClaw and the issue is in `tools.media.audio` configuration or the selected STT provider. If it says `url=no` or `id but no URL`, the agent received metadata but not downloadable audio.

For local `faster-whisper`, test the wrapper directly:

```bash
~/.openclaw/bin/faster-whisper-transcribe /path/to/audio.ogg
```

## References

- [Kapso docs](https://docs.kapso.ai)
- [OpenAI speech-to-text](https://platform.openai.com/docs/guides/speech-to-text)
- [OpenClaw audio and voice notes](https://docs.openclaw.ai/nodes/audio)
- [faster-whisper](https://github.com/SYSTRAN/faster-whisper)
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
