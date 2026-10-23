import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

interface Manifest {
  manifest_version: number;
  version: string;
  browser_specific_settings: { gecko: { id: string; strict_min_version: string } };
  action: { default_popup: string };
  permissions: string[];
  host_permissions: string[];
  background: { scripts: string[]; persistent?: boolean };
  web_accessible_resources: { resources: string[]; matches: string[] }[];
}

const manifestPath = join(process.cwd(), "src", "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Manifest;

describe("manifest", () => {
  it("is a Firefox Manifest V3 manifest", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.browser_specific_settings.gecko.id).toBeTypeOf("string");
    expect(manifest.browser_specific_settings.gecko.strict_min_version).toMatch(/^\d+/);
  });

  it("uses the MV3 action key", () => {
    expect(manifest.action.default_popup).toBe("popup/popup.html");
    expect(manifest).not.toHaveProperty("browser_action");
  });

  it("keeps blocking webRequest for redirects", () => {
    expect(manifest.permissions).toEqual(
      expect.arrayContaining(["webRequest", "webRequestBlocking", "storage", "alarms"]),
    );
    expect(manifest.host_permissions).toEqual(["<all_urls>"]);
  });

  it("runs the background as an event page", () => {
    expect(manifest.background.scripts).toEqual(["background.js"]);
    expect(manifest.background).not.toHaveProperty("persistent");
  });

  it("declares web accessible resources in the MV3 shape", () => {
    for (const entry of manifest.web_accessible_resources) {
      expect(entry.resources.length).toBeGreaterThan(0);
      expect(entry.matches).toContain("<all_urls>");
    }
  });

  it("lets the build inject the version", () => {
    expect(manifest.version).toBe("0.0.0");
  });
});
