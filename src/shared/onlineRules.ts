/**
 * Parsing of rule files, either downloaded subscriptions or JSON the user
 * pasted into the import dialog of the options page.
 *
 * Two formats are supported: the historical gooreplacer format (a `rules`
 * object without a version) and the versioned URLRedirector format (a `rules`
 * array).
 */

import { OnlineURL } from "./model";
import type { OnlineURLData, RuleData } from "./model";

export interface RuleFile {
  version?: string | number | null;
  rules?: unknown;
  [key: string]: unknown;
}

/** Parse the raw body of a rule file. */
export function parseRuleFile(content: string): RuleFile {
  const parsed: unknown = JSON.parse(content);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError("A rule file must be a JSON object");
  }
  return parsed as RuleFile;
}

/** Whether the file uses the legacy gooreplacer layout. */
export function isLegacyRuleFile(file: RuleFile): boolean {
  const version = file.version;
  if (version === undefined || version === null || version === "") {
    return true;
  }
  const numeric = Number(version);
  return Number.isNaN(numeric) ? String(version) < "1.0" : numeric < 1;
}

function convertLegacyRules(rules: unknown): RuleData[] {
  if (!rules || typeof rules !== "object") {
    return [];
  }
  return Object.entries(rules as Record<string, Record<string, unknown> | null>).map(
    ([origin, rule]) => ({
      origin,
      target: typeof rule?.dstURL === "string" ? rule.dstURL : "",
      enable: rule?.enable === undefined ? true : Boolean(rule.enable),
      kind: rule?.kind,
    }),
  );
}

/**
 * Read the rule list of a rule file, accepting both supported layouts.
 *
 * A bare JSON array of rules or a single rule object is accepted as well,
 * because that is what the options page hands over when the user pastes rules
 * to import.
 *
 * @throws {SyntaxError} when `content` is not valid JSON.
 * @throws {TypeError} when `content` is neither a rule file nor a rule array.
 */
export function parseRuleList(content: string): RuleData[] {
  const parsed: unknown = JSON.parse(content);
  if (Array.isArray(parsed)) {
    return parsed as RuleData[];
  }
  if (!parsed || typeof parsed !== "object") {
    throw new TypeError("A rule file must be a JSON object or an array of rules");
  }
  const file = parsed as RuleFile;
  if (!("rules" in file) && typeof (file as RuleData).origin === "string") {
    return [file as RuleData];
  }
  return isLegacyRuleFile(file)
    ? convertLegacyRules(file.rules)
    : ((Array.isArray(file.rules) ? file.rules : []) as RuleData[]);
}

/**
 * Turn a downloaded rule file into a subscription.
 *
 * The subscription is always enabled, because downloading only happens for
 * enabled subscriptions.
 */
export function toOnlineURL(file: RuleFile, url: string): OnlineURL {
  const data: OnlineURLData = { ...file, url, enable: true } as OnlineURLData;
  data.rules = parseRuleList(JSON.stringify(file));
  const onlineURL = new OnlineURL();
  onlineURL.fromObject(data);
  return onlineURL;
}
