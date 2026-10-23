/**
 * Ambient browser globals provided by the vendored jQuery/Bootstrap script tags.
 */

declare const $: JQueryStatic;
declare const jQuery: JQueryStatic;

interface JQuery {
  modal(command?: "show" | "hide" | "toggle" | "handleUpdate"): JQuery;
  collapse(command?: "show" | "hide" | "toggle"): JQuery;
}
