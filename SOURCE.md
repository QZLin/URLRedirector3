# Building URLRedirector3 from source

This archive contains the complete source of URLRedirector3 (version 1.5.0),
the Firefox WebExtension that rewrites request URLs with regular expressions.
It is the source of the submitted build and rebuilds it byte for byte.

Everything comes from the files in this archive. There is no generated code,
no download step besides installing the pinned dependencies and no manual
patching.

## Requirements

|                  |                                                                       |
| ---------------- | --------------------------------------------------------------------- |
| Operating system | Windows 10/11, macOS 12+ or a glibc Linux distribution (x64 or arm64) |
| Node.js          | 20.19.0 or newer (tested with 22.x, 24.x and 26.12.0)                 |
| pnpm             | 12.14.0, installed through Corepack or npm                            |
| Network          | only for `pnpm install` (npm registry)                                |
| Firefox          | 140 or newer, only to run the built extension                         |

The dependencies are JavaScript plus one native binary (`esbuild`), which
`pnpm install` downloads for the host platform. Nothing else has to be
installed system-wide.

## Build steps

```sh
# 1. Install the package manager. Choose one of:
corepack enable
corepack prepare pnpm@12.14.0 --activate
# ... or:
npm install --global pnpm@12.14.0

# 2. Install the pinned dependencies of the lockfile.
pnpm install --frozen-lockfile

# 3. Build the extension.
pnpm run build
```

`pnpm run build` runs `build/build.mjs --prod`. It takes no argument and writes
the complete, minified extension to `dist/firefox`:

| Source                                                              | Output                                                                                                           |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `src/background/index.ts`                                           | `dist/firefox/background.js` (classic script, IIFE)                                                              |
| `src/options/index.ts`                                              | `dist/firefox/options/options.js` (ES module)                                                                    |
| `src/popup/index.ts`                                                | `dist/firefox/popup/popup.js` (ES module)                                                                        |
| `src/options/options.html`, `src/popup/popup.html`, `src/static/**` | copied unchanged                                                                                                 |
| `src/_locales/**`                                                   | copied unchanged                                                                                                 |
| `src/manifest.json`                                                 | copied, with `name`/`description`/`version`/`homepage_url`/`browser_specific_settings` taken from `package.json` |
| `node_modules/bootstrap/dist/css/bootstrap.min.css`                 | `dist/firefox/static/css/bootstrap.min.css`                                                                      |
| `node_modules/bootstrap-icons/font/bootstrap-icons.min.css`         | `dist/firefox/static/css/bootstrap-icons.min.css`                                                                |
| `node_modules/bootstrap-icons/font/fonts/bootstrap-icons.woff2`     | `dist/firefox/static/css/fonts/bootstrap-icons.woff2`                                                            |

The TypeScript sources are bundled with `esbuild` 0.28.2, target `firefox115`.
The background bundle is an IIFE, the two extension pages stay ES modules.
Production builds are minified and ship without sourcemaps.

The manifest identity is read exclusively from `package.json`: `displayName`
(falling back to `name`), `description`, `version`, `homepage` and
`browser_specific_settings`. `src/manifest.json` only holds the structural keys
(permissions, entry points, icons, static resources), so release metadata is
maintained in one place. `build/manifest.mjs` validates that metadata and fails
the build when a required field is missing or malformed.

## Packaging

```sh
pnpm run package
```

This builds and then zips `dist/firefox` into
`dist/artifacts/urlredirector-firefox-v1.5.0.zip` using `web-ext` 10.8.0. That
ZIP is the file submitted to addons.mozilla.org. Neither command contains
environment-specific steps.

The optional `--variant=offline` build (`pnpm run build:offline`,
`pnpm run package:offline`) writes to `dist/firefox-offline` and produces
`dist/artifacts/urlredirector-firefox-offline-v1.5.0.zip` from the same
sources and with the same manifest.

## Verifying the result

```sh
pnpm run check          # Prettier, tsc, ESLint and the Vitest suite
pnpm run lint:webext    # web-ext lint on dist/firefox
```

`pnpm run check` must pass before a build. `pnpm run lint:webext` may not
report errors or warnings for the packaged extension.

To compare a rebuild with the submitted ZIP, rebuild `dist/artifacts` as
described above and compare the two archives. `web-ext` stamps the entries
with the current time, so the ZIP bytes differ, but the extracted trees are
identical: rebuilding this source from scratch
(`pnpm install --frozen-lockfile && pnpm run build`) produced the same 21 files
with the same SHA-256 hashes as the submitted build.

## Loading the extension

Open `about:debugging#/runtime/this-firefox`, click _Load Temporary Add-on_ and
pick `dist/firefox/manifest.json`. Firefox 140+ is required; the extension uses
the blocking `webRequest` API, which current Chrome versions do not offer.

## Contents of this archive

Included: `src`, `build`, `tests`, `tools` (rule examples and the options
screenshot), `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`,
`tsconfig.json`, `vitest.config.ts`, `eslint.config.js`, `.prettier*`,
`web-ext-config.mjs`, `README.md`, `CHANGELOG.md`, `LICENSE`, this file.

Excluded because they are generated or machine specific: `node_modules`,
`dist`, `.git`, `.env` (AMO credentials only), coverage and log files, and the
extra screenshots in `tools` (only the options screenshot shown in the README
is included).

## Recreating this archive

`pnpm run pack-src` writes `dist/artifacts/urlredirector3-v1.5.0-src.zip` with
exactly the contents listed above; `pnpm run pack-src:list` prints the file
list. The archive is a plain ZIP of the repository root, so all paths in this
document apply unchanged after extraction.
