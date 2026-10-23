/**
 * Localization helper for extension pages.
 *
 * Markup opts in with `data-i18n_text` (replaces the text content) and
 * `data-i18n_attr_<name>` (sets the `<name>` attribute), see
 * https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Internationalization
 */

const TEXT_ATTRIBUTE = "data-i18n_text";
const ATTRIBUTE_PREFIX = "data-i18n_attr_";

/** Look up a locale message, or `undefined` when it is missing. */
export function getMessage(id: string | undefined): string | undefined {
  if (!id) {
    return undefined;
  }
  const message = browser.i18n.getMessage(id);
  // Firefox returns '"??' for unknown messages.
  return message && message !== '"??' ? message : undefined;
}

/** Localize every marked element below `root`. */
export function localizeDocument(root: ParentNode = document): void {
  for (const element of root.querySelectorAll<HTMLElement>("*")) {
    const textId = element.getAttribute(TEXT_ATTRIBUTE);
    if (textId) {
      const message = getMessage(textId);
      if (message) {
        element.textContent = message;
      }
    }
    for (const attribute of Array.from(element.attributes)) {
      if (!attribute.name.startsWith(ATTRIBUTE_PREFIX)) {
        continue;
      }
      const name = attribute.name.slice(ATTRIBUTE_PREFIX.length);
      const message = name ? getMessage(attribute.value) : undefined;
      if (message) {
        element.setAttribute(name, message);
      }
    }
  }
}
