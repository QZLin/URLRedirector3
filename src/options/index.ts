/**
 * Options page.
 */

import { onedrive } from "../cloud/onedrive";
import { onReady } from "../shared/dom";
import { getMessage, localizeDocument } from "../shared/i18n";
import { sendMessage, type ExtensionMessage } from "../shared/messaging";
import { OnlineURL, Rule, Storage } from "../shared/model";
import type { RuleData, StorageData } from "../shared/model";
import { parseRuleList } from "../shared/onlineRules";
import { readSettings, writeSettings } from "../shared/storage";
import { ADDON_URL, HOMEPAGE_URL, MDN_RESOURCE_TYPE_URL } from "../shared/urls";
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

const OPTION_TAB_URL = window.location.href;
const CLOUD_MESSAGE_MS = 8000;
/** Quiet period after an edit before it is written, so typing is not written per key. */
const SAVE_DELAY_MS = 400;
/** How long the "saved" confirmation stays visible. */
const SAVE_MESSAGE_MS = 3000;

const NOTIFICATIONS = {
  downloading: getMessage("downloading"),
  syncNotSupported: getMessage("syncNotSupported"),
  downloadingCloud: getMessage("downloading_cloud"),
  uploadingCloud: getMessage("uploading_cloud"),
  success: getMessage("success"),
  fail: getMessage("fail"),
  saving: getMessage("saving"),
  saved: getMessage("saved"),
  importEmpty: getMessage("importEmpty"),
  importInvalid: getMessage("importInvalid"),
  importNothing: getMessage("importNothing"),
};

let settings = new Storage();
let editingOnlineURL: OnlineURL | null = null;
let editingOnlineURLIndex = 0;
let editingRule: Rule | null = null;
/** Rule the delete confirmation is about to remove. */
let pendingDeletion: Rule | null = null;
/** Insert the next new rule at the top of the list instead of at its end. */
let addRuleAtTop = false;
let cancelCloudMessage: (() => void) | null = null;
let cancelImportMessage: (() => void) | null = null;
let cancelSaveMessage: (() => void) | null = null;
/** Pending debounced write. */
let saveTimer: number | null = null;
/** JSON of the last payload written, used to tell our own storage event apart. */
let lastWritten: string | null = null;
/** Serializes writes so that a slow one cannot land after a newer one. */
let writing: Promise<void> = Promise.resolve();

/** Row being dragged, with its original position and whether it was dropped. */
let dragState: { row: HTMLTableRowElement; from: number; dropped: boolean } | null = null;

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

function showImportError(message: string | undefined): void {
  must("#importError").textContent = message ?? "";
}

/** Report the outcome of an import next to the buttons, then fade it away. */
function showImportState(message: string | undefined): void {
  const label = must("#importState");
  cancelImportMessage?.();
  label.textContent = message ?? "";
  show(label);
  cancelImportMessage = fadeOut(label, CLOUD_MESSAGE_MS);
}

/** Whether a parsed JSON entry holds the minimum of a usable rule. */
function isImportableRule(entry: unknown): entry is RuleData {
  if (!entry || typeof entry !== "object") {
    return false;
  }
  const rule = entry as RuleData;
  return (
    typeof rule.origin === "string" &&
    rule.origin !== "" &&
    typeof rule.target === "string" &&
    rule.target !== ""
  );
}

/**
 * Append the rules pasted into the import dialog.
 *
 * Invalid entries and rules that already exist are skipped, so pasting the
 * same file twice changes nothing. Like every other edit of this page the
 * result is kept in memory and then written by the autosave.
 */
function importRules(): void {
  const textarea = must<HTMLTextAreaElement>("#modalImportUserRule textarea");
  const content = textarea.value.trim();
  if (!content) {
    showImportError(NOTIFICATIONS.importEmpty);
    textarea.focus();
    return;
  }

  let entries: RuleData[];
  try {
    entries = parseRuleList(content);
  } catch (error) {
    console.error(error);
    showImportError(NOTIFICATIONS.importInvalid);
    textarea.focus();
    return;
  }

  const imported: Rule[] = [];
  let skipped = 0;
  for (const entry of entries) {
    if (!isImportableRule(entry)) {
      skipped++;
      continue;
    }
    const duplicated = [...settings.customRules, ...imported].some(
      (rule) => rule.origin === entry.origin && rule.target === entry.target,
    );
    if (duplicated) {
      skipped++;
      continue;
    }
    const rule = new Rule();
    rule.fromObject({
      ...entry,
      enable: entry.enable ?? true,
      methods: entry.methods ?? [],
      types: entry.types ?? [],
    });
    imported.push(rule);
  }

  if (imported.length === 0) {
    showImportError(skipped > 0 ? NOTIFICATIONS.importNothing : NOTIFICATIONS.importEmpty);
    return;
  }

  settings.customRules.push(...imported);
  displayAll();
  hideModal(must("#modalImportUserRule"));
  showImportState(getMessage("imported", [String(imported.length), String(skipped)]) ?? undefined);
  scheduleSave();
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

/** The settings array of the table that contains `row`. */
function rowsFor(row: Element): unknown[] {
  const table = row.closest("table");
  return (table?.id === "tblOnlineURLs" ? settings.onlineURLs : settings.customRules) as unknown[];
}

/** Move `row` to `toIndex` inside its table body, without touching the settings. */
function moveDom(row: HTMLTableRowElement, toIndex: number): void {
  const parent = row.parentElement;
  if (!parent) {
    return;
  }
  const current = Array.prototype.indexOf.call(parent.children, row) as number;
  if (current === toIndex) {
    return;
  }
  /* Moving down means the row leaves its slot first, hence the extra offset. */
  const reference =
    toIndex > current ? (parent.children[toIndex + 1] ?? null) : (parent.children[toIndex] ?? null);
  parent.insertBefore(row, reference);
}

/** Move a row, keeping the settings array in the same order as the table. */
function moveRow(row: HTMLTableRowElement, toIndex: number): void {
  const rows = rowsFor(row);
  const from = rowIndex(row);
  if (toIndex < 0 || toIndex >= rows.length || toIndex === from) {
    return;
  }
  moveDom(row, toIndex);
  const [moved] = rows.splice(from, 1);
  rows.splice(toIndex, 0, moved);
  scheduleSave();
}

/**
 * Up/down button pair shared by both tables.
 *
 * Holding Shift jumps to the first or last position instead of one step; the
 * tooltip of each button describes both behaviours.
 */
function moveButtons(row: () => HTMLTableRowElement): HTMLElement[] {
  const buttons = [
    { icon: "bi-chevron-up", title: getMessage("moveUp"), direction: -1 },
    { icon: "bi-chevron-down", title: getMessage("moveDown"), direction: 1 },
  ];
  return buttons.map(({ icon, title, direction }) =>
    h(
      "button",
      {
        className: "btn btn-xs btn-info",
        title,
        style: direction > 0 ? { "margin-left": "2px" } : {},
        on: {
          click: (event) => {
            const current = row();
            const toIndex = (event as MouseEvent).shiftKey
              ? direction < 0
                ? 0
                : rowsFor(current).length - 1
              : rowIndex(current) + direction;
            moveRow(current, toIndex);
          },
        },
      },
      [h("span", { className: `bi ${icon}` })],
    ),
  );
}

/**
 * Cell holding the grip that turns its row into a drag source.
 *
 * The listener sits on the cell, not on the icon, so the whole grip column is
 * an easy target; only the grip column toggles `draggable`, so text fields and
 * checkboxes keep their normal mouse behaviour.
 */
function dragCell(row: () => HTMLTableRowElement): HTMLTableCellElement {
  const cell = h("td", { className: "drag-cell", title: getMessage("dragToReorder") }, [
    h("span", { className: "bi bi-list drag-handle", attributes: { "aria-hidden": "true" } }),
  ]);
  cell.addEventListener("mousedown", () => {
    row().draggable = true;
  });
  return cell;
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
    scheduleSave();
  });

  const viewButton = h(
    "a",
    {
      className: "btn btn-xs btn-outline-secondary",
      on: {
        click: () => {
          const target = settings.onlineURLs[rowIndex(viewButton.closest("tr")!)];
          if (target) {
            showOnlineURLModal(target);
          }
        },
      },
    },
    [h("i", { className: "bi bi-eye" })],
  );

  const autoCheckbox = h("input", {
    className: "form-check-input middle",
    title: getMessage("autoUpdate"),
    checked: onlineURL.auto,
    attributes: { type: "checkbox" },
    on: {
      change: () => {
        settings.onlineURLs[rowIndex(autoCheckbox.closest("tr")!)!]!.auto = autoCheckbox.checked;
        scheduleSave();
      },
    },
  });

  const enableCheckbox = h("input", {
    className: "form-check-input middle",
    title: getMessage("enable"),
    checked: onlineURL.enable,
    attributes: { type: "checkbox" },
    on: {
      change: () => {
        settings.onlineURLs[rowIndex(enableCheckbox.closest("tr")!)!]!.enable =
          enableCheckbox.checked;
        scheduleSave();
      },
    },
  });

  const row: HTMLTableRowElement = h("tr", {}, [
    dragCell(() => row),
    cell(h("input", { className: "form-check-input", attributes: { type: "checkbox" } })),
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
    className: "form-check-input middle",
    title: getMessage("enable"),
    checked: rule.enable,
    attributes: { type: "checkbox" },
    on: {
      change: () => {
        settings.customRules[rowIndex(enableCheckbox.closest("tr")!)!]!.enable =
          enableCheckbox.checked;
        scheduleSave();
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
        /* Shift+click on the row (but not on a control) adds a rule on top. */
        click: (event) => {
          const target = event.target as Element | null;
          if ((event as MouseEvent).shiftKey && !target?.closest("input, button, a")) {
            startNewRule(true);
          }
        },
      },
    },
    [
      dragCell(() => row),
      cell(h("input", { className: "form-check-input", attributes: { type: "checkbox" } })),
      cell(h("span", { className: "rule-description", text: rule.description ?? "" })),
      cell(h("span", { className: "rule-origin", text: rule.origin ?? "" })),
      cell(h("span", { className: "rule-target", text: rule.target ?? "" })),
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
  must<HTMLAnchorElement>("#homepage").href = HOMEPAGE_URL;
  must<HTMLAnchorElement>("#addonPage").href = ADDON_URL;
  must<HTMLAnchorElement>("#resourceType").href = MDN_RESOURCE_TYPE_URL;

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
    label.classList.add("text-body-secondary");
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
      className: "form-check-input",
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
      scheduleSave();
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
    must("#btnDeleteRule").hidden = false;
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
    must("#btnDeleteRule").hidden = true;
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

/** Open the editor for a new rule, which is appended or put on top once confirmed. */
function startNewRule(atTop: boolean): void {
  const hasEmpty = rowsOf("#tblCustomRules").some(
    (row) =>
      (row.querySelector(".rule-origin")?.textContent ?? "") === "" &&
      (row.querySelector(".rule-target")?.textContent ?? "") === "",
  );
  if (hasEmpty) {
    return;
  }
  addRuleAtTop = atTop;
  editingRule = null;
  showEditCustomRuleModal(null);
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

/** Show a save state next to the buttons; `fade` clears it again after a while. */
function setSaveState(message: string | undefined, fade = false): void {
  const label = must("#saveState");
  cancelSaveMessage?.();
  cancelSaveMessage = null;
  label.textContent = message ?? "";
  if (!message) {
    return;
  }
  show(label);
  if (fade) {
    cancelSaveMessage = fadeOut(label, SAVE_MESSAGE_MS);
  }
}

/**
 * Build the payload to store.
 *
 * Rows that are still incomplete are left out, but `settings` itself is not
 * pruned: a half typed subscription keeps its row, and the row indexes keep
 * pointing at the right object while the user finishes it.
 */
function snapshot(): Storage {
  const copy = new Storage();
  copy.fromObject(JSON.parse(JSON.stringify(settings)) as StorageData);
  copy.onlineURLs = copy.onlineURLs.filter((onlineURL) => onlineURL.url);
  copy.customRules = copy.customRules.filter((rule) => rule.origin && rule.target);
  return copy;
}

/** Write the current settings, unless they are already stored. */
async function saveOptions(): Promise<void> {
  cancelScheduledSave();
  const payload = snapshot();
  const serialized = JSON.stringify(payload);
  if (serialized === lastWritten) {
    return;
  }
  lastWritten = serialized;

  setSaveState(NOTIFICATIONS.saving);
  const write = writing.then(() => writeSettings(payload));
  writing = write.then(
    () => undefined,
    () => undefined,
  );
  try {
    await write;
    setSaveState(NOTIFICATIONS.saved, true);
  } catch (error) {
    console.error(error);
    /* Forget the payload so that the next edit tries again. */
    lastWritten = null;
    setSaveState(NOTIFICATIONS.fail);
  }
}

/** Persist the pending changes once the user pauses. */
function scheduleSave(): void {
  cancelScheduledSave();
  setSaveState(NOTIFICATIONS.saving);
  saveTimer = window.setTimeout(() => {
    saveTimer = null;
    void saveOptions();
  }, SAVE_DELAY_MS);
}

function cancelScheduledSave(): void {
  if (saveTimer !== null) {
    window.clearTimeout(saveTimer);
    saveTimer = null;
  }
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

/** Commit a finished drag to the settings, or revert it when it was cancelled. */
function finishDrag(): void {
  const state = dragState;
  if (!state) {
    return;
  }
  dragState = null;
  state.row.classList.remove("dragging");
  state.row.draggable = false;

  const to = rowIndex(state.row);
  if (to === state.from) {
    return;
  }
  if (state.dropped) {
    const rows = rowsFor(state.row);
    const [moved] = rows.splice(state.from, 1);
    rows.splice(to, 0, moved);
    scheduleSave();
  } else {
    /* The preview only moved the DOM, so put the row back where it came from. */
    moveDom(state.row, state.from);
  }
}

/** Let the rows of `tbody` be reordered by dragging their grip. */
function initRowDragging(tbody: HTMLElement): void {
  tbody.addEventListener("dragstart", (event) => {
    const row = (event.target as Element | null)?.closest<HTMLTableRowElement>("tr");
    if (!row || !row.draggable) {
      event.preventDefault();
      return;
    }
    dragState = { row, from: rowIndex(row), dropped: false };
    row.classList.add("dragging");
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", rowIndex(row).toString());
    }
  });

  tbody.addEventListener("dragover", (event) => {
    const state = dragState;
    const target = (event.target as Element | null)?.closest<HTMLTableRowElement>("tr");
    if (!state || (target && target.parentElement !== tbody)) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
    if (!target) {
      /* Pointer below the last row: append. */
      if (state.row.nextElementSibling) {
        tbody.append(state.row);
      }
      return;
    }
    if (target === state.row) {
      return;
    }
    const box = target.getBoundingClientRect();
    const after = event.clientY > box.top + box.height / 2;
    if (after) {
      tbody.insertBefore(state.row, target.nextSibling);
    } else {
      tbody.insertBefore(state.row, target);
    }
  });

  tbody.addEventListener("drop", (event) => {
    if (!dragState) {
      return;
    }
    event.preventDefault();
    dragState.dropped = true;
  });

  tbody.addEventListener("dragend", finishDrag);
}

function init(): void {
  localizeDocument();
  initModals();

  for (const tbody of document.querySelectorAll<HTMLElement>(
    "#tblOnlineURLs tbody, #tblCustomRules tbody",
  )) {
    initRowDragging(tbody);
  }

  /* A grip that is clicked without dragging must not leave the row draggable. */
  document.addEventListener("mouseup", () => {
    if (dragState) {
      return;
    }
    for (const row of document.querySelectorAll<HTMLTableRowElement>("tr[draggable='true']")) {
      row.draggable = false;
    }
  });

  find("#lnkCloudUpload")?.addEventListener("click", () => void uploadToCloud());
  find("#lnkCloudDownload")?.addEventListener("click", () => void downloadFromCloud());

  must<HTMLInputElement>("#chbEnable").addEventListener("change", (event) => {
    settings.enable = (event.target as HTMLInputElement).checked;
    scheduleSave();
  });
  must<HTMLInputElement>("#chbSync").addEventListener("change", (event) => {
    settings.sync = (event.target as HTMLInputElement).checked;
    scheduleSave();
  });
  must<HTMLSelectElement>("#onlineInterval").addEventListener("change", (event) => {
    const minutes = Number.parseInt((event.target as HTMLSelectElement).value, 10);
    settings.updateInterval = Number.isNaN(minutes) ? 60 : Math.max(1, minutes * 60);
    scheduleSave();
  });

  /* Reset reads the stored settings back, dropping a pending edit as well. */
  must("#btnReset").addEventListener("click", () => {
    cancelScheduledSave();
    void reload();
  });
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
    scheduleSave();
  });

  must("#btnDeleteOnlineURL").addEventListener("click", () => {
    deleteSelected("#tblOnlineURLs", (index) => settings.onlineURLs.splice(index, 1));
    scheduleSave();
  });

  must("#btnAddCustomRule").addEventListener("click", (event) => {
    startNewRule(event.shiftKey);
  });

  /* Shift+click on the heading is a second way to add a rule on top. */
  must("#hdrCustomRules").addEventListener("click", (event) => {
    if (event.shiftKey) {
      startNewRule(true);
    }
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
    scheduleSave();
  });

  /* Delete from inside the editor, behind a confirmation. */
  must("#btnDeleteRule").addEventListener("click", () => {
    const rule = editingRule;
    if (!rule) {
      return;
    }
    pendingDeletion = rule;
    const name = rule.description || rule.origin || "";
    must("#confirmMessage").textContent = getMessage("confirmDeleteRule", [name]) ?? "";
    showModal(must("#modalConfirmDelete"));
  });

  must("#btnConfirmDeleteRule").addEventListener("click", () => {
    const rule = pendingDeletion;
    pendingDeletion = null;
    hideModal(must("#modalConfirmDelete"));
    const index = rule ? settings.customRules.indexOf(rule) : -1;
    if (index < 0) {
      return;
    }
    settings.customRules.splice(index, 1);
    editingRule = null;
    hideModal(must("#modalEditUserRule"));
    displayAll();
    scheduleSave();
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
      if (addRuleAtTop) {
        settings.customRules.unshift(rule);
      } else {
        settings.customRules.push(rule);
      }
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
    scheduleSave();
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

  must("#btnImportCustomRule").addEventListener("click", () => {
    const textarea = must<HTMLTextAreaElement>("#modalImportUserRule textarea");
    textarea.value = "";
    showImportError("");
    showModal(must("#modalImportUserRule"));
    textarea.focus();
  });

  must("#btnConfirmImportRule").addEventListener("click", importRules);

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

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") {
      return;
    }
    /* Our own writes echo back here; re-rendering on them would fight the user. */
    const newValue = changes.storage?.newValue;
    if (newValue !== undefined && JSON.stringify(newValue) === lastWritten) {
      return;
    }
    void reload();
  });

  /* Leaving the page must not drop the edit that is still inside the debounce. */
  window.addEventListener("pagehide", () => {
    if (saveTimer !== null) {
      void saveOptions();
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
