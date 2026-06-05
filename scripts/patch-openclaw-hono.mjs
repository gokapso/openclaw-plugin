#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PATCHED_HONO_VERSION = "4.12.23";
const MIN_SAFE_HONO_VERSION = "4.12.21";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const honoDir = path.join(repoRoot, "node_modules", "openclaw", "node_modules", "hono");
const honoPackageJson = path.join(honoDir, "package.json");

if (!existsSync(honoPackageJson)) {
  process.exit(0);
}

const installed = JSON.parse(readFileSync(honoPackageJson, "utf8")).version;
if (isAtLeast(installed, MIN_SAFE_HONO_VERSION)) {
  process.exit(0);
}

const tempDir = mkdtempSync(path.join(tmpdir(), "openclaw-hono-"));

try {
  execFileSync("npm", [
    "pack",
    `hono@${PATCHED_HONO_VERSION}`,
    "--pack-destination",
    tempDir,
    "--silent"
  ], { stdio: "pipe" });

  const tarball = readdirSync(tempDir).find((entry) => entry.endsWith(".tgz"));
  if (!tarball) throw new Error("npm pack did not produce a Hono tarball");

  execFileSync("tar", ["-xzf", path.join(tempDir, tarball), "-C", tempDir], { stdio: "pipe" });
  rmSync(honoDir, { recursive: true, force: true });
  cpSync(path.join(tempDir, "package"), honoDir, { recursive: true });

  console.log(`patched OpenClaw nested hono ${installed} -> ${PATCHED_HONO_VERSION}`);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

function isAtLeast(current, minimum) {
  const currentParts = current.split(".").map((part) => Number.parseInt(part, 10));
  const minimumParts = minimum.split(".").map((part) => Number.parseInt(part, 10));

  for (let i = 0; i < Math.max(currentParts.length, minimumParts.length); i += 1) {
    const currentPart = Number.isFinite(currentParts[i]) ? currentParts[i] : 0;
    const minimumPart = Number.isFinite(minimumParts[i]) ? minimumParts[i] : 0;
    if (currentPart > minimumPart) return true;
    if (currentPart < minimumPart) return false;
  }

  return true;
}
