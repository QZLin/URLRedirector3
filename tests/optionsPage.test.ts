import { readFile } from "node:fs/promises";

import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StorageData } from "../src/shared/model";
import { ADDON_URL, HOMEPAGE_URL, MDN_RESOURCE_TYPE_URL } from "../src/shared/urls";

const localData: Record<string, unknown> = {};
const storageListeners: ((changes: unknown, area: string) => unknown)[] = [];

function storageArea(data: Record<string, unknown>) {
  return {
    async get(key: string) {
      return { [key]: data[key] };
    },
    async set(items: Record<string, unknown>) {
      Object.assign(data, items);
      for (const listener of storageListeners) {
        listener({ storage: { newValue: items.storage } }, "local");
      }
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
      i18n: {
        getMessage: (id: string, substitutions?: string[]) =>
          substitutions ? `msg:${id}:${substitutions.join("|")}` : `msg:${id}`,
      },
      runtime: {
        getManifest: () => MANIFEST,
        sendMessage,
        onMessage: { addListener: vi.fn() },
      },
      storage: {
        local: storageArea(localData),
        sync: storageArea({}),
        onChanged: {
          addListener: (fn: (changes: unknown, area: string) => unknown) => {
            storageListeners.push(fn);
          },
        },
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

/** Dispatch a click on `selector` while Shift is held. */
function shiftClick(selector: string): void {
  document
    .querySelector(selector)
    ?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, shiftKey: true }));
}

/** Double-click a row, which opens the editor. */
function doubleClick(selector: string): void {
  document
    .querySelector(selector)
    ?.dispatchEvent(new dom.window.MouseEvent("dblclick", { bubbles: true }));
}

/** Make `row` draggable the way a press on its grip cell does. */
function pressGrip(row: Element): void {
  row.querySelector("td")!.dispatchEvent(new dom.window.MouseEvent("mousedown", { bubbles: true }));
}

/** jsdom has no DragEvent, so fake the type and the pointer position it needs. */
function dragEvent(type: string, clientY = 0): Event {
  const event = new dom.window.Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clientY", { value: clientY });
  return event;
}

/** Drag `source` onto the upper or lower half of `target`. */
function dragRow(source: Element, target: Element, below: boolean): void {
  source
    .querySelector(".drag-handle")!
    .dispatchEvent(new dom.window.MouseEvent("mousedown", { bubbles: true }));
  source.dispatchEvent(dragEvent("dragstart"));
  target.dispatchEvent(dragEvent("dragover", below ? 100 : 0));
  target.dispatchEvent(dragEvent("drop"));
  source.dispatchEvent(dragEvent("dragend"));
}

/** Origin column of the user rule table. */
function origins(): (string | null)[] {
  return Array.from(document.querySelectorAll("#tblCustomRules tbody .rule-origin")).map(
    (span) => span.textContent,
  );
}

function setValue(selector: string, value: string, event = "change"): void {
  const input = document.querySelector<HTMLInputElement>(selector)!;
  input.value = value;
  input.dispatchEvent(new dom.window.Event(event));
}

/** Open the import dialog, paste `text` and confirm. */
function importJSON(text: string): void {
  click("#btnImportCustomRule");
  document.querySelector<HTMLTextAreaElement>("#modalImportUserRule textarea")!.value = text;
  click("#btnConfirmImportRule");
}

/** Import status label next to the JSON buttons. */
function importState(): string | null | undefined {
  return document.querySelector("#importState")?.textContent;
}

beforeEach(() => {
  for (const key of Object.keys(localData)) {
    delete localData[key];
  }
  storageListeners.length = 0;
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
    const originCell = document.querySelector("#tblCustomRules tbody .rule-origin");
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

  it("links to the shared project and documentation URLs", async () => {
    await openOptionsPage({});
    expect(document.querySelector<HTMLAnchorElement>("#homepage")?.href).toBe(HOMEPAGE_URL);
    expect(document.querySelector<HTMLAnchorElement>("#addonPage")?.href).toBe(ADDON_URL);
    expect(document.querySelector<HTMLAnchorElement>("#resourceType")?.href).toBe(
      MDN_RESOURCE_TYPE_URL,
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

    expect(origins()).toEqual(["second.example", "first.example"]);

    click("#btnSave");
    await vi.waitFor(() =>
      expect((localData.storage as StorageData).customRules?.[0]?.origin).toBe("second.example"),
    );
  });

  it("moves a row to the top or to the bottom while Shift is held", async () => {
    await openOptionsPage({
      customRules: [
        { origin: "first.example", target: "x.example", enable: true },
        { origin: "second.example", target: "y.example", enable: true },
        { origin: "third.example", target: "z.example", enable: true },
      ],
    });

    shiftClick("#tblCustomRules tbody tr:nth-child(3) button:first-child");
    expect(origins()).toEqual(["third.example", "first.example", "second.example"]);

    shiftClick("#tblCustomRules tbody tr:nth-child(1) button:last-child");
    expect(origins()).toEqual(["first.example", "second.example", "third.example"]);

    click("#btnSave");
    await vi.waitFor(() =>
      expect((localData.storage as StorageData).customRules?.map((rule) => rule.origin)).toEqual([
        "first.example",
        "second.example",
        "third.example",
      ]),
    );
  });

  it("explains the move buttons in a tooltip", async () => {
    await openOptionsPage({
      customRules: [{ origin: "a.example", target: "b.example", enable: true }],
    });

    const [up, down] = document.querySelectorAll("#tblCustomRules tbody button");
    expect(up?.getAttribute("title")).toBe("msg:moveUp");
    expect(down?.getAttribute("title")).toBe("msg:moveDown");
  });

  it("adds a new rule on top while Shift is held", async () => {
    await openOptionsPage({
      customRules: [
        { origin: "first.example", target: "x.example", enable: true },
        { origin: "second.example", target: "y.example", enable: true },
      ],
    });

    shiftClick("#btnAddCustomRule");
    setValue("#txtOrigin", "top.example", "input");
    setValue("#txtTarget", "z.example", "input");
    click("#btnConfirmCustomRule");

    expect(origins()).toEqual(["top.example", "first.example", "second.example"]);

    click("#btnSave");
    await vi.waitFor(() =>
      expect((localData.storage as StorageData).customRules?.[0]?.origin).toBe("top.example"),
    );
  });

  it("adds a new rule on top when the heading is shift clicked", async () => {
    await openOptionsPage({
      customRules: [{ origin: "first.example", target: "x.example", enable: true }],
    });

    shiftClick("#hdrCustomRules");
    setValue("#txtOrigin", "top.example", "input");
    setValue("#txtTarget", "z.example", "input");
    click("#btnConfirmCustomRule");

    expect(origins()).toEqual(["top.example", "first.example"]);
  });

  it("adds a new rule on top when a rule row is shift clicked", async () => {
    await openOptionsPage({
      customRules: [{ origin: "first.example", target: "x.example", enable: true }],
    });

    shiftClick("#tblCustomRules tbody tr .rule-origin");
    setValue("#txtOrigin", "top.example", "input");
    setValue("#txtTarget", "z.example", "input");
    click("#btnConfirmCustomRule");

    expect(origins()).toEqual(["top.example", "first.example"]);
  });

  it("appends a new rule without Shift", async () => {
    await openOptionsPage({
      customRules: [{ origin: "first.example", target: "x.example", enable: true }],
    });

    click("#btnAddCustomRule");
    setValue("#txtOrigin", "last.example", "input");
    setValue("#txtTarget", "z.example", "input");
    click("#btnConfirmCustomRule");

    expect(origins()).toEqual(["first.example", "last.example"]);
  });

  it("starts a drag from anywhere in the grip cell", async () => {
    await openOptionsPage({
      customRules: [{ origin: "first.example", target: "x.example", enable: true }],
    });

    const row = document.querySelector<HTMLTableRowElement>("#tblCustomRules tbody tr")!;
    const gripCell = row.querySelector("td")!;
    expect(gripCell.classList.contains("drag-cell")).toBe(true);
    expect(gripCell.getAttribute("title")).toBe("msg:dragToReorder");

    pressGrip(row);
    expect(row.draggable).toBe(true);
  });

  it("reorders a row by dragging its grip", async () => {
    await openOptionsPage({
      customRules: [
        { origin: "first.example", target: "x.example", enable: true },
        { origin: "second.example", target: "y.example", enable: true },
        { origin: "third.example", target: "z.example", enable: true },
      ],
    });

    const handles = document.querySelectorAll("#tblCustomRules tbody .drag-handle");
    expect(handles).toHaveLength(3);
    expect(handles[0]?.closest("td")?.getAttribute("title")).toBe("msg:dragToReorder");

    const rowsOfTable = document.querySelectorAll("#tblCustomRules tbody tr");
    dragRow(rowsOfTable[2]!, rowsOfTable[0]!, false);
    expect(origins()).toEqual(["third.example", "first.example", "second.example"]);

    dragRow(rowsOfTable[1]!, rowsOfTable[2]!, true);
    expect(origins()).toEqual(["third.example", "second.example", "first.example"]);

    click("#btnSave");
    await vi.waitFor(() =>
      expect((localData.storage as StorageData).customRules?.map((rule) => rule.origin)).toEqual([
        "third.example",
        "second.example",
        "first.example",
      ]),
    );
  });

  it("puts a dragged row back when the drag is cancelled", async () => {
    await openOptionsPage({
      customRules: [
        { origin: "first.example", target: "x.example", enable: true },
        { origin: "second.example", target: "y.example", enable: true },
      ],
    });

    const tableRows = document.querySelectorAll("#tblCustomRules tbody tr");
    tableRows[0]!
      .querySelector(".drag-handle")!
      .dispatchEvent(new dom.window.MouseEvent("mousedown", { bubbles: true }));
    tableRows[0]!.dispatchEvent(dragEvent("dragstart"));
    tableRows[1]!.dispatchEvent(dragEvent("dragover", 100));
    tableRows[0]!.dispatchEvent(dragEvent("dragend"));

    expect(origins()).toEqual(["first.example", "second.example"]);
    expect((tableRows[0] as HTMLTableRowElement).draggable).toBe(false);
  });

  it("saves the edited rule", async () => {
    await openOptionsPage({ customRules: [] });

    click("#btnAddCustomRule");
    setValue("#txtOrigin", "https://old.example", "input");
    setValue("#txtTarget", "https://new.example", "input");
    click("#btnConfirmCustomRule");

    expect(rows("#tblCustomRules")).toHaveLength(1);
    expect(document.querySelector("#modalEditUserRule")?.classList.contains("show")).toBe(false);

    click("#btnSave");
    await vi.waitFor(() => expect((localData.storage as StorageData).customRules).toHaveLength(1));
    expect((localData.storage as StorageData).customRules?.[0]).toMatchObject({
      origin: "https://old.example",
      target: "https://new.example",
      enable: true,
    });
  });

  it("hides the delete button for a rule that is not stored yet", async () => {
    await openOptionsPage({ customRules: [] });

    click("#btnAddCustomRule");
    expect(document.querySelector<HTMLButtonElement>("#btnDeleteRule")?.hidden).toBe(true);
  });

  it("asks for confirmation before deleting the edited rule", async () => {
    await openOptionsPage({
      customRules: [{ description: "demo", origin: "gone.example", target: "b.example" }],
    });

    doubleClick("#tblCustomRules tbody tr");
    expect(document.querySelector<HTMLButtonElement>("#btnDeleteRule")?.hidden).toBe(false);

    click("#btnDeleteRule");
    expect(document.querySelector("#modalConfirmDelete")?.classList.contains("show")).toBe(true);
    expect(document.querySelector("#confirmMessage")?.textContent).toBe(
      "msg:confirmDeleteRule:demo",
    );
    /* The editor stays open behind the question, and the rule is still there. */
    expect(document.querySelector("#modalEditUserRule")?.classList.contains("show")).toBe(true);
    expect(origins()).toEqual(["gone.example"]);
  });

  it("keeps the rule when the deletion is cancelled", async () => {
    await openOptionsPage({ customRules: [{ origin: "gone.example", target: "b.example" }] });

    doubleClick("#tblCustomRules tbody tr");
    click("#btnDeleteRule");
    document.querySelector<HTMLElement>("#modalConfirmDelete [data-bs-dismiss='modal']")!.click();

    expect(document.querySelector("#modalConfirmDelete")?.classList.contains("show")).toBe(false);
    expect(origins()).toEqual(["gone.example"]);
  });

  it("deletes the edited rule once the deletion is confirmed", async () => {
    await openOptionsPage({
      customRules: [
        { origin: "first.example", target: "x.example", enable: true },
        { origin: "gone.example", target: "b.example", enable: true },
      ],
    });

    doubleClick("#tblCustomRules tbody tr:nth-child(2)");
    click("#btnDeleteRule");
    click("#btnConfirmDeleteRule");

    expect(origins()).toEqual(["first.example"]);
    expect(document.querySelector("#modalEditUserRule")?.classList.contains("show")).toBe(false);
    expect(document.querySelector("#modalConfirmDelete")?.classList.contains("show")).toBe(false);
    expect(document.querySelector(".modal-backdrop")).toBeNull();

    click("#btnSave");
    await vi.waitFor(() =>
      expect((localData.storage as StorageData).customRules?.map((rule) => rule.origin)).toEqual([
        "first.example",
      ]),
    );
  });

  it("closes the confirmation before the editor on Escape", async () => {
    await openOptionsPage({ customRules: [{ origin: "a.example", target: "b.example" }] });

    doubleClick("#tblCustomRules tbody tr");
    click("#btnDeleteRule");
    document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape" }));

    expect(document.querySelector("#modalConfirmDelete")?.classList.contains("show")).toBe(false);
    expect(document.querySelector("#modalEditUserRule")?.classList.contains("show")).toBe(true);
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
    expect(modal.classList.contains("show")).toBe(true);
    expect(modal.style.display).toBe("block");
    expect(document.querySelector(".modal-backdrop")).not.toBeNull();

    modal.querySelector<HTMLElement>("[data-bs-dismiss='modal']")?.click();
    expect(modal.classList.contains("show")).toBe(false);
    expect(document.querySelector(".modal-backdrop")).toBeNull();
  });

  it("dismisses the top modal on Escape", async () => {
    await openOptionsPage({});

    click("#btnAddCustomRule");
    document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape" }));

    expect(document.querySelector("#modalEditUserRule")?.classList.contains("show")).toBe(false);
  });

  it("expands the method filter once 'all' is unchecked", async () => {
    await openOptionsPage({});

    click("#btnAddCustomRule");
    const methods = document.querySelector<HTMLElement>("#divMethods")!;
    const methodAll = document.querySelector<HTMLInputElement>("#cbMethodAll")!;

    methodAll.checked = false;
    methodAll.dispatchEvent(new dom.window.Event("change"));
    expect(methods.classList.contains("show")).toBe(true);

    methodAll.checked = true;
    methodAll.dispatchEvent(new dom.window.Event("change"));
    expect(methods.classList.contains("show")).toBe(false);
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

  it("imports rules from a JSON rule file", async () => {
    await openOptionsPage({ customRules: [] });

    importJSON(
      JSON.stringify({
        version: "1.0",
        rules: [
          { origin: "a.example", target: "b.example", enable: true },
          { origin: "c.example", target: "d.example" },
        ],
      }),
    );

    expect(origins()).toEqual(["a.example", "c.example"]);
    expect(document.querySelector("#modalImportUserRule")?.classList.contains("show")).toBe(false);
    expect(importState()).toBe("msg:imported:2|0");

    click("#btnSave");
    await vi.waitFor(() => expect((localData.storage as StorageData).customRules).toHaveLength(2));
    expect((localData.storage as StorageData).customRules?.[1]).toMatchObject({
      origin: "c.example",
      target: "d.example",
      enable: true,
    });
  });

  it("imports a bare array of rules", async () => {
    await openOptionsPage({ customRules: [] });

    importJSON('[{"origin":"a.example","target":"b.example"}]');

    expect(origins()).toEqual(["a.example"]);
    click("#btnSave");
    await vi.waitFor(() =>
      expect((localData.storage as StorageData).customRules?.[0]?.enable).toBe(true),
    );
  });

  it("imports a single pasted rule object", async () => {
    await openOptionsPage({ customRules: [] });

    importJSON('{"origin":"a.example","target":"b.example"}');

    expect(origins()).toEqual(["a.example"]);
    expect(importState()).toBe("msg:imported:1|0");
  });

  it("imports the legacy gooreplacer layout", async () => {
    await openOptionsPage({ customRules: [] });

    importJSON(
      JSON.stringify({ rules: { "a\\.example": { dstURL: "b.example", enable: false } } }),
    );

    expect(origins()).toEqual(["a\\.example"]);
    click("#btnSave");
    await vi.waitFor(() =>
      expect((localData.storage as StorageData).customRules?.[0]?.enable).toBe(false),
    );
  });

  it("skips duplicated and incomplete rules while importing", async () => {
    await openOptionsPage({
      customRules: [{ origin: "a.example", target: "b.example", enable: true }],
    });

    importJSON(
      JSON.stringify([
        { origin: "a.example", target: "b.example" },
        { origin: "a.example", target: "other.example" },
        { origin: "", target: "x.example" },
        { target: "y.example" },
      ]),
    );

    expect(origins()).toEqual(["a.example", "a.example"]);
    expect(importState()).toBe("msg:imported:1|3");
  });

  it("reports invalid JSON and keeps the dialog open", async () => {
    await openOptionsPage({ customRules: [] });

    importJSON("{ nope");
    expect(document.querySelector("#modalImportUserRule")?.classList.contains("show")).toBe(true);
    expect(document.querySelector("#importError")?.textContent).toBe("msg:importInvalid");
    expect(rows("#tblCustomRules")).toHaveLength(0);
  });

  it("asks for content when the import box is empty", async () => {
    await openOptionsPage({ customRules: [] });

    importJSON("");
    expect(document.querySelector("#importError")?.textContent).toBe("msg:importEmpty");
  });

  it("reports an import where every entry was skipped", async () => {
    await openOptionsPage({ customRules: [] });

    importJSON('[{"origin":"a.example"}]');
    expect(document.querySelector("#importError")?.textContent).toBe("msg:importNothing");
    expect(importState()).toBeFalsy();
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

  describe("autosave", () => {
    it("writes a toggle without pressing save", async () => {
      await openOptionsPage({ enable: false });

      click("#chbEnable");

      await vi.waitFor(() => expect((localData.storage as StorageData).enable).toBe(true), {
        timeout: 2000,
      });
    });

    it("writes a rule toggle without pressing save", async () => {
      await openOptionsPage({
        customRules: [{ origin: "a.example", target: "b.example", enable: true }],
      });

      document.querySelector<HTMLInputElement>("#tblCustomRules tbody input.middle")!.click();

      await vi.waitFor(
        () => expect((localData.storage as StorageData).customRules?.[0]?.enable).toBe(false),
        { timeout: 2000 },
      );
    });

    it("writes a confirmed rule without pressing save", async () => {
      await openOptionsPage({ customRules: [] });

      click("#btnAddCustomRule");
      setValue("#txtOrigin", "a.example", "input");
      setValue("#txtTarget", "b.example", "input");
      click("#btnConfirmCustomRule");

      await vi.waitFor(
        () => expect((localData.storage as StorageData).customRules).toHaveLength(1),
        { timeout: 2000 },
      );
    });

    it("shows the save state next to the buttons", async () => {
      await openOptionsPage({ enable: false });

      click("#chbEnable");
      expect(document.querySelector("#saveState")?.textContent).toBe("msg:saving");

      await vi.waitFor(
        () => expect(document.querySelector("#saveState")?.textContent).toBe("msg:saved"),
        { timeout: 2000 },
      );
    });

    it("does not re-render the page for its own write", async () => {
      await openOptionsPage({ onlineURLs: [{ url: "https://one.example/rules.json" }] });
      const input = document.querySelector("#tblOnlineURLs input[type='text']");

      setValue("#tblOnlineURLs input[type='text']", "https://two.example/rules.json");

      await vi.waitFor(
        () =>
          expect((localData.storage as StorageData).onlineURLs?.[0]?.url).toBe(
            "https://two.example/rules.json",
          ),
        { timeout: 2000 },
      );
      expect(document.querySelector("#tblOnlineURLs input[type='text']")).toBe(input);
    });

    it("keeps a still empty row out of the payload but keeps its place", async () => {
      await openOptionsPage({ onlineURLs: [] });

      click("#btnAddOnlineURL");
      expect(rows("#tblOnlineURLs")).toHaveLength(1);

      await vi.waitFor(() => expect((localData.storage as StorageData).onlineURLs).toEqual([]), {
        timeout: 2000,
      });
      /* The empty row survived its own save, so the new URL belongs to it. */
      expect(rows("#tblOnlineURLs")).toHaveLength(1);

      setValue("#tblOnlineURLs tbody input[type='text']", "https://new.example/rules.json");
      await vi.waitFor(
        () =>
          expect((localData.storage as StorageData).onlineURLs?.[0]?.url).toBe(
            "https://new.example/rules.json",
          ),
        { timeout: 2000 },
      );
    });

    it("flushes a pending edit when the page goes away", async () => {
      await openOptionsPage({ enable: false });

      click("#chbEnable");
      dom.window.dispatchEvent(new dom.window.Event("pagehide"));

      await vi.waitFor(() => expect((localData.storage as StorageData).enable).toBe(true), {
        timeout: 2000,
      });
    });

    it("drops a pending edit when reset is pressed", async () => {
      await openOptionsPage({ enable: false });

      click("#chbEnable");
      click("#btnReset");

      await vi.waitFor(() =>
        expect(document.querySelector<HTMLInputElement>("#chbEnable")?.checked).toBe(false),
      );
      await new Promise((resolve) => setTimeout(resolve, 600));
      expect((localData.storage as StorageData).enable).toBe(false);
    });
  });
});
