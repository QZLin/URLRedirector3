import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { ManifestTemplate, PackageMetadata } from "../build/manifest.mjs";
import { createManifest } from "../build/manifest.mjs";
import pkg from "../package.json";

const templatePath = join(process.cwd(), "src", "manifest.json");
const template = JSON.parse(await readFile(templatePath, "utf8")) as ManifestTemplate;
const manifest = createManifest(pkg, template);

describe("manifest template", () => {
  it("is a Manifest V3 template without duplicated package metadata", () => {
    expect(template.manifest_version).toBe(3);
    // These keys are generated from package.json, keeping one source of truth.
    for (const key of [
      "name",
      "description",
      "version",
      "homepage_url",
      "browser_specific_settings",
    ]) {
      expect(template).not.toHaveProperty(key);
    }
  });
});

describe("manifest", () => {
  it("takes name, description, version and homepage from package.json", () => {
    expect(manifest.name).toBe(pkg.displayName);
    expect(manifest.description).toBe(pkg.description);
    expect(manifest.version).toBe(pkg.version);
    expect(manifest.homepage_url).toBe(pkg.homepage);
  });

  it("falls back to the package name when no display name is set", () => {
    expect(createManifest({ ...pkg, displayName: undefined }, template).name).toBe(pkg.name);
  });

  it("wins over a stale copy of the identity keys in the template", () => {
    const stale = {
      ...template,
      name: "Old",
      description: "Old",
      version: "0.0.0",
      homepage_url: "https://example.com",
      browser_specific_settings: { gecko: { id: "old@example.com", strict_min_version: "1" } },
    };
    expect(createManifest(pkg, stale).name).toBe(pkg.displayName);
    expect(createManifest(pkg, stale).version).toBe(pkg.version);
    expect(createManifest(pkg, stale).browser_specific_settings.gecko.id).toBe(
      pkg.browser_specific_settings.gecko.id,
    );
  });

  it("copies the gecko settings of package.json", () => {
    expect(manifest.browser_specific_settings).toEqual(pkg.browser_specific_settings);
    expect(manifest.browser_specific_settings.gecko.strict_min_version).toMatch(/^\d+/);
  });

  it("keeps the structural keys of the template", () => {
    expect(manifest.permissions).toEqual(template.permissions);
    expect(manifest.host_permissions).toEqual(template.host_permissions);
    expect(manifest.background).toEqual(template.background);
    expect(manifest.web_accessible_resources).toEqual(template.web_accessible_resources);
  });

  it("uses the MV3 action key", () => {
    expect((manifest.action as { default_popup: string }).default_popup).toBe("popup/popup.html");
    expect(manifest).not.toHaveProperty("browser_action");
  });

  it("keeps blocking webRequest for redirects", () => {
    expect(manifest.permissions).toEqual(
      expect.arrayContaining(["webRequest", "webRequestBlocking", "storage", "alarms"]),
    );
    expect(manifest.host_permissions).toEqual(["<all_urls>"]);
  });

  it("runs the background as an event page", () => {
    expect((manifest.background as { scripts: string[] }).scripts).toEqual(["background.js"]);
    expect(manifest.background).not.toHaveProperty("persistent");
  });

  it("declares web accessible resources in the MV3 shape", () => {
    for (const entry of manifest.web_accessible_resources as {
      resources: string[];
      matches: string[];
    }[]) {
      expect(entry.resources.length).toBeGreaterThan(0);
      expect(entry.matches).toContain("<all_urls>");
    }
  });

  it("rejects incomplete metadata", () => {
    expect(() => createManifest({ ...pkg, version: "" }, template)).toThrow(/version/);
    expect(() => createManifest({ ...pkg, description: "" }, template)).toThrow(/description/);
    expect(() => createManifest({ ...pkg, homepage: "ftp://example.com" }, template)).toThrow(
      /homepage/,
    );
  });

  it("requires a gecko id and the gecko settings", () => {
    const broken = structuredClone(pkg);
    broken.browser_specific_settings.gecko.id = "no-at-sign";
    expect(() => createManifest(broken, template)).toThrow(/gecko\.id|"id"/);

    const missing: PackageMetadata = structuredClone(pkg);
    delete (missing as Partial<PackageMetadata>).browser_specific_settings;
    expect(() => createManifest(missing, template)).toThrow(/browser_specific_settings/);
  });

  it("requires a Manifest V3 template", () => {
    expect(() => createManifest(pkg, { ...template, manifest_version: 2 })).toThrow(/version/);
  });
});
