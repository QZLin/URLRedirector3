import { describe, expect, it } from "vitest";

import { Rule, Storage } from "../src/shared/model";
import type { OnlineURLData, RuleData, StorageData } from "../src/shared/model";

function makeRule(data: Partial<RuleData> & { origin: string; target: string }): Rule {
  const rule = new Rule();
  rule.fromObject({ enable: true, ...data });
  return rule;
}

function makeStorage(data: StorageData = {}): Storage {
  const settings = new Storage();
  settings.fromObject({ enable: true, ...data });
  return settings;
}

function makeOnlineURL(data: OnlineURLData): NonNullable<StorageData["onlineURLs"]>[number] {
  return { enable: true, ...data };
}

describe("Rule", () => {
  it("rewrites a matching URL", () => {
    const rule = makeRule({ origin: "cdn\\.example\\.com", target: "cdn.example.org" });
    expect(rule.redirect("https://cdn.example.com/lib.js")).toBe("https://cdn.example.org/lib.js");
  });

  it("rewrites every occurrence of a global pattern", () => {
    const rule = makeRule({ origin: "a", target: "b" });
    expect(rule.redirect("https://aaa.example")).toBe("https://bbb.exbmple");
  });

  it("returns null when the URL does not match", () => {
    const rule = makeRule({ origin: "nomatch", target: "target" });
    expect(rule.redirect("https://example.com")).toBeNull();
  });

  it("ignores disabled rules", () => {
    const rule = makeRule({ origin: "a", target: "b", enable: false });
    expect(rule.redirect("a")).toBeNull();
  });

  it("substitutes capture groups", () => {
    const rule = makeRule({ origin: "(\\d+)\\.example", target: "example/$1" });
    expect(rule.redirect("https://a.42.example/path")).toBe("https://a.example/42/path");
  });

  it("applies url encoding to capture groups", () => {
    const rule = makeRule({
      origin: "query=(.*)",
      target: "query/$1",
      process: "urlEncode",
    });
    // With a process the target replaces the whole URL, only `$n` comes from the match.
    expect(rule.redirect("https://example.com/?query=a b")).toBe("query/a%20b");
  });

  it("applies base64 decoding to capture groups", () => {
    const rule = makeRule({ origin: "b64=(.*)", target: "$1", process: "base64Decode" });
    expect(rule.redirect("b64=aGVsbG8=")).toBe("hello");
  });

  it("returns null when a capture group cannot be processed", () => {
    const rule = makeRule({ origin: "b64=(.*)", target: "$1", process: "base64Decode" });
    expect(rule.redirect("b64=%%%%")).toBeNull();
  });

  it("honours the exclude pattern", () => {
    const rule = makeRule({ origin: "example\\.com", target: "example.org", exclude: "keep" });
    expect(rule.redirect("https://keep.example.com/")).toBeNull();
    expect(rule.redirect("https://www.example.com/")).toBe("https://www.example.org/");
  });

  it("filters by request method", () => {
    const rule = makeRule({ origin: "example\\.com", target: "example.org", methods: ["POST"] });
    expect(rule.redirect("https://example.com", "GET", "main_frame")).toBeNull();
    expect(rule.redirect("https://example.com", "POST", "main_frame")).toBe("https://example.org");
  });

  it("filters by resource type", () => {
    const rule = makeRule({ origin: "example\\.com", target: "example.org", types: ["script"] });
    expect(rule.redirect("https://example.com", "GET", "image")).toBeNull();
    expect(rule.redirect("https://example.com", "GET", "script")).toBe("https://example.org");
  });

  it("tolerates an invalid regular expression", () => {
    const rule = makeRule({ origin: "([a-z", target: "broken" });
    expect(rule.isCompiled).toBe(false);
    expect(rule.redirect("https://example.com")).toBeNull();
  });

  it("ignores unknown fields and does not expose compiled state", () => {
    const rule = new Rule();
    rule.fromObject({ origin: "a", target: "b", enable: true, kind: "urlEncode" });
    expect(rule).not.toHaveProperty("kind");
    expect(JSON.parse(JSON.stringify(rule))).not.toHaveProperty("_originRe");
  });
});

describe("Storage", () => {
  it("returns null while disabled", () => {
    const settings = makeStorage({ enable: false, customRules: [{ origin: "a", target: "b" }] });
    expect(settings.redirect("a")).toBeNull();
  });

  it("applies chained rules until the URL settles", () => {
    const settings = makeStorage({
      customRules: [
        { origin: "^https://one\\.example", target: "https://two.example", enable: true },
        { origin: "^https://two\\.example", target: "https://three.example", enable: true },
      ],
    });
    expect(settings.redirect("https://one.example/page")).toBe("https://three.example/page");
  });

  it("prefers user rules over online rules", () => {
    const settings = makeStorage({
      customRules: [{ origin: "example\\.com", target: "custom.example", enable: true }],
      onlineURLs: [
        makeOnlineURL({
          url: "https://rules.example",
          rules: [{ origin: "example\\.com", target: "online.example" }],
        }),
      ],
    });
    expect(settings.redirect("https://example.com")).toBe("https://custom.example");
  });

  it("skips disabled online subscriptions", () => {
    const settings = makeStorage({
      onlineURLs: [
        makeOnlineURL({
          url: "https://rules.example",
          enable: false,
          rules: [{ origin: "example\\.com", target: "online.example" }],
        }),
      ],
    });
    expect(settings.redirect("https://example.com")).toBeNull();
  });

  it("returns null for a stable URL", () => {
    const settings = makeStorage({
      customRules: [{ origin: "example\\.com", target: "example.org", enable: true }],
    });
    expect(settings.redirect("https://unrelated.test")).toBeNull();
  });

  it("gives up on rule cycles", () => {
    const settings = makeStorage({
      customRules: [
        { origin: "^https://a\\.example", target: "https://b.example", enable: true },
        { origin: "^https://b\\.example", target: "https://a.example", enable: true },
      ],
    });
    expect(settings.redirect("https://a.example")).toBeNull();
  });
});
