import { createRequire } from "node:module";
import { run as runKapsoCli } from "@kapso/cli";
import { defineChannelPluginEntry } from "openclaw/plugin-sdk/channel-core";
import { updateConfig } from "openclaw/plugin-sdk/config-mutation";
import { CHANNEL_ID, CHANNEL_LABEL } from "./constants.js";
import { kapsoWhatsappPlugin } from "./channel.js";
import { inspectKapsoAccount, listKapsoAccountIds, resolveDefaultKapsoAccountId, resolveKapsoAccount } from "./config.js";
import { registerKapsoWebhookRoutes } from "./http.js";
const nodeRequire = createRequire(import.meta.url);
const KAPSO_CLI_PACKAGE_PATH = "@kapso/cli/package.json";
const entry = defineChannelPluginEntry({
    id: CHANNEL_ID,
    name: CHANNEL_LABEL,
    description: "Official Kapso WhatsApp channel plugin for OpenClaw.",
    plugin: kapsoWhatsappPlugin,
    registerCliMetadata(api) {
        api.registerCli(({ program, config }) => {
            const command = program
                .command("kapso-whatsapp")
                .description("Kapso WhatsApp channel management");
            command
                .command("cli")
                .description("Run the bundled Kapso CLI")
                .argument("[args...]", "Arguments forwarded to Kapso CLI")
                .allowUnknownOption(true)
                .allowExcessArguments(true)
                .action(async (args = []) => {
                const result = await runKapsoCommand(args, { stdio: "inherit" });
                if (result.error) {
                    console.error(`Failed to run Kapso CLI: ${result.error.message}`);
                    process.exitCode = result.status || 1;
                    return;
                }
                process.exitCode = result.status;
            });
            command
                .command("doctor")
                .description("Check Kapso WhatsApp plugin configuration")
                .option("--json", "Print machine-readable diagnostics", false)
                .action(async (opts) => {
                const report = await buildDoctorReport(config);
                if (opts.json) {
                    console.log(JSON.stringify(report, null, 2));
                    return;
                }
                printDoctorReport(report);
            });
            command
                .command("setup")
                .description("Prepare OpenClaw config with Kapso CLI/API assistance")
                .option("--account <id>", "OpenClaw Kapso account id")
                .option("--api-key <key>", "Kapso project API key")
                .option("--phone-number <e164>", "WhatsApp display number to resolve with Kapso CLI")
                .option("--phone-number-id <id>", "Kapso/Meta phone_number_id")
                .option("--webhook-url <url>", "Public OpenClaw webhook URL")
                .option("--webhook-secret <secret>", "Shared webhook secret")
                .option("--default-to <target>", "Default outbound WhatsApp recipient")
                .option("--allow-from <csv>", "Comma-separated inbound allowlist")
                .option("--dm-security <policy>", "DM policy: allowlist|open|disabled")
                .option("--register-webhook", "Create the Kapso phone-number webhook", false)
                .option("--write-config", "Write OpenClaw config with openclaw config set", false)
                .option("--dry-run", "Print actions without writing config or registering webhooks", false)
                .option("--json", "Print machine-readable setup output", false)
                .action(async (opts) => {
                const report = await buildSetupReport(config, opts);
                if (opts.json) {
                    console.log(JSON.stringify(report, null, 2));
                    return;
                }
                printSetupReport(report);
            });
        }, {
            descriptors: [{
                    name: "kapso-whatsapp",
                    description: "Kapso WhatsApp channel management",
                    hasSubcommands: true
                }]
        });
    },
    registerFull(api) {
        registerKapsoWebhookRoutes(api);
    }
});
export default entry;
async function buildDoctorReport(config) {
    const accounts = listKapsoAccountIds(config).map((accountId) => {
        const account = resolveKapsoAccount(config, accountId);
        const details = inspectKapsoAccount(config, accountId);
        return {
            accountId,
            enabled: account.enabled,
            configured: account.configured,
            webhookPath: account.webhookPath,
            phoneNumberId: account.phoneNumberId,
            apiKeyStatus: String(details.apiKeyStatus),
            webhookSecretStatus: String(details.webhookSecretStatus),
            dmSecurity: account.dmSecurity,
            allowFromCount: account.allowFrom.length
        };
    });
    return {
        channelId: CHANNEL_ID,
        accounts,
        kapsoCli: await probeKapsoCli(),
        nextSteps: buildNextSteps(accounts)
    };
}
async function buildSetupReport(config, opts) {
    const warnings = [];
    const accountId = opts.account ?? resolveDefaultKapsoAccountId(config);
    const account = resolveKapsoAccount(config, accountId);
    const kapsoCli = await buildKapsoCliStatus();
    let phoneNumberId = readCliString(opts.phoneNumberId) ?? account.phoneNumberId;
    if (!phoneNumberId && opts.phoneNumber) {
        const resolved = await resolveKapsoPhoneNumber(opts.phoneNumber);
        if (resolved.phoneNumberId) {
            phoneNumberId = resolved.phoneNumberId;
        }
        else {
            warnings.push(resolved.error ?? "Could not resolve phone number with Kapso CLI.");
        }
    }
    const apiKey = readCliString(opts.apiKey) ?? account.apiKey;
    let webhookSecret = readCliString(opts.webhookSecret) ?? account.webhookSecret;
    const webhookUrl = readCliString(opts.webhookUrl);
    const webhookRegistration = await maybeRegisterWebhook({
        apiKey,
        dryRun: opts.dryRun === true,
        phoneNumberId,
        registerWebhook: opts.registerWebhook === true,
        webhookSecret,
        webhookUrl
    });
    if (webhookRegistration.generatedSecret)
        webhookSecret = webhookRegistration.generatedSecret;
    const configCommands = buildConfigSetCommands({
        accountId,
        allowFrom: opts.allowFrom,
        apiKey: readCliString(opts.apiKey),
        defaultTo: opts.defaultTo,
        dmSecurity: opts.dmSecurity,
        phoneNumberId,
        webhookSecret,
        webhookUrl
    });
    const configWrite = await writeConfigCommands(configCommands, {
        dryRun: opts.dryRun === true,
        writeConfig: opts.writeConfig === true
    });
    return {
        accountId,
        kapsoCli,
        resolved: {
            phoneNumberId,
            webhookUrl,
            webhookSecret
        },
        webhookRegistration: {
            status: webhookRegistration.status,
            method: webhookRegistration.method,
            webhookId: webhookRegistration.webhookId,
            error: webhookRegistration.error,
            command: webhookRegistration.command
        },
        config: {
            status: configWrite.status,
            commands: configCommands,
            errors: configWrite.errors
        },
        nextSteps: buildSetupNextSteps({
            apiKey,
            phoneNumberId,
            registerWebhook: opts.registerWebhook === true,
            webhookSecret,
            webhookUrl,
            writeConfig: opts.writeConfig === true
        }),
        warnings
    };
}
async function buildKapsoCliStatus() {
    return {
        ...await probeKapsoCli(),
        ...await probeKapsoStatus()
    };
}
async function probeKapsoCli() {
    const cli = resolveKapsoCli();
    if (!cli.packagePath) {
        return {
            installed: false,
            source: cli.source,
            error: cli.error
        };
    }
    const result = await runKapsoCommand(["--version"]);
    if (result.error) {
        return {
            installed: false,
            source: cli.source,
            error: result.error.message
        };
    }
    return {
        installed: result.status === 0,
        source: cli.source,
        version: (result.stdout || result.stderr).trim() || undefined,
        ...(result.status === 0 ? {} : { error: `kapso --version exited with ${result.status}` })
    };
}
async function probeKapsoStatus() {
    const result = await runKapsoCommand(["status", "--output", "json"]);
    if (result.error)
        return { status: "skipped", statusDetail: result.error.message };
    if (result.status === 0)
        return { status: "ok" };
    return { status: "failed", statusDetail: stderrOrStdout(result) || `kapso status exited with ${result.status}` };
}
async function resolveKapsoPhoneNumber(phoneNumber) {
    const result = await runKapsoCommand(["whatsapp", "numbers", "resolve", phoneNumber, "--output", "json"]);
    if (result.error)
        return { error: result.error.message };
    if (result.status !== 0)
        return { error: stderrOrStdout(result) || `kapso resolve exited with ${result.status}` };
    const parsed = parseJson(result.stdout);
    const phoneNumberId = extractPhoneNumberId(parsed);
    if (!phoneNumberId) {
        return { error: "Kapso CLI did not return a phone_number_id in JSON output." };
    }
    return { phoneNumberId };
}
async function maybeRegisterWebhook(params) {
    if (!params.registerWebhook)
        return { status: "skipped" };
    if (!params.phoneNumberId)
        return { status: "failed", error: "phoneNumberId is required to register a webhook." };
    if (!params.webhookUrl)
        return { status: "failed", error: "webhookUrl is required to register a webhook." };
    if (params.apiKey && params.webhookSecret) {
        if (params.dryRun)
            return { status: "planned", method: "api" };
        return registerWebhookWithApi({
            apiKey: params.apiKey,
            phoneNumberId: params.phoneNumberId,
            webhookSecret: params.webhookSecret,
            webhookUrl: params.webhookUrl
        });
    }
    const command = [
        "kapso",
        "whatsapp",
        "webhooks",
        "new",
        "--phone-number-id",
        params.phoneNumberId,
        "--url",
        params.webhookUrl,
        "--event",
        "whatsapp.message.received",
        "--active",
        "--output",
        "json"
    ];
    if (params.dryRun)
        return { status: "planned", method: "cli", command };
    const result = await runKapsoCommand(command.slice(1));
    if (result.error)
        return { status: "failed", method: "cli", command, error: result.error.message };
    if (result.status !== 0) {
        return {
            status: "failed",
            method: "cli",
            command,
            error: stderrOrStdout(result) || `kapso webhook creation exited with ${result.status}`
        };
    }
    const parsed = parseJson(result.stdout);
    return {
        status: "success",
        method: "cli",
        webhookId: extractWebhookId(parsed),
        generatedSecret: extractWebhookSecret(parsed),
        command
    };
}
async function registerWebhookWithApi(params) {
    const baseUrl = normalizeKapsoPlatformBaseUrl(undefined);
    const response = await fetch(`${baseUrl}/platform/v1/whatsapp/phone_numbers/${encodeURIComponent(params.phoneNumberId)}/webhooks`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-API-Key": params.apiKey
        },
        body: JSON.stringify({
            whatsapp_webhook: {
                url: params.webhookUrl,
                secret_key: params.webhookSecret,
                events: ["whatsapp.message.received"],
                active: true
            }
        })
    });
    const text = await response.text();
    const parsed = parseJson(text);
    if (!response.ok) {
        return {
            status: "failed",
            method: "api",
            error: text || `Kapso API returned HTTP ${response.status}`
        };
    }
    return {
        status: "success",
        method: "api",
        webhookId: extractWebhookId(parsed)
    };
}
function buildConfigSetCommands(params) {
    const commands = [];
    const prefix = params.accountId === "default"
        ? `channels["${CHANNEL_ID}"]`
        : `channels["${CHANNEL_ID}"].accounts["${params.accountId}"]`;
    commands.push(configSetCommand(`${prefix}.enabled`, true));
    if (params.apiKey)
        commands.push(configSetCommand(`${prefix}.apiKey`, params.apiKey));
    if (params.phoneNumberId)
        commands.push(configSetCommand(`${prefix}.phoneNumberId`, params.phoneNumberId));
    if (params.webhookSecret)
        commands.push(configSetCommand(`${prefix}.webhookSecret`, params.webhookSecret));
    if (params.webhookUrl) {
        const webhookPath = pathFromUrl(params.webhookUrl);
        if (webhookPath)
            commands.push(configSetCommand(`${prefix}.webhookPath`, webhookPath));
    }
    if (params.defaultTo)
        commands.push(configSetCommand(`${prefix}.defaultTo`, params.defaultTo));
    if (params.dmSecurity)
        commands.push(configSetCommand(`${prefix}.dmSecurity`, params.dmSecurity));
    if (params.allowFrom) {
        commands.push(configSetCommand(`${prefix}.allowFrom`, params.allowFrom.split(",").map((entry) => entry.trim()).filter(Boolean)));
    }
    return commands;
}
function configSetCommand(path, value) {
    return ["openclaw", "config", "set", path, JSON.stringify(value), "--strict-json"];
}
async function writeConfigCommands(commands, opts) {
    if (!opts.writeConfig)
        return { status: opts.dryRun ? "planned" : "skipped", errors: [] };
    if (opts.dryRun)
        return { status: "planned", errors: [] };
    try {
        await updateConfig((cfg) => {
            for (const command of commands)
                applyConfigSetCommand(cfg, command);
            return cfg;
        });
        return { status: "written", errors: [] };
    }
    catch (error) {
        return { status: "failed", errors: [error instanceof Error ? error.message : String(error)] };
    }
}
function applyConfigSetCommand(cfg, command) {
    const path = command[3];
    const rawValue = command[4];
    if (!path || rawValue === undefined)
        throw new Error(`Invalid config command: ${shellJoin(command)}`);
    setConfigPath(cfg, path, JSON.parse(rawValue));
}
function setConfigPath(target, path, value) {
    const parts = parseConfigPath(path);
    if (parts.length === 0)
        throw new Error(`Invalid empty config path: ${path}`);
    let cursor = target;
    for (const part of parts.slice(0, -1)) {
        const next = cursor[part];
        if (!next || typeof next !== "object" || Array.isArray(next)) {
            cursor[part] = {};
        }
        cursor = cursor[part];
    }
    cursor[parts[parts.length - 1] ?? ""] = value;
}
function parseConfigPath(path) {
    const parts = [];
    let index = 0;
    while (index < path.length) {
        const char = path[index];
        if (char === ".") {
            index += 1;
            continue;
        }
        if (char === "[") {
            const end = path.indexOf("]", index);
            if (end === -1)
                throw new Error(`Invalid config path: ${path}`);
            const token = path.slice(index + 1, end);
            parts.push(parseBracketPathToken(token, path));
            index = end + 1;
            continue;
        }
        const start = index;
        while (index < path.length && path[index] !== "." && path[index] !== "[")
            index += 1;
        parts.push(path.slice(start, index));
    }
    return parts.filter(Boolean);
}
function parseBracketPathToken(token, path) {
    const trimmed = token.trim();
    if (!trimmed)
        throw new Error(`Invalid config path: ${path}`);
    try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed === "string" || typeof parsed === "number")
            return String(parsed);
    }
    catch {
        // Fall through to the legacy unquoted bracket form below.
    }
    if (/^[A-Za-z0-9_-]+$/.test(trimmed))
        return trimmed;
    throw new Error(`Invalid config path token in ${path}`);
}
function buildSetupNextSteps(params) {
    const steps = [];
    if (!params.apiKey)
        steps.push("Create a Kapso project API key and pass --api-key, or set channels[\"kapso-whatsapp\"].apiKey.");
    if (!params.phoneNumberId)
        steps.push("Pass --phone-number-id, or pass --phone-number so the Kapso CLI can resolve it.");
    if (!params.webhookUrl)
        steps.push("Pass --webhook-url with your public OpenClaw Funnel/gateway URL.");
    if (!params.webhookSecret && !params.registerWebhook)
        steps.push("Pass --webhook-secret, or use --register-webhook and let Kapso generate one.");
    if (!params.writeConfig)
        steps.push("Rerun with --write-config to apply the printed OpenClaw config commands.");
    if (!params.registerWebhook)
        steps.push("Rerun with --register-webhook or create the Kapso phone-number webhook manually.");
    return steps;
}
function buildNextSteps(accounts) {
    const steps = [];
    const account = accounts[0];
    if (!account) {
        steps.push(`Enable the channel with: openclaw config set 'channels["${CHANNEL_ID}"].enabled' true --strict-json`);
        return steps;
    }
    if (!account.configured) {
        steps.push("Configure apiKey and phoneNumberId for the channel.");
    }
    if (account.webhookSecretStatus !== "available") {
        steps.push("Configure webhookSecret so Kapso webhook signatures can be verified.");
    }
    if (account.dmSecurity === "allowlist" && account.allowFromCount === 0) {
        steps.push("Add allowed senders with allowFrom, or intentionally set dmSecurity to open.");
    }
    steps.push(`Register a phone-number webhook for whatsapp.message.received at https://<public-gateway>${account.webhookPath}.`);
    return steps;
}
function printSetupReport(report) {
    console.log("Kapso WhatsApp setup");
    console.log(`Account: ${report.accountId}`);
    console.log(`Kapso CLI: ${formatKapsoCliStatus(report.kapsoCli)}`);
    if (report.kapsoCli.status)
        console.log(`Kapso status: ${report.kapsoCli.status}${report.kapsoCli.statusDetail ? ` (${report.kapsoCli.statusDetail})` : ""}`);
    console.log(`Phone number ID: ${report.resolved.phoneNumberId ?? "missing"}`);
    console.log(`Webhook URL: ${report.resolved.webhookUrl ?? "missing"}`);
    console.log(`Webhook secret: ${report.resolved.webhookSecret ? "available" : "missing"}`);
    console.log(`Webhook registration: ${report.webhookRegistration.status}${report.webhookRegistration.method ? ` via ${report.webhookRegistration.method}` : ""}`);
    if (report.webhookRegistration.webhookId)
        console.log(`Webhook ID: ${report.webhookRegistration.webhookId}`);
    if (report.webhookRegistration.error)
        console.log(`Webhook error: ${report.webhookRegistration.error}`);
    if (report.config.commands.length > 0) {
        console.log("");
        console.log(`Config: ${report.config.status}`);
        for (const command of report.config.commands)
            console.log(`  ${shellJoin(command)}`);
    }
    for (const error of report.config.errors)
        console.log(`Config error: ${error}`);
    if (report.warnings.length > 0) {
        console.log("");
        console.log("Warnings:");
        for (const warning of report.warnings)
            console.log(`  - ${warning}`);
    }
    if (report.nextSteps.length > 0) {
        console.log("");
        console.log("Next steps:");
        for (const step of report.nextSteps)
            console.log(`  - ${step}`);
    }
}
function printDoctorReport(report) {
    console.log("Kapso WhatsApp doctor");
    console.log(`Channel: ${report.channelId}`);
    console.log(`Kapso CLI: ${formatKapsoCliStatus(report.kapsoCli)}`);
    if (report.kapsoCli.error && !report.kapsoCli.installed)
        console.log(`Kapso CLI detail: ${report.kapsoCli.error}`);
    console.log("");
    for (const account of report.accounts) {
        console.log(`Account: ${account.accountId}`);
        console.log(`  enabled: ${account.enabled ? "yes" : "no"}`);
        console.log(`  configured: ${account.configured ? "yes" : "no"}`);
        console.log(`  phoneNumberId: ${account.phoneNumberId ?? "missing"}`);
        console.log(`  apiKey: ${account.apiKeyStatus}`);
        console.log(`  webhookSecret: ${account.webhookSecretStatus}`);
        console.log(`  webhookPath: ${account.webhookPath}`);
        console.log(`  dmSecurity: ${account.dmSecurity}`);
        console.log(`  allowFrom: ${account.allowFromCount}`);
    }
    if (report.nextSteps.length > 0) {
        console.log("");
        console.log("Next steps:");
        for (const step of report.nextSteps)
            console.log(`  - ${step}`);
    }
}
function formatKapsoCliStatus(kapsoCli) {
    const status = kapsoCli.installed ? "installed" : "not found";
    const version = kapsoCli.version ? ` (${kapsoCli.version})` : "";
    const source = kapsoCli.source ? ` via ${kapsoCli.source}` : "";
    return `${status}${version}${source}`;
}
function resolveKapsoCli() {
    try {
        return {
            packagePath: nodeRequire.resolve(KAPSO_CLI_PACKAGE_PATH),
            source: "bundled"
        };
    }
    catch (error) {
        return {
            source: "missing",
            error: error instanceof Error ? error.message : String(error)
        };
    }
}
async function runKapsoCommand(args, opts) {
    const cli = resolveKapsoCli();
    if (!cli.packagePath) {
        return {
            status: 1,
            stdout: "",
            stderr: "",
            error: new Error(cli.error ?? "Bundled @kapso/cli was not found.")
        };
    }
    if (opts?.stdio === "inherit") {
        try {
            await runKapsoCli(args, cli.packagePath);
            return { status: 0, stdout: "", stderr: "" };
        }
        catch (error) {
            return buildKapsoCommandErrorResult(error);
        }
    }
    return captureProcessOutput(async () => {
        await runKapsoCli(args, cli.packagePath);
    });
}
async function captureProcessOutput(fn) {
    const originalStdoutWrite = process.stdout.write;
    const originalStderrWrite = process.stderr.write;
    let stdout = "";
    let stderr = "";
    process.stdout.write = ((chunk, encodingOrCallback, callback) => {
        stdout += stringifyWriteChunk(chunk);
        const cb = typeof encodingOrCallback === "function" ? encodingOrCallback : callback;
        if (typeof cb === "function")
            cb();
        return true;
    });
    process.stderr.write = ((chunk, encodingOrCallback, callback) => {
        stderr += stringifyWriteChunk(chunk);
        const cb = typeof encodingOrCallback === "function" ? encodingOrCallback : callback;
        if (typeof cb === "function")
            cb();
        return true;
    });
    try {
        await fn();
        return { status: 0, stdout, stderr };
    }
    catch (error) {
        const result = buildKapsoCommandErrorResult(error);
        return {
            ...result,
            stdout,
            stderr: stderr || result.stderr
        };
    }
    finally {
        process.stdout.write = originalStdoutWrite;
        process.stderr.write = originalStderrWrite;
    }
}
function stringifyWriteChunk(chunk) {
    if (Buffer.isBuffer(chunk))
        return chunk.toString("utf8");
    if (chunk instanceof Uint8Array)
        return Buffer.from(chunk).toString("utf8");
    return String(chunk);
}
function buildKapsoCommandErrorResult(error) {
    const normalized = error instanceof Error ? error : new Error(String(error));
    const status = readExitCode(error);
    return {
        status,
        stdout: "",
        stderr: normalized.message,
        ...(status === 0 ? {} : { error: normalized })
    };
}
function readExitCode(error) {
    if (!error || typeof error !== "object")
        return 1;
    const direct = error.exitCode;
    if (typeof direct === "number")
        return direct;
    const oclif = error.oclif;
    if (typeof oclif?.exit === "number")
        return oclif.exit;
    return 1;
}
function stderrOrStdout(result) {
    return (result.stderr || result.stdout).trim() || undefined;
}
function parseJson(value) {
    try {
        return JSON.parse(value);
    }
    catch {
        return undefined;
    }
}
function extractPhoneNumberId(value) {
    return readDeepString(value, ["phone_number_id", "phoneNumberId", "phoneNumberID", "meta_phone_number_id", "id"]);
}
function extractWebhookId(value) {
    return readDeepString(value, ["webhook_id", "webhookId", "id"]);
}
function extractWebhookSecret(value) {
    return readDeepString(value, ["secret_key", "secretKey", "webhookSecret"]);
}
function readDeepString(value, keys) {
    const direct = readStringFromRecord(value, keys);
    if (direct)
        return direct;
    if (!value || typeof value !== "object")
        return undefined;
    if (Array.isArray(value)) {
        for (const item of value) {
            const found = readDeepString(item, keys);
            if (found)
                return found;
        }
        return undefined;
    }
    for (const nested of Object.values(value)) {
        const found = readDeepString(nested, keys);
        if (found)
            return found;
    }
    return undefined;
}
function readStringFromRecord(value, keys) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return undefined;
    const record = value;
    for (const key of keys) {
        const text = readCliString(record[key]);
        if (text)
            return text;
    }
    return undefined;
}
function readCliString(value) {
    if (typeof value === "string" && value.trim())
        return value.trim();
    if (typeof value === "number" && Number.isFinite(value))
        return String(value);
    return undefined;
}
function normalizeKapsoPlatformBaseUrl(value) {
    const trimmed = value?.trim().replace(/\/+$/, "");
    if (!trimmed)
        return "https://api.kapso.ai";
    return trimmed.replace(/\/platform\/v1$/, "");
}
function pathFromUrl(value) {
    try {
        const url = new URL(value);
        return url.pathname || undefined;
    }
    catch {
        return undefined;
    }
}
function shellJoin(command) {
    return command.map(shellQuote).join(" ");
}
function shellQuote(value) {
    if (/^[A-Za-z0-9_./:=+-]+$/.test(value))
        return value;
    return `'${value.replace(/'/g, "'\\''")}'`;
}
//# sourceMappingURL=index.js.map