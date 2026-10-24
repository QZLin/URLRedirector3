/** Types for {@link createManifest} in `manifest.mjs`. */

export interface DataCollectionPermissions {
  required: string[];
  optional?: string[];
  [key: string]: unknown;
}

export interface FirefoxGeckoSettings {
  id: string;
  strict_min_version: string;
  data_collection_permissions?: DataCollectionPermissions;
  [key: string]: unknown;
}

export interface BrowserSpecificSettings {
  gecko: FirefoxGeckoSettings;
  gecko_android?: { strict_min_version: string; [key: string]: unknown };
  [key: string]: unknown;
}

/** The fields `createManifest` reads from `package.json`. */
export interface PackageMetadata {
  name: string;
  displayName?: string;
  description: string;
  version: string;
  homepage: string;
  browser_specific_settings: BrowserSpecificSettings;
}

/** The structural part of `src/manifest.json`. */
export interface ManifestTemplate {
  manifest_version: number;
  [key: string]: unknown;
}

export interface ExtensionManifest {
  manifest_version: number;
  name: string;
  description: string;
  version: string;
  homepage_url: string;
  browser_specific_settings: BrowserSpecificSettings;
  [key: string]: unknown;
}

export function createManifest(pkg: PackageMetadata, template: ManifestTemplate): ExtensionManifest;
