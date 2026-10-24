/**
 * Remove generated output of the repository.
 *
 * Usage:
 *   node build/clean.mjs         # dist, coverage, web-ext-artifacts, *.log
 *   node build/clean.mjs --all   # additionally node_modules
 *
 * Only fixed paths below the repository root are touched, so this also runs
 * safely from a script.
 */

import { readdir, rm, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Generated directories, relative to the repository root. */
const DIRECTORIES = ["dist", "coverage", "web-ext-artifacts"];

const args = new Set(process.argv.slice(2));
if (args.has("--all")) {
  DIRECTORIES.push("node_modules");
}

/** Remove `path` and report it, ignoring a path that is already gone. */
async function remove(path, label) {
  try {
    await stat(path);
  } catch {
    return false;
  }
  await rm(path, { recursive: true, force: true });
  console.log(`Removed ${label}`);
  return true;
}

let removed = 0;
for (const directory of DIRECTORIES) {
  if (await remove(join(ROOT, directory), `${directory}/`)) {
    removed++;
  }
}

for (const entry of await readdir(ROOT)) {
  if (entry.endsWith(".log") && (await remove(join(ROOT, entry), entry))) {
    removed++;
  }
}

console.log(removed === 0 ? "Nothing to clean." : `Cleaned ${removed} path(s).`);
