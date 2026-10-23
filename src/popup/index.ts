/**
 * Toolbar popup.
 */

import { onReady } from "../shared/dom";
import { localizeDocument } from "../shared/i18n";
import { Storage } from "../shared/model";
import { readSettings, writeSettings } from "../shared/storage";

let settings = new Storage();

function displayAll(): void {
  const enable = document.querySelector<HTMLInputElement>("#chbEnable");
  if (enable) {
    enable.checked = settings.enable;
  }
  const updatedAt = document.querySelector("#updatedAt");
  if (updatedAt) {
    updatedAt.textContent = settings.updatedAt
      ? new Date(settings.updatedAt).toLocaleTimeString()
      : "";
  }
}

async function reload(): Promise<void> {
  settings = await readSettings();
  displayAll();
}

function init(): void {
  localizeDocument();

  document.querySelector("#chbEnable")?.addEventListener("change", (event) => {
    void (async () => {
      const fresh = await readSettings();
      fresh.enable = (event.target as HTMLInputElement).checked;
      await writeSettings(fresh);
    })();
  });

  document.querySelector("#btnOptions")?.addEventListener("click", () => {
    void (async () => {
      await browser.runtime.openOptionsPage();
      window.close();
    })();
  });

  browser.storage.onChanged.addListener((_changes, area) => {
    if (area === "local") {
      void reload();
    }
  });

  void reload();
}

onReady(init);
