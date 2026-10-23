/**
 * Background event page: applies the redirect rules and refreshes the online
 * rule subscriptions.
 */

import type { ExtensionMessage } from "../shared/messaging";
import { notify } from "../shared/messaging";
import { parseRuleFile, toOnlineURL } from "../shared/onlineRules";
import { SettingsCache, writeSettings } from "../shared/storage";

const ALARM_NAME = "download";
const DEFAULT_INTERVAL_SECONDS = 900;
const MINIMUM_INTERVAL_MINUTES = 1;

const settings = new SettingsCache();
let downloading = false;

class RuleFileError extends Error {}

/** Arm the periodic refresh with the interval configured by the user. */
async function scheduleRefresh(): Promise<void> {
  const current = await settings.get();
  const configured = Number.parseInt(String(current.updateInterval ?? ""), 10);
  const seconds =
    Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_INTERVAL_SECONDS;
  const minutes = Math.max(MINIMUM_INTERVAL_MINUTES, Math.ceil(seconds / 60));
  browser.alarms.create(ALARM_NAME, { periodInMinutes: minutes });
}

/** Download every subscription that is enabled and marked for automatic updates. */
async function downloadOnlineURLs(): Promise<void> {
  if (downloading) {
    return;
  }
  const current = await settings.get();
  const targets = current.onlineURLs
    .filter((onlineURL) => onlineURL.auto && onlineURL.enable && onlineURL.url)
    .map((onlineURL) => onlineURL.url as string);

  if (targets.length === 0) {
    notify({ method: "downloaded" });
    return;
  }

  downloading = true;
  const downloadErrors: string[] = [];
  const parseErrors: string[] = [];

  try {
    await Promise.all(
      targets.map(async (url) => {
        try {
          const response = await fetch(url);
          if (!response.ok) {
            throw new RuleFileError(`HTTP ${response.status}`);
          }
          const onlineURL = toOnlineURL(parseRuleFile(await response.text()), url);
          const index = current.onlineURLs.findIndex((entry) => entry.url === url);
          if (index >= 0) {
            current.onlineURLs[index] = onlineURL;
          }
        } catch (error) {
          if (error instanceof RuleFileError) {
            downloadErrors.push(url);
          } else {
            parseErrors.push(url);
          }
          console.error(`Could not refresh ${url}`, error);
        }
      }),
    );
  } finally {
    downloading = false;
  }

  notify({ method: "downloaded" });
  if (downloadErrors.length > 0) {
    notify({ method: "downloadError", args: downloadErrors });
  }
  if (parseErrors.length > 0) {
    notify({ method: "parseError", args: parseErrors });
  }

  current.updatedAt = new Date().toISOString();
  await writeSettings(current);
}

/** Answer the popup/options page with the current download state. */
function handleMessage(message: ExtensionMessage): Promise<unknown> | undefined {
  if (message?.method === "download") {
    void downloadOnlineURLs();
    return undefined;
  }
  if (message?.method === "isDownloading") {
    return Promise.resolve(downloading);
  }
  console.error("Unknown method", message?.method);
  return undefined;
}

/** Redirect a request according to the stored rules. */
async function handleRedirect(
  details: browser.webRequest._OnBeforeRequestDetails,
): Promise<browser.webRequest.BlockingResponse> {
  if (!details.url) {
    return {};
  }
  const current = await settings.get();
  if (!current.enable) {
    return {};
  }
  const newURL = current.redirect(details.url, details.method, details.type);
  return newURL ? { redirectUrl: newURL } : {};
}

/* Listeners are registered synchronously so the event page wakes up for them. */
browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    void downloadOnlineURLs();
  }
});

browser.runtime.onMessage.addListener(handleMessage);

browser.storage.onChanged.addListener((_changes, area) => {
  if (area === "local") {
    void settings.get().then(scheduleRefresh);
  }
});

browser.webRequest.onBeforeRequest.addListener(handleRedirect, { urls: ["<all_urls>"] }, [
  "blocking",
]);

void settings.get().then(scheduleRefresh);
settings.start();
