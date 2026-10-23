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

const RESOURCE_TYPE_URL =
  "https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/webRequest/ResourceType";
const ADDON_URL = "https://addons.mozilla.org/firefox/addon/urlredirector/";
const OPTION_TAB_URL = window.location.href;

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

/** Focus the options tab again, e.g. after the OAuth round trip. */
async function activateOptionsTab(): Promise<void> {
  const tabs = await browser.tabs.query({ url: OPTION_TAB_URL });
  const tabId = tabs[0]?.id;
  if (tabId !== undefined) {
    await browser.tabs.update(tabId, { active: true });
  }
}

function blockUI(message: string | undefined): void {
  $("#cloudMessage").text(message ?? "");
  $("#modalCloud").modal("show");
}

function unblockUI(): void {
  $("#modalCloud").modal("hide");
}

function showCloudMessage(message: string | undefined): void {
  $("#spanCloudMessage")
    .show()
    .text(message ?? "")
    .fadeOut(8000);
}

function cloudDriver(): typeof onedrive | null {
  return $("#sltCloud").val() === "onedrive" ? onedrive : null;
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
function moveUpOrDown(element: HTMLElement, up: boolean): void {
  const $row = $(element);
  const index = $row.index();
  const rows = $row.closest("table").is("#tblOnlineURLs")
    ? settings.onlineURLs
    : settings.customRules;
  const neighbourIndex = up ? index - 1 : index + 1;
  const neighbour = rows[neighbourIndex];
  if (neighbour === undefined) {
    return;
  }
  if (up) {
    $row.prev().before($row);
  } else {
    $row.next().after($row);
  }
  rows[neighbourIndex] = rows[index]!;
  rows[index] = neighbour;
}

/* Create a URL row */
function createURLRow(onlineURL: OnlineURL): void {
  const $url = $("<input>", { type: "text" })
    .addClass("form-control")
    .val(onlineURL.url ?? "")
    .data("old", onlineURL.url ?? "")
    .on("change", function (this: HTMLInputElement) {
      const url = String($(this).val()).trim();
      const duplicated = $(this)
        .closest("tbody")
        .find("input[type='text']")
        .toArray()
        .some((other) => other !== this && String($(other).val()).trim() === url);
      if (duplicated) {
        $(this).val($(this).data("old") as string);
        return;
      }
      $(this).data("old", url);
      settings.onlineURLs[$(this).closest("tr").index()]!.url = url;
    });

  $("#tblOnlineURLs tbody").append(
    $("<tr>").append(
      $("<td>").append($("<input>", { type: "checkbox" }).addClass("checkbox")),
      $("<td>").append($url),
      $("<td>")
        .width("60px")
        .append(
          $("<a>")
            .addClass("btn btn-xs btn-default")
            .on("click", function () {
              const target = settings.onlineURLs[$(this).closest("tr").index()];
              if (target) {
                showOnlineURLModal(target);
              }
            })
            .append($("<i>").addClass("glyphicon glyphicon-eye-open")),
        ),
      $("<td>").append(
        $("<input>", { type: "checkbox", title: getMessage("autoUpdate") })
          .addClass("checkbox middle")
          .prop("checked", onlineURL.auto)
          .on("change", function () {
            settings.onlineURLs[$(this).closest("tr").index()]!.auto = $(this).is(":checked");
          }),
      ),
      $("<td>").append(
        $("<input>", { type: "checkbox", title: getMessage("enable") })
          .addClass("checkbox middle")
          .prop("checked", onlineURL.enable)
          .on("change", function () {
            settings.onlineURLs[$(this).closest("tr").index()]!.enable = $(this).is(":checked");
          }),
      ),
      $("<td>").append(
        $("<button>")
          .addClass("btn btn-xs btn-info")
          .append($("<span>").addClass("glyphicon glyphicon-chevron-up"))
          .on("click", function () {
            moveUpOrDown(this, true);
          }),
        $("<button>")
          .addClass("btn btn-xs btn-info")
          .css("margin-left", "2px")
          .append($("<span>").addClass("glyphicon glyphicon-chevron-down"))
          .on("click", function () {
            moveUpOrDown(this, false);
          }),
      ),
    ),
  );
}

/* Create a rule row */
function createRuleRow(rule: Rule): void {
  $("#tblCustomRules tbody").append(
    $("<tr>")
      .append(
        $("<td>").append($("<input>", { type: "checkbox" })),
        $("<td>").append($("<span>").text(rule.description ?? "")),
        $("<td>").append($("<span>").text(rule.origin ?? "")),
        $("<td>").append($("<span>").text(rule.target ?? "")),
        $("<td>").append(
          $("<input>", { type: "checkbox", title: getMessage("enable") })
            .prop("checked", rule.enable)
            .on("change", function () {
              settings.customRules[$(this).closest("tr").index()]!.enable = $(this).is(":checked");
            }),
        ),
        $("<td>").append(
          $("<button>")
            .addClass("btn btn-xs btn-info")
            .append($("<span>").addClass("glyphicon glyphicon-chevron-up"))
            .on("click", function () {
              moveUpOrDown(this, true);
            }),
          $("<button>")
            .addClass("btn btn-xs btn-info")
            .css("margin-left", "2px")
            .append($("<span>").addClass("glyphicon glyphicon-chevron-down"))
            .on("click", function () {
              moveUpOrDown(this, false);
            }),
        ),
      )
      .on("dblclick", function () {
        const ruleIndex = $(this).index();
        editingRule = settings.customRules[ruleIndex] ?? null;
        showEditCustomRuleModal(editingRule);
      }),
  );
}

/* Display everything */
function displayAll(): void {
  $("table thead").find(":checkbox").prop("checked", false);

  void sendMessage({ method: "isDownloading" }).then((isDownloading) => {
    $("#downloadState").text(isDownloading ? (NOTIFICATIONS.downloading ?? "") : "");
  });

  const manifest = browser.runtime.getManifest();
  $("#version").text(manifest.version);
  $("#homepage").attr("href", manifest.homepage_url ?? "");
  $("#addonPage").attr("href", ADDON_URL);
  $("#resourceType").attr("href", RESOURCE_TYPE_URL);

  if (settings.updateInterval) {
    $("#onlineInterval").val(String(Math.round(settings.updateInterval / 60)));
  }
  if (settings.updatedAt) {
    $("#lblUpdatedAt").text(new Date(settings.updatedAt).toLocaleString());
  }
  if (settings.enable !== undefined) {
    $("#chbEnable").prop("checked", settings.enable);
  }
  if (!browser.storage.sync) {
    $("#lblSync")
      .prop("disabled", true)
      .addClass("text-muted")
      .attr("title", NOTIFICATIONS.syncNotSupported ?? "");
    $("#chbSync").prop("disabled", true).prop("checked", false);
  } else if (settings.sync !== undefined) {
    $("#chbSync").prop("checked", settings.sync);
  }

  const $onlineURLBody = $("#tblOnlineURLs tbody").empty();
  for (const onlineURL of settings.onlineURLs) {
    createURLRow(onlineURL);
  }
  void $onlineURLBody;
  $("#tblCustomRules tbody").empty();
  for (const rule of settings.customRules) {
    createRuleRow(rule);
  }
}

/* Show the details of a subscription */
function showOnlineURLModal(onlineURL: OnlineURL): void {
  editingOnlineURL = onlineURL;
  editingOnlineURLIndex = settings.onlineURLs.indexOf(onlineURL);
  $("#linkOnlineURL").attr("href", onlineURL.url ?? "");
  const $body = $("#modalViewOnlineURL tbody").empty();
  for (const rule of onlineURL.rules) {
    $body.append(
      $("<tr>").append(
        $("<td>").append(
          $("<input>", { type: "checkbox" })
            .addClass("checkbox")
            .prop("checked", rule.enable)
            .on("change", function () {
              const ruleIndex = $(this).closest("tr").index();
              const edited = editingOnlineURL?.rules[ruleIndex];
              if (edited) {
                edited.enable = $(this).prop("checked");
              }
              /* A manual change disables the automatic refresh. */
              $("#tblOnlineURLs tbody tr")
                .eq(editingOnlineURLIndex)
                .find(":checkbox")
                .eq(1)
                .prop("checked", false);
              if (editingOnlineURL) {
                editingOnlineURL.auto = false;
              }
            }),
        ),
        $("<td>").append(
          $("<span>").text(rule.origin ?? ""),
          $("<br>"),
          $("<span>").text(rule.target ?? ""),
        ),
      ),
    );
  }
  $("#modalViewOnlineURL").modal("show");
}

/* Show the rule editor */
function showEditCustomRuleModal(rule: Rule | null): void {
  $("#divMethods input[type='checkbox']").prop("checked", false);
  $("#divTypes input[type='checkbox']").prop("checked", false);
  if (rule) {
    $("#txtDescription").val(rule.description ?? "");
    $("#txtOrigin").val(rule.origin ?? "");
    $("#txtTarget").val(rule.target ?? "");
    $("#txtExclude").val(rule.exclude ?? "");
    $("#txtExample").val(rule.example ?? "");
    $(`input:radio[name='process'][value='${rule.process ?? ""}']`).prop("checked", true);
    $("#txtTestResult").val("");
    if (rule.methods.length > 0) {
      $("#cbMethodAll").prop("checked", false);
      for (const method of rule.methods) {
        $(`#cbMethod_${method}`).prop("checked", true);
      }
      $("#divMethods").collapse("show");
    } else {
      $("#cbMethodAll").prop("checked", true);
      $("#divMethods").collapse("hide");
    }
    if (rule.types.length > 0) {
      $("#cbTypeAll").prop("checked", false);
      for (const type of rule.types) {
        $(`#cbType_${type}`).prop("checked", true);
      }
      $("#divTypes").collapse("show");
    } else {
      $("#cbTypeAll").prop("checked", true);
      $("#divTypes").collapse("hide");
    }
  } else {
    $("#txtDescription").val("");
    $("#txtOrigin").val("");
    $("#txtTarget").val("");
    $("#txtExclude").val("");
    $("input:radio[name='process'][value='']").prop("checked", true);
    $("#txtTestOrigin").val("");
    $("#txtTestResult").val("");
    $("#cbTypeAll").prop("checked", true);
    $("#cbMethodAll").prop("checked", true);
  }
  testRule();
  $("#modalEditUserRule").modal("show");
}

/* Preview the rule against the example URL */
function testRule(): void {
  const rule = new Rule();
  rule.fromObject({
    origin: String($("#txtOrigin").val() ?? ""),
    target: String($("#txtTarget").val() ?? ""),
    exclude: String($("#txtExclude").val() ?? ""),
    enable: true,
    process: String($("input:radio[name='process']:checked").val() ?? "") as RuleData["process"],
  });
  $("#txtTestResult").val(rule.redirect(String($("#txtExample").val() ?? "")) ?? "");
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

function init(): void {
  localizeDocument();

  $("#lnkCloudUpload").on("click", () => void uploadToCloud());
  $("#lnkCloudDownload").on("click", () => void downloadFromCloud());

  $("#chbEnable").on("change", function () {
    settings.enable = $(this).is(":checked");
  });
  $("#chbSync").on("change", function () {
    settings.sync = $(this).prop("checked");
  });
  $("#onlineInterval").on("change", function () {
    const minutes = Number.parseInt(String($(this).val()), 10);
    settings.updateInterval = Number.isNaN(minutes) ? 60 : Math.max(1, minutes * 60);
  });

  $("#btnReset").on("click", () => void reload());
  $("#btnSave").on("click", () => void saveOptions());
  $("#btnDownload").on("click", async () => {
    const isDownloading = await sendMessage({ method: "isDownloading" });
    $("#downloadState").text(NOTIFICATIONS.downloading ?? "");
    if (!isDownloading) {
      await sendMessage({ method: "download" });
    }
  });

  /* Check all / uncheck all */
  $("table thead :checkbox").on("click", function () {
    const checked = $(this).is(":checked");
    $(this)
      .closest("table")
      .find("tbody tr")
      .each(function () {
        $(this).find(":checkbox").first().prop("checked", checked);
      });
  });

  $("#btnAddOnlineURL").on("click", () => {
    const hasEmpty = $("#tblOnlineURLs")
      .find(":text")
      .toArray()
      .some((input) => String($(input).val()).trim() === "");
    if (hasEmpty) {
      return;
    }
    const onlineURL = new OnlineURL();
    onlineURL.enable = true;
    onlineURL.auto = true;
    settings.onlineURLs.push(onlineURL);
    createURLRow(onlineURL);
  });

  $("#btnDeleteOnlineURL").on("click", () => {
    $("#tblOnlineURLs tbody tr").each(function () {
      if ($(this).find(":checkbox").first().is(":checked")) {
        settings.onlineURLs.splice($(this).closest("tr").index(), 1);
        $(this).remove();
      }
    });
    $("#tblOnlineURLs thead :checkbox").prop("checked", false);
  });

  $("#btnAddCustomRule").on("click", () => {
    const hasEmpty = $("#tblCustomRules tbody tr")
      .toArray()
      .some((row) => {
        const spans = $(row).find("span");
        return (spans.get(1)?.innerText ?? "") === "" && (spans.get(2)?.innerText ?? "") === "";
      });
    if (hasEmpty) {
      return;
    }
    editingRule = null;
    const rule = new Rule();
    rule.enable = true;
    showEditCustomRuleModal(rule);
  });

  $("#btnEditCustomRule").on("click", () => {
    const selectedIndex = $("#tblCustomRules tbody tr")
      .toArray()
      .findIndex((row) => $(row).find("input[type='checkbox']").first().is(":checked"));
    if (selectedIndex >= 0) {
      editingRule = settings.customRules[selectedIndex] ?? null;
      showEditCustomRuleModal(editingRule);
    }
  });

  $("#btnDeleteCustomRule").on("click", () => {
    $("#tblCustomRules tbody tr").each(function () {
      if ($(this).find(":checkbox").first().is(":checked")) {
        settings.customRules.splice($(this).closest("tr").index(), 1);
        $(this).remove();
      }
    });
    $("#tblCustomRules thead :checkbox").prop("checked", false);
  });

  $("button.remove").on("click", function () {
    $(this).closest("div").find(":text").first().val("");
  });

  $("#txtExample, #txtOrigin, #txtTarget, #txtExclude").on("input", testRule);
  $("input:radio[name='process']").on("change", testRule);

  $("#cbTypeAll").on("change", function () {
    $("#divTypes").collapse($(this).is(":checked") ? "hide" : "show");
    $("#divTypes input[type='checkbox']").prop("checked", false);
  });

  $("#cbMethodAll").on("change", function () {
    $("#divMethods").collapse($(this).is(":checked") ? "hide" : "show");
    $("#divMethods input[type='checkbox']").prop("checked", false);
  });

  $("#btnConfirmCustomRule").on("click", () => {
    if (String($("#txtOrigin").val() ?? "") === "") {
      $("#txtOrigin").trigger("focus");
      return;
    }
    if (String($("#txtTarget").val() ?? "") === "") {
      $("#txtTarget").trigger("focus");
      return;
    }
    const target = editingRule ?? new Rule();
    if (!editingRule) {
      target.enable = true;
      settings.customRules.push(target);
      editingRule = target;
    }
    target.description = String($("#txtDescription").val() ?? "");
    target.origin = String($("#txtOrigin").val() ?? "");
    target.target = String($("#txtTarget").val() ?? "");
    target.exclude = String($("#txtExclude").val() ?? "");
    target.example = String($("#txtExample").val() ?? "");
    target.process = String($("input:radio[name='process']:checked").val() ?? "");
    target.methods = [];
    if (!$("#cbMethodAll").is(":checked")) {
      $("#divMethods input[type='checkbox']")
        .toArray()
        .filter((input) => $(input).is(":checked"))
        .forEach((input) => target.methods.push(String($(input).data("method"))));
    }
    target.types = [];
    if (!$("#cbTypeAll").is(":checked")) {
      $("#divTypes input[type='checkbox']")
        .toArray()
        .filter((input) => $(input).is(":checked"))
        .forEach((input) => target.types.push(String($(input).data("type"))));
    }
    displayAll();
    $("#modalEditUserRule").modal("hide");
  });

  $("#btnViewCustomeRule").on("click", () => {
    const userRules = { version: "1.0", rules: settings.customRules };
    $("#modalViewUserRule textarea").text(JSON.stringify(userRules, null, 2));
    $("#modalViewUserRule").modal("show");
  });

  browser.runtime.onMessage.addListener((message: ExtensionMessage) => {
    if (message.method === "downloaded") {
      $("#downloadState").text("");
      return undefined;
    }
    if (message.method === "downloadError" || message.method === "parseError") {
      const urls = Array.isArray(message.args) ? message.args : [];
      const text = [getMessage(message.method), ...urls.map(String)].join("\n");
      alert(text);
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

onReady(init);
