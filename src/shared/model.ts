/**
 * Domain models of URLRedirector.
 *
 * A {@link Rule} rewrites one URL pattern into another. Rules are grouped either
 * as user defined rules or inside an online rule subscription
 * ({@link OnlineURL}); both are part of the persisted {@link Storage} settings.
 */

export const PROCESS_KINDS = [
  "",
  "urlEncode",
  "urlDecode",
  "base64Encode",
  "base64Decode",
] as const;

export type ProcessKind = (typeof PROCESS_KINDS)[number];

/** Plain object representation of a rule, as read from storage or JSON files. */
export interface RuleData {
  description?: string | null;
  origin?: string | null;
  exclude?: string | null;
  methods?: string[] | null;
  types?: string[] | null;
  target?: string | null;
  example?: string | null;
  enable?: boolean | null;
  process?: ProcessKind | string | null;
  [key: string]: unknown;
}

/** Plain object representation of an online rule subscription. */
export interface OnlineURLData {
  description?: string | null;
  url?: string | null;
  enable?: boolean | null;
  auto?: boolean | null;
  rules?: RuleData[] | null;
  [key: string]: unknown;
}

/** Plain object representation of the stored settings. */
export interface StorageData {
  enable?: boolean | null;
  sync?: boolean | null;
  updateInterval?: number | string | null;
  updatedAt?: string | null;
  onlineURLs?: OnlineURLData[] | null;
  customRules?: RuleData[] | null;
  [key: string]: unknown;
}

function compile(pattern: string | null | undefined, label: string): RegExp | null {
  if (!pattern) {
    return null;
  }
  try {
    return new RegExp(pattern, "g");
  } catch (error) {
    console.warn(`${label} is not a valid regular expression: ${pattern}`, error);
    return null;
  }
}

/** A single redirect rule. */
export class Rule {
  description: string | null = null;
  /** Source URL pattern, compiled as a regular expression. */
  origin: string | null = null;
  /** URL pattern that is excluded from the rule. */
  exclude: string | null = null;
  /** HTTP methods the rule applies to, empty means every method. */
  methods: string[] = [];
  /** Resource types the rule applies to, empty means every type. */
  types: string[] = [];
  /** Target URL pattern, `$1` style back references are supported. */
  target: string | null = null;
  /** Example URL used by the options page to preview the rewrite. */
  example: string | null = null;
  enable = false;
  /** Optional transformation applied to the captured groups. */
  process: ProcessKind | string | null = null;

  #originRe: RegExp | null = null;
  #excludeRe: RegExp | null = null;

  /** Copy the known fields of a plain object and compile the patterns. */
  fromObject(obj: RuleData): void {
    for (const key of Object.keys(obj)) {
      if (Object.hasOwn(this, key)) {
        (this as unknown as Record<string, unknown>)[key] = obj[key];
      }
    }
    this.#originRe = compile(this.origin, "origin");
    this.#excludeRe = compile(this.exclude, "exclude");
  }

  /** Whether the rule currently has a usable source pattern. */
  get isCompiled(): boolean {
    return this.#originRe !== null;
  }

  /**
   * Redirect `url` according to this rule.
   *
   * `method` and `type` are only checked when provided, matching the optional
   * filtering the options page exposes.
   *
   * @returns the rewritten URL, or `null` when the rule does not apply.
   */
  redirect(url: string, method?: string, type?: string): string | null {
    if (!this.enable || !this.#originRe) {
      return null;
    }
    this.#originRe.lastIndex = 0;
    if (!this.#originRe.test(url)) {
      return null;
    }

    if (method && this.methods.length > 0 && !this.methods.includes(method)) {
      return null;
    }
    if (type && this.types.length > 0 && !this.types.includes(type)) {
      return null;
    }

    if (this.#excludeRe) {
      this.#excludeRe.lastIndex = 0;
      if (this.#excludeRe.test(url)) {
        return null;
      }
    }

    if (this.process) {
      this.#originRe.lastIndex = 0;
      const matches = this.#originRe.exec(url);
      if (!matches) {
        return null;
      }
      let newURL = this.target ?? "";
      for (let i = 1; i < matches.length; i++) {
        let match = matches[i] ?? "";
        try {
          match = applyProcess(match, this.process);
        } catch {
          // The captured group could not be transformed.
          return null;
        }
        newURL = newURL.replace(new RegExp(`\\$${i}`, "g"), match);
      }
      return newURL;
    }

    this.#originRe.lastIndex = 0;
    return url.replace(this.#originRe, this.target ?? "");
  }
}

function applyProcess(value: string, process: string): string {
  switch (process) {
    case "urlEncode":
      return encodeURIComponent(value);
    case "urlDecode":
      return decodeURIComponent(value);
    case "base64Encode":
      return btoa(value);
    case "base64Decode":
      return atob(value);
    default:
      return value;
  }
}

/** A downloadable set of rules. */
export class OnlineURL {
  description: string | null = null;
  /** Where the rule file is downloaded from. */
  url: string | null = null;
  enable = false;
  /** Whether the rule file is refreshed periodically. */
  auto = true;
  rules: Rule[] = [];

  fromObject(obj: OnlineURLData): void {
    for (const key of Object.keys(obj)) {
      if (key === "rules") {
        this.rules = [];
        for (const ruleData of obj.rules ?? []) {
          const rule = new Rule();
          rule.fromObject(ruleData);
          this.rules.push(rule);
        }
      } else if (Object.hasOwn(this, key)) {
        (this as unknown as Record<string, unknown>)[key] = obj[key];
      }
    }
  }

  redirect(url: string, method?: string, type?: string): string | null {
    if (!this.enable) {
      return null;
    }
    for (const rule of this.rules) {
      const newURL = rule.redirect(url, method, type);
      if (newURL) {
        return newURL;
      }
    }
    return null;
  }
}

/** Guard against redirect loops. */
const MAX_REDIRECT_STEPS = 1000;

/** The complete, persisted extension settings. */
export class Storage {
  enable = false;
  /** Whether the settings are mirrored into `storage.sync`. */
  sync = false;
  /** Refresh interval of online rules, in seconds. */
  updateInterval = 900;
  /** Time of the last successful online rule download. */
  updatedAt: string | null = null;
  onlineURLs: OnlineURL[] = [];
  customRules: Rule[] = [];

  fromObject(obj: StorageData): void {
    for (const key of Object.keys(obj)) {
      if (key === "onlineURLs") {
        this.onlineURLs = [];
        for (const onlineURLData of obj.onlineURLs ?? []) {
          const onlineURL = new OnlineURL();
          onlineURL.fromObject(onlineURLData);
          this.onlineURLs.push(onlineURL);
        }
      } else if (key === "customRules") {
        this.customRules = [];
        for (const ruleData of obj.customRules ?? []) {
          const rule = new Rule();
          rule.fromObject(ruleData);
          this.customRules.push(rule);
        }
      } else if (Object.hasOwn(this, key)) {
        (this as unknown as Record<string, unknown>)[key] = obj[key];
      }
    }
  }

  /**
   * Apply every rule repeatedly until the URL stops changing.
   *
   * User rules take precedence over subscribed ones, and each step is applied on
   * the result of the previous one so chained rules keep working.
   *
   * @returns the final URL, or `null` when no rule matched.
   */
  redirect(url: string, method?: string, type?: string): string | null {
    if (!this.enable) {
      return null;
    }
    let matched = false;
    for (let step = 0; step < MAX_REDIRECT_STEPS; step++) {
      const newURL = this.#findMatch(url, method, type);
      if (!newURL) {
        return matched ? url : null;
      }
      matched = true;
      url = newURL;
    }
    // A rule chain that never settles is treated as "no redirect".
    return null;
  }

  #findMatch(url: string, method?: string, type?: string): string | null {
    for (const rule of this.customRules) {
      const newURL = rule.redirect(url, method, type);
      if (newURL) {
        return newURL;
      }
    }
    for (const onlineURL of this.onlineURLs) {
      const newURL = onlineURL.redirect(url, method, type);
      if (newURL) {
        return newURL;
      }
    }
    return null;
  }
}
