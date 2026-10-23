/**
 * Persistence of the extension settings.
 *
 * Settings live in `storage.local` and, when the user opts in, are mirrored to
 * `storage.sync` so that they follow the Firefox account.
 */

import { Storage } from "./model";
import type { StorageData } from "./model";

const SETTINGS_KEY = "storage";

type SettingsBag = { storage?: StorageData };

function toStorage(data: StorageData): Storage {
  const settings = new Storage();
  settings.fromObject(data);
  return settings;
}

async function readArea(area: browser.storage.StorageArea): Promise<SettingsBag> {
  return (await area.get(SETTINGS_KEY)) as SettingsBag;
}

/**
 * Read the settings, preferring `storage.sync` when the user enabled sync.
 *
 * A missing or broken sync area falls back to the local copy, and a first run
 * without any stored settings yields the defaults.
 */
export async function readSettings(): Promise<Storage> {
  const local = await readArea(browser.storage.local);

  if (local?.storage?.sync && browser.storage.sync) {
    try {
      const sync = await readArea(browser.storage.sync);
      if (sync?.storage) {
        return toStorage(sync.storage);
      }
    } catch (error) {
      console.warn("Could not read storage.sync, using storage.local", error);
    }
    return toStorage(local.storage);
  }

  if (local?.storage) {
    return toStorage(local.storage);
  }

  if (browser.storage.sync) {
    try {
      const sync = await readArea(browser.storage.sync);
      if (sync?.storage) {
        return toStorage(sync.storage);
      }
    } catch (error) {
      console.warn("Could not read storage.sync", error);
    }
  }

  return new Storage();
}

/** Persist the settings to every area the user opted into. */
export async function writeSettings(settings: Storage): Promise<void> {
  if (settings.sync && browser.storage.sync) {
    await browser.storage.sync.set({ storage: settings });
  }
  await browser.storage.local.set({ storage: settings });
}

/**
 * Keeps one settings instance in memory so that the blocking `webRequest`
 * listener does not have to hit storage for every single request.
 */
export class SettingsCache {
  #current: Storage | null = null;
  #pending: Promise<Storage> | null = null;

  get current(): Storage | null {
    return this.#current;
  }

  /** Resolve as soon as a loaded settings snapshot is available. */
  get(): Promise<Storage> {
    if (this.#current) {
      return Promise.resolve(this.#current);
    }
    this.#pending ??= this.reload();
    return this.#pending;
  }

  async reload(): Promise<Storage> {
    try {
      const settings = await readSettings();
      this.#current = settings;
      return settings;
    } finally {
      this.#pending = null;
    }
  }

  /** Drop the cached snapshot, e.g. after a failed write. */
  clear(): void {
    this.#current = null;
  }

  /** Load once and keep the cache in sync with `storage.local` changes. */
  start(): void {
    browser.storage.onChanged.addListener((_changes, area) => {
      if (area === "local") {
        void this.reload();
      }
    });
    void this.get();
  }
}
