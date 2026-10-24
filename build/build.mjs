/**
 * Build the Firefox extension into `dist/<variant>`.
 *
 * Usage:
 *   node build/build.mjs             # development build with source maps
 *   node build/build.mjs --prod      # minified release build
 *   node build/build.mjs --watch     # rebuild on change
 *   node build/build.mjs --prod --variant=offline
 */

import { build } from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { watch } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

import { createManifest } from "./manifest.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");

const args = new Set(process.argv.slice(2));
const isProd = args.has("--prod");
const isWatch = args.has("--watch");
const variant =
  [...args].find((arg) => arg.startsWith("--variant="))?.split("=")[1] ??
  process.env.VARIANT ??
  "firefox";

const OUT = join(ROOT, "dist", variant === "offline" ? "firefox-offline" : "firefox");

/** Files copied verbatim and the copy of their directory structure. */
const STATIC_FILES = [
  [join(SRC, "options/options.html"), "options/options.html"],
  [join(SRC, "popup/popup.html"), "popup/popup.html"],
  [join(SRC, "static/css/app.css"), "static/css/app.css"],
];

/** Third party assets, vendored at build time so that `src` stays dependency free. */
const VENDOR_FILES = [
  ["node_modules/bootstrap/dist/css/bootstrap.min.css", "static/css/bootstrap.min.css"],
  [
    "node_modules/bootstrap-icons/font/bootstrap-icons.min.css",
    "static/css/bootstrap-icons.min.css",
  ],
  [
    "node_modules/bootstrap-icons/font/fonts/bootstrap-icons.woff2",
    "static/css/fonts/bootstrap-icons.woff2",
  ],
];

/** esbuild entry points. */
const ENTRY_POINTS = [
  { in: join(SRC, "background/index.ts"), out: "background.js", format: "iife" },
  { in: join(SRC, "options/index.ts"), out: "options/options.js", format: "esm" },
  { in: join(SRC, "popup/index.ts"), out: "popup/popup.js", format: "esm" },
];

const VARIANT_MANIFEST = {
  firefox: {},
  offline: {},
};

/** Whether OUT was cleaned already, see {@link prepare}. */
let prepared = false;

/** Copy the static assets and write the manifest for this variant. */
async function prepare() {
  /*
   * In watch mode the bundles live in the same directory and esbuild only
   * rewrites the entry points a change touched, so wiping OUT on every change
   * would delete the bundles that stayed the same (touching an HTML file used
   * to leave the whole build devoid of JavaScript). Clean once per process.
   */
  if (!prepared) {
    await rm(OUT, { recursive: true, force: true });
    prepared = true;
  }
  await mkdir(OUT, { recursive: true });

  await cp(join(SRC, "static/images"), join(OUT, "static/images"), { recursive: true });
  await cp(join(SRC, "_locales"), join(OUT, "_locales"), { recursive: true });

  for (const [from, to] of STATIC_FILES) {
    await mkdir(dirname(join(OUT, to)), { recursive: true });
    await cp(from, join(OUT, to));
  }

  for (const [from, to] of VENDOR_FILES) {
    await mkdir(dirname(join(OUT, to)), { recursive: true });
    await cp(join(ROOT, from), join(OUT, to));
  }
  const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
  const template = JSON.parse(await readFile(join(SRC, "manifest.json"), "utf8"));
  // package.json is the single source of truth for the identity of the add-on.
  const manifest = createManifest(pkg, template);

  const overrides = VARIANT_MANIFEST[variant];
  if (!overrides) {
    throw new Error(`Unknown variant "${variant}", expected "firefox" or "offline"`);
  }
  if (overrides.name) {
    manifest.name = overrides.name;
  }
  if (overrides.browser_specific_settings) {
    manifest.browser_specific_settings = {
      ...manifest.browser_specific_settings,
      ...overrides.browser_specific_settings,
      gecko: {
        ...manifest.browser_specific_settings?.gecko,
        ...overrides.browser_specific_settings.gecko,
      },
    };
  }

  await writeFile(join(OUT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

/** Bundle the TypeScript entry points. */
async function compile() {
  await Promise.all(
    ENTRY_POINTS.map((entry) =>
      build({
        entryPoints: [entry.in],
        outfile: join(OUT, entry.out),
        bundle: true,
        format: entry.format,
        target: ["firefox140"],
        platform: "browser",
        sourcemap: isProd ? false : "linked",
        minify: isProd,
        logLevel: "warning",
      }),
    ),
  );
}

/** Keep rebuilding while `--watch` is set. */
async function startWatching() {
  const { context } = await import("esbuild");
  const contexts = await Promise.all(
    ENTRY_POINTS.map((entry) =>
      context({
        entryPoints: [entry.in],
        outfile: join(OUT, entry.out),
        bundle: true,
        format: entry.format,
        target: ["firefox140"],
        platform: "browser",
        sourcemap: "linked",
        logLevel: "warning",
      }),
    ),
  );
  await Promise.all(contexts.map((ctx) => ctx.watch()));

  let timer;
  watch(SRC, { recursive: true }, (_event, file) => {
    if (!file || file.includes("node_modules")) {
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(() => {
      prepare().catch((error) => console.error("Static rebuild failed:", error));
    }, 150);
  });

  console.log(`Watching ${SRC} …`);
}

await prepare();
if (isWatch) {
  await startWatching();
} else {
  await compile();
  console.log(`Built ${OUT}`);
}
