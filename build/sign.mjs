/**
 * Sign the built extension through AMO (`web-ext sign`).
 *
 * Set AMO_JWT_ISSUER and AMO_JWT_SECRET in `.env` first, see `.env.example`.
 */

import { execFile } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import process from "node:process";

const run = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const args = [
  "node_modules/web-ext/bin/web-ext.js",
  "sign",
  "--source-dir",
  "dist/firefox",
  "--artifacts-dir",
  "dist/artifacts",
  "--channel",
  process.env.AMO_CHANNEL ?? "unlisted",
];

if (process.env.AMO_JWT_ISSUER) {
  args.push("--api-key", process.env.AMO_JWT_ISSUER);
}
if (process.env.AMO_JWT_SECRET) {
  args.push("--api-secret", process.env.AMO_JWT_SECRET);
}

const { stdout, stderr } = await run(process.execPath, args, { cwd: ROOT });
process.stdout.write(stdout);
process.stderr.write(stderr);
