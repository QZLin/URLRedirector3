import { readFile } from "node:fs/promises";

import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const localData: Record<string, unknown> = {};

function storageArea(data: Record<string, unknown>) {
  return {
    async get(key: string) {
      return { [key]: data[key] };
    },
    async set(items: Record<string, unknown>) {
      Object.assign(data, items);
    },
  };
}

const openOptionsPage = vi.fn(async () => undefined);
let dom: JSDOM;

async function openPopup(data: Record<string, unknown>): Promise<void> {
  localData.storage = data;
  const html = await readFile("src/popup/popup.html", "utf8");
  dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ""), {
    url: "moz-extension://test/popup/popup.html",
  });
  const window = dom.window as unknown as Window & typeof globalThis;
  Object.assign(globalThis, { window, document: window.document });
  Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
  Object.assign(globalThis, {
    browser: {
      i18n: { getMessage: (id: string) => `msg:${id}` },
      runtime: { openOptionsPage, onMessage: { addListener: vi.fn() } },
      storage: {
        local: storageArea(localData),
        sync: storageArea({}),
        onChanged: { addListener: vi.fn() },
      },
    },
  });

  vi.resetModules();
  await import("../src/popup/index");
  await vi.waitFor(() => expect(document.querySelector("#chbEnable")).not.toBeNull());
}

beforeEach(() => {
  for (const key of Object.keys(localData)) {
    delete localData[key];
  }
  openOptionsPage.mockClear();
});

afterEach(() => {
  dom?.window.close();
});

describe("popup", () => {
  it("reflects the stored state", async () => {
    await openPopup({ enable: true, updatedAt: "2026-01-02T03:04:05.000Z" });

    await vi.waitFor(() =>
      expect(document.querySelector<HTMLInputElement>("#chbEnable")?.checked).toBe(true),
    );
    expect(document.querySelector("#updatedAt")?.textContent).not.toBe("");
  });

  it("persists a toggle", async () => {
    await openPopup({ enable: false });

    const checkbox = document.querySelector<HTMLInputElement>("#chbEnable")!;
    checkbox.checked = true;
    checkbox.dispatchEvent(new dom.window.Event("change"));

    await vi.waitFor(() =>
      expect((localData.storage as Record<string, unknown>).enable).toBe(true),
    );
  });

  it("opens the options page", async () => {
    await openPopup({});

    document.querySelector<HTMLButtonElement>("#btnOptions")!.click();

    await vi.waitFor(() => expect(openOptionsPage).toHaveBeenCalled());
  });
});
