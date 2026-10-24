/**
 * Package the built extension with `web-ext build`.
 *
 * Run it through `pnpm run package`; the version is taken from package.json.
 */

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import process from "node:process";

const run = promisify(execFile);

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const variant =
  process.argv.find((arg) => arg.startsWith("--variant="))?.split("=")[1] ??
  process.env.VARIANT ??
  "firefox";
const sourceDir = variant === "offline" ? "dist/firefox-offline" : "dist/firefox";
const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
const suffix = variant === "offline" ? "firefox-offline" : "firefox";
// `web-ext` lower cases the artifact name and replaces unsupported characters.
const filename = `urlredirector3-${suffix}-v${pkg.version}.zip`;

const { stdout } = await run(
  process.execPath,
  [
    "node_modules/web-ext/bin/web-ext.js",
    "build",
    "--source-dir",
    sourceDir,
    "--artifacts-dir",
    "dist/artifacts",
    "--overwrite-dest",
    "--filename",
    filename,
  ],
  { cwd: ROOT },
);

process.stdout.write(stdout);
console.log(`Packaged dist/artifacts/${filename}`);
