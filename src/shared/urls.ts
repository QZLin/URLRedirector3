/**
 * External links used by the extension, kept in one place.
 *
 * The project links are read from `package.json`, which stays the single
 * source of truth: `homepage`, `repository` and the Firefox add-on listing.
 */

import { homepage, publishConfig, repository } from "../../package.json";

/** Project homepage, also injected into the built manifest. */
export const HOMEPAGE_URL = homepage;

/** Source repository, including clones and issue links. */
export const REPOSITORY_URL = repository.url;

/** Public listing on addons.mozilla.org. */
export const ADDON_URL = publishConfig["firefox-webstore"];

/** Mozilla docs for the `webRequest.ResourceType` enum used by the rule editor. */
export const MDN_RESOURCE_TYPE_URL =
  "https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/webRequest/ResourceType";

/** Mozilla docs for the `browser.i18n` API behind the localization helper. */
export const MDN_I18N_URL =
  "https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Internationalization";

/** Microsoft Graph API used by the OneDrive directory. */
export const GRAPH_URL = "https://graph.microsoft.com/v1.0";

/** Microsoft identity platform authorization endpoint. */
export const ONEDRIVE_AUTHORIZE_URL =
  "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";

/** Page that receives the OneDrive OAuth redirect. */
export const ONEDRIVE_REDIRECT_URL = "https://urlredirector.github.io/auth_onedrive.html";

/** Microsoft Graph REST documentation. */
export const ONEDRIVE_DOC_URL = "https://learn.microsoft.com/en-us/onedrive/developer/rest-api/";
