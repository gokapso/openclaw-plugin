import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { CHANNEL_ID } from "./constants.js";
import { listKapsoAccountIds, resolveKapsoAccount } from "./config.js";
import type { ResolvedKapsoAccount } from "./config.js";
import { dispatchKapsoInboundEvent } from "./inbound.js";
import {
  findVerifiedWebhookAccount,
  normalizeKapsoWebhook,
  readHeader,
  readRawRequestBody,
  selectKapsoAccountForEvent
} from "./webhook.js";

export function registerKapsoWebhookRoutes(api: OpenClawPluginApi): void {
  const accounts = listKapsoAccountIds(api.config)
    .map((accountId) => resolveKapsoAccount(api.config, accountId))
    .filter((account) => account.enabled);
  const byPath = groupAccountsByWebhookPath(accounts);

  for (const [path, pathAccounts] of byPath) {
    api.registerHttpRoute({
      path,
      auth: "plugin",
      match: "exact",
      replaceExisting: true,
      handler: async (req, res) => {
        await handleKapsoWebhookRequest({
          api,
          req,
          res,
          accounts: pathAccounts
        });
        return true;
      }
    });
    api.logger.info(`${CHANNEL_ID}: registered Kapso webhook route ${path}`);
  }
}

export async function handleKapsoWebhookRequest(params: {
  api: OpenClawPluginApi;
  req: IncomingMessage;
  res: ServerResponse;
  accounts: ResolvedKapsoAccount[];
}): Promise<void> {
  const { api, req, res, accounts } = params;

  if (req.method !== "POST") {
    writeJson(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  let rawBody: Buffer;
  try {
    rawBody = await readRawRequestBody(req);
  } catch (err) {
    writeJson(res, 413, { ok: false, error: String(err) });
    return;
  }

  const signatureHeader = readHeader(req.headers, "x-webhook-signature");
  const verifiedAccount = findVerifiedWebhookAccount({
    accounts,
    rawBody,
    signatureHeader
  });

  if (!verifiedAccount) {
    writeJson(res, 401, { ok: false, error: "invalid_signature" });
    return;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    writeJson(res, 400, { ok: false, error: "invalid_json" });
    return;
  }

  const normalized = normalizeKapsoWebhook(payload, {
    defaultPhoneNumberId: verifiedAccount.phoneNumberId,
    eventName: readHeader(req.headers, "x-webhook-event"),
    batchHeader: readHeader(req.headers, "x-webhook-batch")
  });

  let dispatched = 0;
  for (const event of normalized.events) {
    const account = selectKapsoAccountForEvent(accounts, event, verifiedAccount);
    if (!account) continue;
    await dispatchKapsoInboundEvent({ api, account, event });
    dispatched += 1;
  }

  writeJson(res, 200, {
    ok: true,
    dispatched
  });
}

function groupAccountsByWebhookPath(accounts: ResolvedKapsoAccount[]): Map<string, ResolvedKapsoAccount[]> {
  const grouped = new Map<string, ResolvedKapsoAccount[]>();
  for (const account of accounts) {
    const existing = grouped.get(account.webhookPath) ?? [];
    existing.push(account);
    grouped.set(account.webhookPath, existing);
  }
  return grouped;
}

function writeJson(res: ServerResponse, statusCode: number, body: Record<string, unknown>): void {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}
