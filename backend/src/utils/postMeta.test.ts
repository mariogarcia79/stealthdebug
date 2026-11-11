import { readingMinutes, normalizeTags, normalizeSeries, MAX_TAGS } from "./postMeta";

describe("readingMinutes", () => {
  it("is at least 1", () => expect(readingMinutes("")).toBe(1));
  it("counts ~220 words per minute", () => expect(readingMinutes(Array(1760).fill("word").join(" "))).toBe(8));
  it("ignores image markdown and link targets", () => {
    const md = "![banner](/api/uploads/banner-1773182781025-JR7xbC.webp)\n\n## Title\n[text](https://example.com/a/b)";
    expect(readingMinutes(md)).toBe(1);
  });
});

describe("normalizeTags", () => {
  it("normalizes case, # and spaces, and dedupes", () =>
    expect(normalizeTags(["#UART", "Embedded Linux", "uart", "  "])).toEqual(["uart", "embedded-linux"]));
  it("accepts c++ and dotted tags", () => expect(normalizeTags(["c++", "node.js"])).toEqual(["c++", "node.js"]));
  it("treats null as no tags", () => expect(normalizeTags(undefined)).toEqual([]));
  it.each([["not-a-list"], [[1]], [["<script>"]], [["a".repeat(31)]], [["-x"]]])("rejects %p", (v) =>
    expect(() => normalizeTags(v)).toThrow());
  it("limits the count", () =>
    expect(() => normalizeTags(Array.from({ length: MAX_TAGS + 1 }, (_, i) => `t${i}`))).toThrow());
});

describe("normalizeSeries", () => {
  it("strips tags and collapses whitespace", () => expect(normalizeSeries("  ZTE <b>H108N</b>\n")).toBe("ZTE H108N"));
  it("empty means no series", () => expect(normalizeSeries(null)).toBe(""));
  it("rejects non-strings and long names", () => {
    expect(() => normalizeSeries(5)).toThrow();
    expect(() => normalizeSeries("x".repeat(81))).toThrow();
  });
});
