import { describe, expect, it } from "vitest";

import {
  isLegacyRuleFile,
  parseRuleFile,
  parseRuleList,
  toOnlineURL,
} from "../src/shared/onlineRules";

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

describe("parseRuleList", () => {
  it("returns the rules of a versioned file", () => {
    expect(parseRuleList('{"version":"1.0","rules":[{"origin":"a","target":"b"}]}')).toEqual([
      { origin: "a", target: "b" },
    ]);
  });

  it("converts the legacy layout", () => {
    expect(parseRuleList('{"rules":{"a\\\\.example":{"dstURL":"b.example"}}}')).toEqual([
      { origin: "a\\.example", target: "b.example", enable: true, kind: undefined },
    ]);
  });

  it("accepts a bare array of rules", () => {
    expect(parseRuleList('[{"origin":"a","target":"b"}]')).toEqual([{ origin: "a", target: "b" }]);
  });

  it("accepts a single rule object", () => {
    expect(parseRuleList('{"origin":"a","target":"b"}')).toEqual([{ origin: "a", target: "b" }]);
  });

  it("yields no rule for a file without a rule list", () => {
    expect(parseRuleList('{"version":"1.0"}')).toEqual([]);
  });

  it("rejects invalid JSON and non rule documents", () => {
    expect(() => parseRuleList("nope")).toThrow(SyntaxError);
    expect(() => parseRuleList("null")).toThrow(TypeError);
    expect(() => parseRuleList("42")).toThrow(TypeError);
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
