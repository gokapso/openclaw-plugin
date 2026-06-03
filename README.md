# Kapso WhatsApp for OpenClaw

Official OpenClaw channel plugin for sending and receiving WhatsApp messages through Kapso.

## Install

```bash
openclaw plugins install clawhub:@kapso/openclaw-whatsapp
```

OpenClaw resolves the package from ClawHub and installs runtime dependencies declared in `package.json`, including `@kapso/whatsapp-cloud-api`. You do not need to run a separate `npm install` for this plugin.

## Configuration

Set the Kapso-first environment variables used by the plugin:

```bash
export KAPSO_API_KEY="kapso_..."
export KAPSO_PHONE_NUMBER_ID="1234567890"
export KAPSO_WEBHOOK_SECRET="shared webhook secret"
```

Optional:

```bash
export KAPSO_BASE_URL="https://api.kapso.ai/meta/whatsapp"
export KAPSO_WEBHOOK_PATH="/kapso/webhook"
export KAPSO_BOT_USERNAME="support"
```

Configure the Kapso webhook endpoint to the OpenClaw gateway route:

```text
POST https://your-openclaw-host.example.com/kapso/webhook
```

Enable the `whatsapp.message.received` event and use the same secret as `KAPSO_WEBHOOK_SECRET`.

## Channel Targets

The plugin accepts WhatsApp phone-number targets with these prefixes:

```text
kapso:+15551234567
kapso-whatsapp:+15551234567
whatsapp:+15551234567
wa:+15551234567
```

Plain E.164 or digits-only numbers are also accepted.

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
