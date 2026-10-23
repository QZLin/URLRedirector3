/**
 * Development loop: build once, then keep rebuilding while `web-ext run` has
 * Firefox open. Closing Firefox stops the build watcher.
 */

import { execFile, spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import process from "node:process";

const run = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WEB_EXT = "node_modules/web-ext/bin/web-ext.js";

const children = [];

function start(label, args) {
  const child = spawn(process.execPath, args, { cwd: ROOT, stdio: "inherit" });
  child.on("exit", (code) => {
    console.log(`[${label}] exited with code ${code}`);
    stopAll();
  });
  children.push(child);
  return child;
}

function stopAll() {
  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }
}

process.on("SIGINT", () => {
  stopAll();
  process.exit(0);
});

await run(process.execPath, ["build/build.mjs"], { cwd: ROOT });
start("build", ["build/build.mjs", "--watch"]);
start("web-ext run", [
  WEB_EXT,
  "run",
  "--source-dir",
  "dist/firefox",
  "--start-url",
  "about:addons",
]);
