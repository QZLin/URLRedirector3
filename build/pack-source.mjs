/**
 * Pack the sources for the addons.mozilla.org source review.
 *
 * AMO requires the source code of every submitted build together with the
 * steps to rebuild it. The archive therefore contains the whole buildable
 * tree (sources, build scripts, tests, lockfile, tool configuration and the
 * `build.md` build instructions) and deliberately leaves out everything that
 * is generated or machine specific: `node_modules`, `dist`, `.git`, `.env`,
 * logs and the screenshot assets in `tools`.
 *
 * Usage:
 *   node build/pack-source.mjs           # writes dist/artifacts/<name>-source.zip
 *   node build/pack-source.mjs --list    # only print what would be packed
 *
 * The archive is a plain, flat ZIP of the repository tree, so the paths in
 * `build.md` apply unchanged once it is extracted.
 */

import { readFile, readdir, mkdir, stat } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { deflateRawSync } from "node:zlib";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ARTIFACTS = join(ROOT, "dist", "artifacts");

/** Files at the repository root that belong to the buildable source. */
const ROOT_FILES = [
  ".env.example",
  ".gitignore",
  ".prettierignore",
  ".prettierrc.json",
  "CHANGELOG.md",
  "LICENSE",
  "README.md",
  "build.md",
  "eslint.config.js",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tsconfig.json",
  "vitest.config.ts",
  "web-ext-config.mjs",
];

/** Directories that are packed recursively. */
const DIRECTORIES = ["build", "src", "tests", "tools"];

/** Names that are never part of the source archive. */
const EXCLUDED_DIRECTORIES = new Set([
  ".git",
  ".idea",
  ".vscode",
  "coverage",
  "dist",
  "node_modules",
]);

/** Screenshot the README shows; the other images in `tools` are extras. */
const README_IMAGE = "tools/screen_options.png";

/** Paths (relative to the root, POSIX separators) that are never packed. */
function isExcluded(relativePath) {
  const name = relativePath.split("/").pop() ?? "";
  if (EXCLUDED_DIRECTORIES.has(name)) {
    return true;
  }
  if (relativePath === ".env" || relativePath.endsWith(".log") || relativePath.endsWith(".zip")) {
    return true;
  }
  if (relativePath === README_IMAGE) {
    return false;
  }
  // The other screenshots are only documentation, they are not needed to rebuild.
  return relativePath.startsWith("tools/") && relativePath.toLowerCase().endsWith(".png");
}

/** Collect every file that has to go into the archive. */
async function collectFiles(relativeDirectory = "") {
  const files = [];
  const entries = await readdir(join(ROOT, relativeDirectory), { withFileTypes: true });
  for (const entry of entries) {
    const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
    if (isExcluded(relativePath)) {
      continue;
    }
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(relativePath)));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
  return files;
}

/** CRC-32 as required by the ZIP format. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** MS-DOS date and time of a `Date`, as stored in a ZIP entry. */
function dosTimestamp(date) {
  const time =
    (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

/**
 * Minimal ZIP writer.
 *
 * Only the features needed here are implemented: deflate compression, UTF-8
 * names and a flat central directory. No ZIP64, no encryption.
 */
async function writeZip(archivePath, entries) {
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const data = await readFile(entry.absolute);
    const compressed = deflateRawSync(data, { level: 9 });
    const { time, day } = dosTimestamp(entry.mtime);
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);

    chunks.push(local, name, compressed);

    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4); // version made by
    header.writeUInt16LE(20, 6); // version needed
    header.writeUInt16LE(0x0800, 8);
    header.writeUInt16LE(8, 10);
    header.writeUInt16LE(time, 12);
    header.writeUInt16LE(day, 14);
    header.writeUInt32LE(crc, 16);
    header.writeUInt32LE(compressed.length, 20);
    header.writeUInt32LE(data.length, 24);
    header.writeUInt16LE(name.length, 28);
    header.writeUInt16LE(0, 30); // extra field length
    header.writeUInt16LE(0, 32); // comment length
    header.writeUInt16LE(0, 34); // disk number
    header.writeUInt16LE(0, 36); // internal attributes
    header.writeUInt32LE(0o644 << 16, 38); // external attributes
    header.writeUInt32LE(offset, 42);
    central.push(header, name);

    offset += local.length + name.length + compressed.length;
  }

  const centralBuffer = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);

  await mkdir(dirname(archivePath), { recursive: true });
  await new Promise((resolveWrite, rejectWrite) => {
    const stream = createWriteStream(archivePath);
    stream.on("error", rejectWrite);
    stream.on("finish", resolveWrite);
    stream.end(Buffer.concat([...chunks, centralBuffer, end]));
  });
}

const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));

const files = [...ROOT_FILES];
for (const directory of DIRECTORIES) {
  files.push(...(await collectFiles(directory)));
}
files.sort();

const missing = [];
for (const required of ROOT_FILES) {
  try {
    await stat(join(ROOT, required));
  } catch {
    missing.push(required);
  }
}
if (missing.length > 0) {
  throw new Error(`Missing required source files: ${missing.join(", ")}`);
}

if (process.argv.includes("--list")) {
  for (const file of files) {
    console.log(file);
  }
  console.log(`${files.length} files, version ${pkg.version}`);
  process.exit(0);
}

const archivePath = join(ARTIFACTS, `${pkg.name}-v${pkg.version}-src.zip`);
const entries = [];
for (const file of files) {
  const absolute = join(ROOT, ...file.split("/"));
  const info = await stat(absolute);
  entries.push({ name: file, absolute, mtime: info.mtime, size: info.size });
}

await writeZip(archivePath, entries);

// Sanity check: the central directory has to reference exactly the packed files.
const written = await readFile(archivePath);
const endOfCentralDirectory = written.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
const packedCount =
  endOfCentralDirectory < 0 ? -1 : written.readUInt16LE(endOfCentralDirectory + 10);
if (packedCount !== entries.length) {
  throw new Error(`Broken archive: ${packedCount} entries instead of ${entries.length}`);
}

const totalBytes = entries.reduce((sum, entry) => sum + entry.size, 0);
console.log(
  `Packed ${entries.length} files (${(totalBytes / 1024).toFixed(1)} KiB, version ${pkg.version}) to ${relative(ROOT, archivePath)}`,
);
console.log(`Upload this archive as "source code" in the AMO submission form.`);
