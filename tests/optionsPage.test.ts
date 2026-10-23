import { readFile } from "node:fs/promises";

import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  Object.assign(globalThis, {
    window,
    document: window.document,
    HTMLElement: window.HTMLElement,
  });
  Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
  Object.assign(globalThis, { alert: vi.fn() });
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
  await vi.waitFor(() => expect(document.querySelector("#version")?.textContent).toBe("9.9.9"));
}

function rows(selector: string): Element[] {
  return Array.from(document.querySelectorAll(`${selector} tbody tr`));
}

function click(selector: string): void {
  document.querySelector<HTMLElement>(selector)?.click();
}

function setValue(selector: string, value: string, event = "change"): void {
  const input = document.querySelector<HTMLInputElement>(selector)!;
  input.value = value;
  input.dispatchEvent(new dom.window.Event(event));
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
    const originCell = document.querySelectorAll("#tblCustomRules tbody span")[1];
    expect(originCell?.textContent).toBe("a.example");
    expect(document.querySelector<HTMLInputElement>("#chbEnable")?.checked).toBe(true);
  });

  it("localizes the static labels", async () => {
    await openOptionsPage({});
    expect(document.querySelector("#btnSave span")?.textContent).toBe("msg:save");
    expect(document.querySelector<HTMLAnchorElement>("#addonPage")?.title).toBe("msg:reviews");
    expect(document.querySelector<HTMLInputElement>("#txtOrigin")?.placeholder).toBe(
      "msg:originPlaceholder",
    );
  });

  it("adds and removes a subscription row", async () => {
    await openOptionsPage({ onlineURLs: [] });

    click("#btnAddOnlineURL");
    expect(rows("#tblOnlineURLs")).toHaveLength(1);

    document.querySelector<HTMLInputElement>(
      "#tblOnlineURLs tbody input[type='checkbox']",
    )!.checked = true;
    click("#btnDeleteOnlineURL");
    expect(rows("#tblOnlineURLs")).toHaveLength(0);
  });

  it("does not add a row while another one is empty", async () => {
    await openOptionsPage({ onlineURLs: [] });

    click("#btnAddOnlineURL");
    click("#btnAddOnlineURL");
    expect(rows("#tblOnlineURLs")).toHaveLength(1);
  });

  it("rejects a duplicated subscription URL", async () => {
    await openOptionsPage({
      onlineURLs: [
        { url: "https://one.example/rules.json" },
        { url: "https://two.example/rules.json" },
      ],
    });

    const inputs = document.querySelectorAll<HTMLInputElement>("#tblOnlineURLs input[type='text']");
    setValue(
      "#tblOnlineURLs tbody tr:nth-child(2) input[type='text']",
      "https://one.example/rules.json",
    );
    expect(inputs[1]!.value).toBe("https://two.example/rules.json");

    setValue(
      "#tblOnlineURLs tbody tr:nth-child(2) input[type='text']",
      "https://three.example/rules.json",
    );
    expect(inputs[1]!.value).toBe("https://three.example/rules.json");
  });

  it("reorders rows and keeps the settings in sync", async () => {
    await openOptionsPage({
      customRules: [
        { origin: "first.example", target: "x.example", enable: true },
        { origin: "second.example", target: "y.example", enable: true },
      ],
    });

    click("#tblCustomRules tbody tr:nth-child(2) button:first-child");

    const origins = Array.from(
      document.querySelectorAll("#tblCustomRules tbody tr td:nth-child(3) span"),
    ).map((span) => span.textContent);
    expect(origins).toEqual(["second.example", "first.example"]);

    click("#btnSave");
    await vi.waitFor(() =>
      expect((localData.storage as StorageData).customRules?.[0]?.origin).toBe("second.example"),
    );
  });

  it("saves the edited rule", async () => {
    await openOptionsPage({ customRules: [] });

    click("#btnAddCustomRule");
    setValue("#txtOrigin", "https://old.example", "input");
    setValue("#txtTarget", "https://new.example", "input");
    click("#btnConfirmCustomRule");

    expect(rows("#tblCustomRules")).toHaveLength(1);
    expect(document.querySelector("#modalEditUserRule")?.classList.contains("in")).toBe(false);

    click("#btnSave");
    await vi.waitFor(() => expect((localData.storage as StorageData).customRules).toHaveLength(1));
    expect((localData.storage as StorageData).customRules?.[0]).toMatchObject({
      origin: "https://old.example",
      target: "https://new.example",
      enable: true,
    });
  });

  it("stores the selected request methods and types", async () => {
    await openOptionsPage({ customRules: [] });

    click("#btnAddCustomRule");
    setValue("#txtOrigin", "a.example", "input");
    setValue("#txtTarget", "b.example", "input");

    const methodAll = document.querySelector<HTMLInputElement>("#cbMethodAll")!;
    methodAll.checked = false;
    methodAll.dispatchEvent(new dom.window.Event("change"));
    document.querySelector<HTMLInputElement>("#cbMethod_POST")!.checked = true;

    click("#btnConfirmCustomRule");
    click("#btnSave");

    await vi.waitFor(() =>
      expect((localData.storage as StorageData).customRules?.[0]?.methods).toEqual(["POST"]),
    );
  });

  it("drops rules without an origin before saving", async () => {
    await openOptionsPage({ customRules: [{ origin: "", target: "b.example", enable: true }] });

    click("#btnSave");
    await vi.waitFor(() => expect((localData.storage as StorageData).customRules).toHaveLength(0));
  });

  it("previews a rule against the example URL", async () => {
    await openOptionsPage({});

    setValue("#txtOrigin", "example\\.com", "input");
    setValue("#txtTarget", "example.org", "input");
    setValue("#txtExample", "https://example.com/x", "input");

    expect(document.querySelector<HTMLInputElement>("#txtTestResult")?.value).toBe(
      "https://example.org/x",
    );
  });

  it("opens and dismisses modals", async () => {
    await openOptionsPage({});

    click("#btnAddCustomRule");
    const modal = document.querySelector<HTMLElement>("#modalEditUserRule")!;
    expect(modal.classList.contains("in")).toBe(true);
    expect(modal.style.display).toBe("block");
    expect(document.querySelector(".modal-backdrop")).not.toBeNull();

    modal.querySelector<HTMLElement>("[data-dismiss='modal']")?.click();
    expect(modal.classList.contains("in")).toBe(false);
    expect(document.querySelector(".modal-backdrop")).toBeNull();
  });

  it("dismisses the top modal on Escape", async () => {
    await openOptionsPage({});

    click("#btnAddCustomRule");
    document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape" }));

    expect(document.querySelector("#modalEditUserRule")?.classList.contains("in")).toBe(false);
  });

  it("expands the method filter once 'all' is unchecked", async () => {
    await openOptionsPage({});

    click("#btnAddCustomRule");
    const methods = document.querySelector<HTMLElement>("#divMethods")!;
    const methodAll = document.querySelector<HTMLInputElement>("#cbMethodAll")!;

    methodAll.checked = false;
    methodAll.dispatchEvent(new dom.window.Event("change"));
    expect(methods.classList.contains("in")).toBe(true);

    methodAll.checked = true;
    methodAll.dispatchEvent(new dom.window.Event("change"));
    expect(methods.classList.contains("in")).toBe(false);
  });

  it("shows the rules as JSON", async () => {
    await openOptionsPage({
      customRules: [{ origin: "a.example", target: "b.example", enable: true }],
    });

    click("#btnViewCustomeRule");
    const text =
      document.querySelector<HTMLTextAreaElement>("#modalViewUserRule textarea")?.value ?? "";

    expect(JSON.parse(text).rules).toHaveLength(1);
  });

  it("marks the table check-all state", async () => {
    await openOptionsPage({
      customRules: [{ origin: "a.example", target: "b.example", enable: true }],
    });

    const checkAll = document.querySelector<HTMLInputElement>("#tblCustomRules thead input")!;
    checkAll.click();

    expect(document.querySelector<HTMLInputElement>("#tblCustomRules tbody input")?.checked).toBe(
      true,
    );
  });
});
