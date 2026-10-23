import { describe, expect, it } from "vitest";

import { isLegacyRuleFile, parseRuleFile, toOnlineURL } from "../src/shared/onlineRules";

describe("parseRuleFile", () => {
  it("parses a JSON object", () => {
    expect(parseRuleFile('{"rules": []}')).toEqual({ rules: [] });
  });

  it("rejects invalid JSON", () => {
    expect(() => parseRuleFile("<html>")).toThrow(SyntaxError);
  });

  it("rejects non-object documents", () => {
    expect(() => parseRuleFile("[]")).toThrow(TypeError);
    expect(() => parseRuleFile("null")).toThrow(TypeError);
  });
});

describe("isLegacyRuleFile", () => {
  it("treats missing and pre-1.0 versions as legacy", () => {
    expect(isLegacyRuleFile({})).toBe(true);
    expect(isLegacyRuleFile({ version: "0.9" })).toBe(true);
    expect(isLegacyRuleFile({ version: "1.0" })).toBe(false);
    expect(isLegacyRuleFile({ version: 1 })).toBe(false);
  });
});

describe("toOnlineURL", () => {
  it("converts the legacy gooreplacer layout", () => {
    const onlineURL = toOnlineURL(
      {
        rules: {
          "https://a\\.example": { dstURL: "https://b.example", kind: "urlEncode" },
          "https://c\\.example": { dstURL: "https://d.example", enable: false },
        },
      },
      "https://rules.example/rules.json",
    );

    expect(onlineURL.url).toBe("https://rules.example/rules.json");
    expect(onlineURL.enable).toBe(true);
    expect(onlineURL.rules.map((rule) => rule.origin)).toEqual([
      "https://a\\.example",
      "https://c\\.example",
    ]);
    expect(onlineURL.rules[0]?.target).toBe("https://b.example");
    expect(onlineURL.rules[0]?.enable).toBe(true);
    expect(onlineURL.rules[1]?.enable).toBe(false);
  });

  it("keeps the versioned layout as is", () => {
    const onlineURL = toOnlineURL(
      { version: "1.0", rules: [{ origin: "a", target: "b", enable: false }] },
      "https://rules.example/rules.json",
    );

    expect(onlineURL.rules).toHaveLength(1);
    expect(onlineURL.rules[0]?.enable).toBe(false);
  });
});
