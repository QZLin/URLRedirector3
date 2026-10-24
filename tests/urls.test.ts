import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ADDON_URL,
  HOMEPAGE_URL,
  MDN_I18N_URL,
  MDN_RESOURCE_TYPE_URL,
  ONEDRIVE_AUTHORIZE_URL,
  ONEDRIVE_DOC_URL,
  ONEDRIVE_REDIRECT_URL,
  REPOSITORY_URL,
} from "../src/shared/urls";

interface PackageJson {
  homepage: string;
  repository: { type: string; url: string };
  publishConfig: Record<string, string>;
}

const pkg = JSON.parse(await readFile(join(process.cwd(), "package.json"), "utf8")) as PackageJson;

describe("urls", () => {
  it("mirrors the project links of package.json", () => {
    expect(HOMEPAGE_URL).toBe(pkg.homepage);
    expect(REPOSITORY_URL).toBe(pkg.repository.url);
    expect(ADDON_URL).toBe(pkg.publishConfig["firefox-webstore"]);
  });

  it("only uses secure project links", () => {
    for (const url of [HOMEPAGE_URL, REPOSITORY_URL, ADDON_URL]) {
      expect(url).toMatch(/^https:\/\//);
    }
  });

  it("points the add-on link at the published listing", () => {
    expect(ADDON_URL).toBe("https://addons.mozilla.org/firefox/addon/urlredirector3/");
  });

  it("keeps the documentation and OneDrive endpoints on https", () => {
    for (const url of [
      MDN_I18N_URL,
      MDN_RESOURCE_TYPE_URL,
      ONEDRIVE_AUTHORIZE_URL,
      ONEDRIVE_DOC_URL,
      ONEDRIVE_REDIRECT_URL,
    ]) {
      expect(url).toMatch(/^https:\/\//);
    }
  });
});
