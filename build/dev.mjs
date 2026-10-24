/**
 * Development loop: build once, then keep rebuilding while `web-ext run` has
 * Firefox open. Closing Firefox stops the build watcher.
 */

import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import process from "node:process";

const run = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "dist", "firefox");
const WEB_EXT = "node_modules/web-ext/bin/web-ext.js";

/** Everything web-ext needs before it may load the extension. */
const BUILD_OUTPUTS = ["manifest.json", "background.js", "options/options.js", "popup/popup.js"];

/**
 * Wait until the watcher has written a complete build.
 *
 * The watcher cleans the output directory once when it starts, so Firefox must
 * not load the extension while that cleanup is still in flight.
 */
async function waitForBuild() {
  for (let attempt = 0; attempt < 150; attempt++) {
    if (BUILD_OUTPUTS.every((file) => existsSync(join(OUT, file)))) {
      return;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  console.warn("Build output is incomplete, starting Firefox anyway.");
}

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
await waitForBuild();
start("web-ext run", [
  WEB_EXT,
  "run",
  "--source-dir",
  "dist/firefox",
  "--start-url",
  "about:addons",
]);
