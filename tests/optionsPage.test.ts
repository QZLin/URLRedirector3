import { readFile } from "node:fs/promises";

import { JSDOM } from "jsdom";
import jqueryFactory from "jquery";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Storage } from "../src/shared/model";
import type { StorageData } from "../src/shared/model";

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

const sendMessage = vi.fn(async () => false);
const MANIFEST = {
  version: "9.9.9",
  homepage_url: "https://example.com/home",
  options_ui: { page: "options/options.html" },
};

let dom: JSDOM;

/** Load `options.html` into jsdom and expose the browser APIs the page uses. */
async function openOptionsPage(data: StorageData): Promise<void> {
  localData.storage = data;
  const html = await readFile("src/options/options.html", "utf8");
  dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ""), {
    url: "moz-extension://test/options/options.html",
  });

  const window = dom.window as unknown as Window & typeof globalThis;
  const createJQuery = jqueryFactory as unknown as (window: Window) => JQueryStatic;
  const $ = createJQuery(window as unknown as Window);
  // The Bootstrap plugins are not loaded; stub the few methods the page calls.
  for (const method of ["modal", "collapse", "fadeOut"]) {
    $.fn[method as "modal"] = function (this: JQuery) {
      return this;
    };
  }

  Object.assign(globalThis, {
    window,
    document: window.document,
    HTMLElement: window.HTMLElement,
    $,
    jQuery: $,
    alert: vi.fn(),
  });
  Object.defineProperty(globalThis, "navigator", {
    value: window.navigator,
    configurable: true,
  });
  Object.assign(globalThis, {
    browser: {
      i18n: { getMessage: (id: string) => `msg:${id}` },
      runtime: {
        getManifest: () => MANIFEST,
        sendMessage,
        onMessage: { addListener: vi.fn() },
      },
      storage: {
        local: storageArea(localData),
        sync: storageArea({}),
        onChanged: { addListener: vi.fn() },
      },
      tabs: {
        query: async () => [],
        update: vi.fn(),
        onUpdated: { addListener: vi.fn() },
        onRemoved: { addListener: vi.fn() },
      },
    },
  });

  vi.resetModules();
  await import("../src/options/index");
  await vi.waitFor(() => expect($("#version").text()).toBe("9.9.9"));
}

function rows(selector: string): Element[] {
  return Array.from(document.querySelectorAll(`${selector} tbody tr`));
}

beforeEach(() => {
  for (const key of Object.keys(localData)) {
    delete localData[key];
  }
  sendMessage.mockClear();
});

afterEach(() => {
  dom?.window.close();
});

describe("options page", () => {
  it("renders the stored subscriptions and rules", async () => {
    await openOptionsPage({
      enable: true,
      onlineURLs: [{ url: "https://rules.example/rules.json", enable: true, auto: false }],
      customRules: [
        { description: "demo", origin: "a.example", target: "b.example", enable: true },
      ],
    });

    expect(rows("#tblOnlineURLs")).toHaveLength(1);
    expect(rows("#tblCustomRules")).toHaveLength(1);
    expect($("#tblCustomRules tbody span").eq(1).text()).toBe("a.example");
    expect($("#chbEnable").prop("checked")).toBe(true);
  });

  it("localizes the static labels", async () => {
    await openOptionsPage({});
    expect($("#btnSave span").text()).toBe("msg:save");
    expect($("#sltCloud").parent().find("label").text()).toBe("msg:cloud");
  });

  it("adds and removes a subscription row", async () => {
    await openOptionsPage({ onlineURLs: [] });

    $("#btnAddOnlineURL").trigger("click");
    expect(rows("#tblOnlineURLs")).toHaveLength(1);

    $("#tblOnlineURLs tbody :checkbox").first().prop("checked", true);
    $("#btnDeleteOnlineURL").trigger("click");
    expect(rows("#tblOnlineURLs")).toHaveLength(0);
  });

  it("saves the edited rule", async () => {
    await openOptionsPage({ customRules: [] });

    $("#btnAddCustomRule").trigger("click");
    $("#txtOrigin").val("https://old.example");
    $("#txtTarget").val("https://new.example");
    $("#btnConfirmCustomRule").trigger("click");

    expect(rows("#tblCustomRules")).toHaveLength(1);

    $("#btnSave").trigger("click");
    await vi.waitFor(() => expect((localData.storage as StorageData).customRules).toHaveLength(1));

    const store = localData.storage as StorageData;
    expect(store.customRules?.[0]).toMatchObject({
      origin: "https://old.example",
      target: "https://new.example",
      enable: true,
    });
  });

  it("drops rules without an origin before saving", async () => {
    const settings = new Storage();
    settings.customRules.push(Object.assign(new Storage().customRules[0] ?? {}));
    await openOptionsPage({ customRules: [{ origin: "", target: "b.example", enable: true }] });

    $("#btnSave").trigger("click");
    await vi.waitFor(() => expect((localData.storage as StorageData).customRules).toHaveLength(0));
  });

  it("previews a rule against the example URL", async () => {
    await openOptionsPage({});

    $("#txtOrigin").val("example\\.com");
    $("#txtTarget").val("example.org");
    $("#txtOrigin").trigger("input");

    expect($("#txtTestResult").val()).toBe("");
    $("#txtExample").val("https://example.com/x");
    $("#txtExample").trigger("input");
    expect($("#txtTestResult").val()).toBe("https://example.org/x");
  });
});
