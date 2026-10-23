/**
 * Options page.
 */

import { onedrive } from "../cloud/onedrive";
import { onReady } from "../shared/dom";
import { getMessage, localizeDocument } from "../shared/i18n";
import { sendMessage, type ExtensionMessage } from "../shared/messaging";
import { OnlineURL, Rule, Storage } from "../shared/model";
import type { RuleData, StorageData } from "../shared/model";
import { readSettings, writeSettings } from "../shared/storage";
import {
  fadeOut,
  find,
  h,
  hideModal,
  initModals,
  must,
  setCollapsed,
  show,
  showModal,
} from "../shared/ui";

const RESOURCE_TYPE_URL =
  "https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/webRequest/ResourceType";
const ADDON_URL = "https://addons.mozilla.org/firefox/addon/urlredirector/";
const OPTION_TAB_URL = window.location.href;
const CLOUD_MESSAGE_MS = 8000;

const NOTIFICATIONS = {
  downloading: getMessage("downloading"),
  syncNotSupported: getMessage("syncNotSupported"),
  downloadingCloud: getMessage("downloading_cloud"),
  uploadingCloud: getMessage("uploading_cloud"),
  success: getMessage("success"),
  fail: getMessage("fail"),
};

let settings = new Storage();
let editingOnlineURL: OnlineURL | null = null;
let editingOnlineURLIndex = 0;
let editingRule: Rule | null = null;
let cancelCloudMessage: (() => void) | null = null;

/** Focus the options tab again, e.g. after the OAuth round trip. */
async function activateOptionsTab(): Promise<void> {
  const tabs = await browser.tabs.query({ url: OPTION_TAB_URL });
  const tabId = tabs[0]?.id;
  if (tabId !== undefined) {
    await browser.tabs.update(tabId, { active: true });
  }
}

function blockUI(message: string | undefined): void {
  must("#cloudMessage").textContent = message ?? "";
  showModal(must("#modalCloud"));
}

function unblockUI(): void {
  hideModal(must("#modalCloud"));
}

function showCloudMessage(message: string | undefined): void {
  const label = must("#spanCloudMessage");
  cancelCloudMessage?.();
  label.textContent = message ?? "";
  show(label);
  cancelCloudMessage = fadeOut(label, CLOUD_MESSAGE_MS);
}

function cloudDriver(): typeof onedrive | null {
  return must<HTMLSelectElement>("#sltCloud").value === "onedrive" ? onedrive : null;
}

/** Row index inside its table body. */
function rowIndex(row: Element): number {
  return Array.prototype.indexOf.call(row.parentElement?.children ?? [], row);
}

/** All data rows of a table body. */
function rowsOf(tableId: string): HTMLTableRowElement[] {
  return Array.from(document.querySelectorAll<HTMLTableRowElement>(`${tableId} tbody tr`));
}

/** Set the download-state label. */
function setDownloadState(message: string): void {
  must("#downloadState").textContent = message;
}

/* Cloud upload */
async function uploadToCloud(): Promise<void> {
  const driver = cloudDriver();
  if (!driver) {
    return;
  }
  blockUI(NOTIFICATIONS.uploadingCloud);
  try {
    await driver.upload("storage", JSON.stringify(settings, null, 2));
    showCloudMessage(NOTIFICATIONS.success);
  } catch (error) {
    console.error(error);
    showCloudMessage(NOTIFICATIONS.fail);
  } finally {
    await activateOptionsTab();
    unblockUI();
  }
}

/* Cloud download */
async function downloadFromCloud(): Promise<void> {
  const driver = cloudDriver();
  if (!driver) {
    return;
  }
  blockUI(NOTIFICATIONS.downloadingCloud);
  try {
    const data = await driver.download("storage");
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(data);
    } catch (error) {
      console.error(error);
    }
    if (parsed) {
      const source = new Storage();
      source.fromObject(parsed as StorageData);
      await writeSettings(source);
    }
    showCloudMessage(NOTIFICATIONS.success);
  } catch (error) {
    console.error(error);
    showCloudMessage(NOTIFICATIONS.fail);
  } finally {
    unblockUI();
  }
}

/* Move a row up or down */
function moveUpOrDown(row: HTMLTableRowElement, up: boolean): void {
  const index = rowIndex(row);
  const rows =
    row.closest("table")?.id === "tblOnlineURLs" ? settings.onlineURLs : settings.customRules;
  const neighbourIndex = up ? index - 1 : index + 1;
  const neighbour = rows[neighbourIndex];
  if (neighbour === undefined) {
    return;
  }
  if (up) {
    row.previousElementSibling?.before(row);
  } else {
    row.nextElementSibling?.after(row);
  }
  rows[neighbourIndex] = rows[index]!;
  rows[index] = neighbour;
}

/** Up/down button pair shared by both tables. */
function moveButtons(row: () => HTMLTableRowElement): HTMLElement[] {
  return [
    h(
      "button",
      {
        className: "btn btn-xs btn-info",
        on: { click: () => moveUpOrDown(row(), true) },
      },
      [h("span", { className: "glyphicon glyphicon-chevron-up" })],
    ),
    h(
      "button",
      {
        className: "btn btn-xs btn-info",
        style: { "margin-left": "2px" },
        on: { click: () => moveUpOrDown(row(), false) },
      },
      [h("span", { className: "glyphicon glyphicon-chevron-down" })],
    ),
  ];
}

/** Build a table cell wrapping `child`. */
function cell(child: Node | string, className?: string): HTMLTableCellElement {
  return h("td", { className }, [child]);
}

/* Create a URL row */
function createURLRow(onlineURL: OnlineURL): void {
  const table = must<HTMLTableElement>("#tblOnlineURLs");
  const tbody = table.tBodies[0]!;

  const urlInput = h("input", {
    className: "form-control",
    value: onlineURL.url ?? "",
    attributes: { type: "text" },
  });
  urlInput.dataset.old = onlineURL.url ?? "";
  urlInput.addEventListener("change", () => {
    const url = urlInput.value.trim();
    const duplicated = Array.from(
      tbody.querySelectorAll<HTMLInputElement>("input[type='text']"),
    ).some((other) => other !== urlInput && other.value.trim() === url);
    if (duplicated) {
      urlInput.value = urlInput.dataset.old ?? "";
      return;
    }
    urlInput.dataset.old = url;
    settings.onlineURLs[rowIndex(urlInput.closest("tr")!)]!.url = url;
  });

  const viewButton = h(
    "a",
    {
      className: "btn btn-xs btn-default",
      on: {
        click: () => {
          const target = settings.onlineURLs[rowIndex(viewButton.closest("tr")!)];
          if (target) {
            showOnlineURLModal(target);
          }
        },
      },
    },
    [h("i", { className: "glyphicon glyphicon-eye-open" })],
  );

  const autoCheckbox = h("input", {
    className: "checkbox middle",
    title: getMessage("autoUpdate"),
    checked: onlineURL.auto,
    attributes: { type: "checkbox" },
    on: {
      change: () => {
        settings.onlineURLs[rowIndex(autoCheckbox.closest("tr")!)!]!.auto = autoCheckbox.checked;
      },
    },
  });

  const enableCheckbox = h("input", {
    className: "checkbox middle",
    title: getMessage("enable"),
    checked: onlineURL.enable,
    attributes: { type: "checkbox" },
    on: {
      change: () => {
        settings.onlineURLs[rowIndex(enableCheckbox.closest("tr")!)!]!.enable =
          enableCheckbox.checked;
      },
    },
  });

  const row: HTMLTableRowElement = h("tr", {}, [
    cell(h("input", { className: "checkbox", attributes: { type: "checkbox" } })),
    cell(urlInput),
    h("td", { style: { width: "60px" } }, [viewButton]),
    cell(autoCheckbox),
    cell(enableCheckbox),
    cell(
      h(
        "span",
        {},
        moveButtons(() => row),
      ),
    ),
  ]);

  tbody.append(row);
}

/* Create a rule row */
function createRuleRow(rule: Rule): void {
  const tbody = must<HTMLTableElement>("#tblCustomRules").tBodies[0]!;

  const enableCheckbox = h("input", {
    title: getMessage("enable"),
    checked: rule.enable,
    attributes: { type: "checkbox" },
    on: {
      change: () => {
        settings.customRules[rowIndex(enableCheckbox.closest("tr")!)!]!.enable =
          enableCheckbox.checked;
      },
    },
  });

  const row: HTMLTableRowElement = h(
    "tr",
    {
      on: {
        dblclick: () => {
          editingRule = settings.customRules[rowIndex(row)] ?? null;
          showEditCustomRuleModal(editingRule);
        },
      },
    },
    [
      cell(h("input", { attributes: { type: "checkbox" } })),
      cell(h("span", { text: rule.description ?? "" })),
      cell(h("span", { text: rule.origin ?? "" })),
      cell(h("span", { text: rule.target ?? "" })),
      cell(enableCheckbox),
      cell(
        h(
          "span",
          {},
          moveButtons(() => row),
        ),
      ),
    ],
  );

  tbody.append(row);
}

/* Display everything */
function displayAll(): void {
  for (const checkbox of document.querySelectorAll<HTMLInputElement>("table thead input")) {
    checkbox.checked = false;
  }

  void sendMessage({ method: "isDownloading" }).then((isDownloading) => {
    setDownloadState(isDownloading ? (NOTIFICATIONS.downloading ?? "") : "");
  });

  const manifest = browser.runtime.getManifest();
  must("#version").textContent = manifest.version;
  must<HTMLAnchorElement>("#homepage").href = manifest.homepage_url ?? "";
  must<HTMLAnchorElement>("#addonPage").href = ADDON_URL;
  must<HTMLAnchorElement>("#resourceType").href = RESOURCE_TYPE_URL;

  if (settings.updateInterval) {
    must<HTMLSelectElement>("#onlineInterval").value = String(
      Math.round(settings.updateInterval / 60),
    );
  }
  must("#lblUpdatedAt").textContent = settings.updatedAt
    ? new Date(settings.updatedAt).toLocaleString()
    : "";
  must<HTMLInputElement>("#chbEnable").checked = settings.enable;

  if (!browser.storage.sync) {
    const label = must("#lblSync");
    label.classList.add("text-muted");
    label.title = NOTIFICATIONS.syncNotSupported ?? "";
    const sync = must<HTMLInputElement>("#chbSync");
    sync.disabled = true;
    sync.checked = false;
  } else {
    must<HTMLInputElement>("#chbSync").checked = settings.sync;
  }

  must("#tblOnlineURLs tbody").replaceChildren();
  for (const onlineURL of settings.onlineURLs) {
    createURLRow(onlineURL);
  }

  must("#tblCustomRules tbody").replaceChildren();
  for (const rule of settings.customRules) {
    createRuleRow(rule);
  }
}

/* Show the details of a subscription */
function showOnlineURLModal(onlineURL: OnlineURL): void {
  editingOnlineURL = onlineURL;
  editingOnlineURLIndex = settings.onlineURLs.indexOf(onlineURL);
  must<HTMLAnchorElement>("#linkOnlineURL").href = onlineURL.url ?? "";

  const tbody = must("#modalViewOnlineURL tbody");
  tbody.replaceChildren();
  for (const rule of onlineURL.rules) {
    const toggle = h("input", {
      className: "checkbox",
      checked: rule.enable,
      attributes: { type: "checkbox" },
    });
    toggle.addEventListener("change", () => {
      const ruleIndex = rowIndex(toggle.closest("tr")!);
      const edited = editingOnlineURL?.rules[ruleIndex];
      if (edited) {
        edited.enable = toggle.checked;
      }
      /* A manual change disables the automatic refresh of this subscription. */
      const mainRow = rowsOf("#tblOnlineURLs")[editingOnlineURLIndex];
      const auto = mainRow?.querySelectorAll<HTMLInputElement>("input[type='checkbox']")[1];
      if (auto) {
        auto.checked = false;
      }
      if (editingOnlineURL) {
        editingOnlineURL.auto = false;
      }
    });

    tbody.append(
      h("tr", {}, [
        cell(toggle),
        cell(
          h("span", {}, [
            h("span", { text: rule.origin ?? "" }),
            h("br"),
            h("span", { text: rule.target ?? "" }),
          ]),
        ),
      ]),
    );
  }
  showModal(must("#modalViewOnlineURL"));
}

/* Show the rule editor */
function showEditCustomRuleModal(rule: Rule | null): void {
  const methodsCollapse = must("#divMethods");
  const typesCollapse = must("#divTypes");
  for (const checkbox of document.querySelectorAll<HTMLInputElement>(
    "#divMethods input, #divTypes input",
  )) {
    checkbox.checked = false;
  }

  if (rule) {
    must<HTMLInputElement>("#txtDescription").value = rule.description ?? "";
    must<HTMLInputElement>("#txtOrigin").value = rule.origin ?? "";
    must<HTMLInputElement>("#txtTarget").value = rule.target ?? "";
    must<HTMLInputElement>("#txtExclude").value = rule.exclude ?? "";
    must<HTMLInputElement>("#txtExample").value = rule.example ?? "";
    setProcessRadio(rule.process);
    must<HTMLInputElement>("#txtTestResult").value = "";

    const methodAll = must<HTMLInputElement>("#cbMethodAll");
    methodAll.checked = rule.methods.length === 0;
    for (const method of rule.methods) {
      const checkbox = find<HTMLInputElement>(`#cbMethod_${method}`);
      if (checkbox) {
        checkbox.checked = true;
      }
    }
    setCollapsed(methodsCollapse, rule.methods.length === 0);

    const typeAll = must<HTMLInputElement>("#cbTypeAll");
    typeAll.checked = rule.types.length === 0;
    for (const type of rule.types) {
      const checkbox = find<HTMLInputElement>(`#cbType_${type}`);
      if (checkbox) {
        checkbox.checked = true;
      }
    }
    setCollapsed(typesCollapse, rule.types.length === 0);
  } else {
    for (const id of [
      "#txtDescription",
      "#txtOrigin",
      "#txtTarget",
      "#txtExclude",
      "#txtExample",
    ]) {
      must<HTMLInputElement>(id).value = "";
    }
    setProcessRadio("");
    must<HTMLInputElement>("#txtTestResult").value = "";
    must<HTMLInputElement>("#cbTypeAll").checked = true;
    must<HTMLInputElement>("#cbMethodAll").checked = true;
    setCollapsed(methodsCollapse, true);
    setCollapsed(typesCollapse, true);
  }

  testRule();
  showModal(must("#modalEditUserRule"));
}

function setProcessRadio(value: string | null | undefined): void {
  for (const radio of document.querySelectorAll<HTMLInputElement>("input[name='process']")) {
    radio.checked = radio.value === (value ?? "");
  }
}

function selectedProcess(): string {
  return document.querySelector<HTMLInputElement>("input[name='process']:checked")?.value ?? "";
}

/* Preview the rule against the example URL */
function testRule(): void {
  const rule = new Rule();
  rule.fromObject({
    origin: must<HTMLInputElement>("#txtOrigin").value,
    target: must<HTMLInputElement>("#txtTarget").value,
    exclude: must<HTMLInputElement>("#txtExclude").value,
    enable: true,
    process: selectedProcess() as RuleData["process"],
  });
  must<HTMLInputElement>("#txtTestResult").value =
    rule.redirect(must<HTMLInputElement>("#txtExample").value) ?? "";
}

/* Load the settings into the page */
async function reload(): Promise<void> {
  settings = await readSettings();
  displayAll();
}

async function saveOptions(): Promise<void> {
  settings.onlineURLs = settings.onlineURLs.filter((onlineURL) => onlineURL.url);
  settings.customRules = settings.customRules.filter((rule) => rule.origin && rule.target);
  await writeSettings(settings);
}

function collectCheckedValues(containerId: string, attribute: string): string[] {
  const values: string[] = [];
  for (const checkbox of document.querySelectorAll<HTMLInputElement>(
    `${containerId} input:checked`,
  )) {
    const value = checkbox.dataset[attribute];
    if (value) {
      values.push(value);
    }
  }
  return values;
}

function init(): void {
  localizeDocument();
  initModals();

  find("#lnkCloudUpload")?.addEventListener("click", () => void uploadToCloud());
  find("#lnkCloudDownload")?.addEventListener("click", () => void downloadFromCloud());

  must<HTMLInputElement>("#chbEnable").addEventListener("change", (event) => {
    settings.enable = (event.target as HTMLInputElement).checked;
  });
  must<HTMLInputElement>("#chbSync").addEventListener("change", (event) => {
    settings.sync = (event.target as HTMLInputElement).checked;
  });
  must<HTMLSelectElement>("#onlineInterval").addEventListener("change", (event) => {
    const minutes = Number.parseInt((event.target as HTMLSelectElement).value, 10);
    settings.updateInterval = Number.isNaN(minutes) ? 60 : Math.max(1, minutes * 60);
  });

  must("#btnReset").addEventListener("click", () => void reload());
  must("#btnSave").addEventListener("click", () => void saveOptions());
  must("#btnDownload").addEventListener("click", async () => {
    const isDownloading = await sendMessage({ method: "isDownloading" });
    setDownloadState(NOTIFICATIONS.downloading ?? "");
    if (!isDownloading) {
      await sendMessage({ method: "download" });
    }
  });

  /* Check all / uncheck all */
  for (const checkbox of document.querySelectorAll<HTMLInputElement>("table thead input")) {
    checkbox.addEventListener("click", () => {
      const table = checkbox.closest("table");
      for (const rowCheckbox of table?.querySelectorAll<HTMLInputElement>("tbody input") ?? []) {
        if (rowCheckbox === rowCheckbox.closest("tr")?.querySelector("input")) {
          rowCheckbox.checked = checkbox.checked;
        }
      }
    });
  }

  must("#btnAddOnlineURL").addEventListener("click", () => {
    const hasEmpty = Array.from(
      document.querySelectorAll<HTMLInputElement>("#tblOnlineURLs input[type='text']"),
    ).some((input) => input.value.trim() === "");
    if (hasEmpty) {
      return;
    }
    const onlineURL = new OnlineURL();
    onlineURL.enable = true;
    onlineURL.auto = true;
    settings.onlineURLs.push(onlineURL);
    createURLRow(onlineURL);
  });

  must("#btnDeleteOnlineURL").addEventListener("click", () => {
    deleteSelected("#tblOnlineURLs", (index) => settings.onlineURLs.splice(index, 1));
  });

  must("#btnAddCustomRule").addEventListener("click", () => {
    const hasEmpty = rowsOf("#tblCustomRules").some((row) => {
      const spans = row.querySelectorAll("span");
      return (spans[1]?.textContent ?? "") === "" && (spans[2]?.textContent ?? "") === "";
    });
    if (hasEmpty) {
      return;
    }
    editingRule = null;
    const rule = new Rule();
    rule.enable = true;
    showEditCustomRuleModal(rule);
  });

  must("#btnEditCustomRule").addEventListener("click", () => {
    const selectedIndex = rowsOf("#tblCustomRules").findIndex(
      (row) => row.querySelector<HTMLInputElement>("input[type='checkbox']")?.checked,
    );
    if (selectedIndex >= 0) {
      editingRule = settings.customRules[selectedIndex] ?? null;
      showEditCustomRuleModal(editingRule);
    }
  });

  must("#btnDeleteCustomRule").addEventListener("click", () => {
    deleteSelected("#tblCustomRules", (index) => settings.customRules.splice(index, 1));
  });

  for (const button of document.querySelectorAll<HTMLButtonElement>("button.remove")) {
    button.addEventListener("click", () => {
      const input = button.closest("div")?.querySelector<HTMLInputElement>("input[type='text']");
      if (input) {
        input.value = "";
      }
    });
  }

  for (const id of ["#txtExample", "#txtOrigin", "#txtTarget", "#txtExclude"]) {
    find(id)?.addEventListener("input", testRule);
  }
  for (const radio of document.querySelectorAll("input[name='process']")) {
    radio.addEventListener("change", testRule);
  }

  must<HTMLInputElement>("#cbTypeAll").addEventListener("change", (event) => {
    setCollapsed(must("#divTypes"), (event.target as HTMLInputElement).checked);
    for (const checkbox of document.querySelectorAll<HTMLInputElement>("#divTypes input")) {
      checkbox.checked = false;
    }
  });

  must<HTMLInputElement>("#cbMethodAll").addEventListener("change", (event) => {
    setCollapsed(must("#divMethods"), (event.target as HTMLInputElement).checked);
    for (const checkbox of document.querySelectorAll<HTMLInputElement>("#divMethods input")) {
      checkbox.checked = false;
    }
  });

  must("#btnConfirmCustomRule").addEventListener("click", () => {
    const origin = must<HTMLInputElement>("#txtOrigin");
    if (origin.value === "") {
      origin.focus();
      return;
    }
    const targetURL = must<HTMLInputElement>("#txtTarget");
    if (targetURL.value === "") {
      targetURL.focus();
      return;
    }

    let rule = editingRule;
    if (!rule) {
      rule = new Rule();
      rule.enable = true;
      settings.customRules.push(rule);
      editingRule = rule;
    }
    rule.description = must<HTMLInputElement>("#txtDescription").value;
    rule.origin = origin.value;
    rule.target = targetURL.value;
    rule.exclude = must<HTMLInputElement>("#txtExclude").value;
    rule.example = must<HTMLInputElement>("#txtExample").value;
    rule.process = selectedProcess();
    rule.methods = must<HTMLInputElement>("#cbMethodAll").checked
      ? []
      : collectCheckedValues("#divMethods", "method");
    rule.types = must<HTMLInputElement>("#cbTypeAll").checked
      ? []
      : collectCheckedValues("#divTypes", "type");

    displayAll();
    hideModal(must("#modalEditUserRule"));
  });

  must("#btnViewCustomeRule").addEventListener("click", () => {
    const userRules = { version: "1.0", rules: settings.customRules };
    must<HTMLTextAreaElement>("#modalViewUserRule textarea").value = JSON.stringify(
      userRules,
      null,
      2,
    );
    showModal(must("#modalViewUserRule"));
  });

  browser.runtime.onMessage.addListener((message: ExtensionMessage) => {
    if (message.method === "downloaded") {
      setDownloadState("");
      return undefined;
    }
    if (message.method === "downloadError" || message.method === "parseError") {
      const urls = Array.isArray(message.args) ? message.args : [];
      alert([getMessage(message.method), ...urls.map(String)].join("\n"));
      return undefined;
    }
    console.error("Unknown method", message.method);
    return undefined;
  });

  browser.storage.onChanged.addListener((_changes, area) => {
    if (area === "local") {
      void reload();
    }
  });

  void reload();
}

/** Delete every row whose first checkbox is selected. */
function deleteSelected(tableId: string, removeAt: (index: number) => void): void {
  const rows = rowsOf(tableId);
  for (let index = rows.length - 1; index >= 0; index--) {
    const row = rows[index]!;
    if (row.querySelector<HTMLInputElement>("input[type='checkbox']")?.checked) {
      removeAt(index);
      row.remove();
    }
  }
  const checkAll = document.querySelector<HTMLInputElement>(`${tableId} thead input`);
  if (checkAll) {
    checkAll.checked = false;
  }
}

onReady(init);
