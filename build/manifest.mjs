/**
 * Build the extension manifest from the metadata in `package.json`.
 *
 * `src/manifest.json` only holds the structural parts of the manifest
 * (permissions, entry points, icons, static resources). Everything that also
 * describes the package — name, description, version, homepage and the gecko
 * settings — lives in `package.json` alone, so a release touches one file
 * instead of keeping the same strings in sync in two places.
 */

const GECKO_ID_PATTERN = /^[^@\s]+@[^@\s]+$/;
const VERSION_PATTERN = /^\d+(\.\d+){1,3}$/;
const MIN_VERSION_PATTERN = /^\d+(\.\d+)*$/;

/** Keys that are always generated from `package.json`. */
const IDENTITY_KEYS = new Set([
  "name",
  "description",
  "version",
  "homepage_url",
  "browser_specific_settings",
]);

function fail(key, expectation) {
  throw new Error(`package.json: "${key}" ${expectation}`);
}

/** Read a required string field and optionally check its shape. */
function stringField(source, key, pattern) {
  const value = source?.[key];
  if (typeof value !== "string" || value.trim() === "") {
    fail(key, "must be a non-empty string");
  }
  if (pattern && !pattern.test(value)) {
    fail(key, `must match ${pattern}`);
  }
  return value;
}

/** Validate the gecko metadata that AMO needs from `package.json`. */
function checkGecko(settings) {
  if (!settings || typeof settings !== "object") {
    throw new Error('package.json: "browser_specific_settings" must be set');
  }
  const gecko = settings.gecko;
  if (!gecko || typeof gecko !== "object") {
    throw new Error('package.json: "browser_specific_settings.gecko" must be set');
  }
  stringField(gecko, "id", GECKO_ID_PATTERN);
  stringField(gecko, "strict_min_version", MIN_VERSION_PATTERN);

  const permissions = gecko.data_collection_permissions;
  if (permissions !== undefined) {
    const values = [...(permissions?.required ?? []), ...(permissions?.optional ?? [])];
    if (
      !Array.isArray(permissions?.required) ||
      values.some((value) => typeof value !== "string")
    ) {
      fail("browser_specific_settings.gecko.data_collection_permissions", "must list strings");
    }
  }

  if (settings.gecko_android !== undefined) {
    stringField(settings.gecko_android, "strict_min_version", MIN_VERSION_PATTERN);
  }
}

/**
 * Combine the template with the package metadata.
 *
 * The identity keys always come from `package.json`, even if the template
 * still carries a stale copy of them.
 *
 * @param {object} pkg parsed `package.json`
 * @param {object} template parsed `src/manifest.json`
 * @returns {object} the manifest to write into the build output
 */
export function createManifest(pkg, template) {
  if (!template || typeof template !== "object" || Array.isArray(template)) {
    throw new Error("src/manifest.json must contain a JSON object");
  }
  if (template.manifest_version !== 3) {
    throw new Error("src/manifest.json: manifest_version must be 3");
  }

  const name = stringField(pkg, pkg.displayName === undefined ? "name" : "displayName");
  const description = stringField(pkg, "description");
  const version = stringField(pkg, "version", VERSION_PATTERN);

  const homepage = stringField(pkg, "homepage");
  let homepageURL;
  try {
    homepageURL = new URL(homepage);
  } catch {
    fail("homepage", "must be an absolute URL");
  }
  if (!["http:", "https:"].includes(homepageURL.protocol)) {
    fail("homepage", "must use http or https");
  }

  checkGecko(pkg.browser_specific_settings);

  /*
   * Drop a stale copy of the identity keys so that only the values of
   * package.json survive, and keep the generated manifest in a readable order.
   */
  const structural = Object.fromEntries(
    Object.entries(template).filter(([key]) => !IDENTITY_KEYS.has(key)),
  );

  return {
    manifest_version: template.manifest_version,
    name,
    description,
    version,
    homepage_url: homepageURL.href.replace(/\/$/, ""),
    ...structural,
    browser_specific_settings: structuredClone(pkg.browser_specific_settings),
  };
}
