import {
  isSafeUploadName,
  variantWidthsFor,
  variantFilename,
  extractUploadFilenames,
  contentReferences,
  safeBaseName,
  newUploadFilename,
} from "./media";

describe("isSafeUploadName", () => {
  it.each([
    "banner-1773182781025-JR7xbC.webp",
    "uart-header-pinout-1773182837830-IiPB8p.webp",
    "photo.PNG",
    "a.jpeg",
  ])("accepts %s", (name) => expect(isSafeUploadName(name)).toBe(true));

  it.each([
    "../etc/passwd.webp",
    "a/b.webp",
    ".hidden.webp",
    "x..webp",
    "variants",
    "file.webp.tmp-123",
    "script.js",
    "",
  ])("rejects %s", (name) => expect(isSafeUploadName(name)).toBe(false));

  it("rejects non-strings", () => {
    expect(isSafeUploadName(undefined)).toBe(false);
    expect(isSafeUploadName({})).toBe(false);
  });
});

describe("variantWidthsFor", () => {
  it("only generates widths smaller than the original", () => {
    expect(variantWidthsFor(4000)).toEqual([480, 960, 1600]);
    expect(variantWidthsFor(1600)).toEqual([480, 960]);
    expect(variantWidthsFor(1000)).toEqual([480, 960]);
    expect(variantWidthsFor(480)).toEqual([]);
    expect(variantWidthsFor(300)).toEqual([]);
  });
});

describe("variantFilename", () => {
  it("replaces the extension and appends the width", () => {
    expect(variantFilename("banner-1-abc.webp", 480)).toBe("banner-1-abc-480w.webp");
    expect(variantFilename("old.png", 960)).toBe("old-960w.webp");
  });
});

describe("extractUploadFilenames", () => {
  // Shapes taken from real production posts.
  const content = [
    "![banner](/api/uploads/banner-1773182781025-JR7xbC.webp)",
    "text ![exposed PCB](/api/uploads/exposed-pcb-1773182806503-q6AvUp.webp) more",
    "![abs](https://stealthdebug.org/api/uploads/main-components-1773182823056-qiCnPe.webp)",
    "![dup](/api/uploads/banner-1773182781025-JR7xbC.webp)",
    "<img src=\"/api/uploads/raw-html-1-aaaaaa.webp\">",
    "not an upload: /api/posts/123 and /api/uploads/../secret.webp",
  ].join("\n");

  it("finds each referenced upload once", () => {
    expect(extractUploadFilenames(content).sort()).toEqual([
      "banner-1773182781025-JR7xbC.webp",
      "exposed-pcb-1773182806503-q6AvUp.webp",
      "main-components-1773182823056-qiCnPe.webp",
      "raw-html-1-aaaaaa.webp",
    ]);
  });

  it("returns nothing for content without uploads", () => {
    expect(extractUploadFilenames("# Hello\n\nno images")).toEqual([]);
  });
});

describe("contentReferences", () => {
  it("matches relative and absolute URLs", () => {
    expect(contentReferences("![x](/api/uploads/a-1-b.webp)", "a-1-b.webp")).toBe(true);
    expect(contentReferences("![x](https://h/api/uploads/a-1-b.webp)", "a-1-b.webp")).toBe(true);
    expect(contentReferences("![x](/api/uploads/other.webp)", "a-1-b.webp")).toBe(false);
  });
});

describe("safeBaseName / newUploadFilename", () => {
  it("normalises the uploaded name", () => {
    expect(safeBaseName("My Photo (1).PNG")).toBe("my-photo--1-");
    expect(safeBaseName(".png")).toBe("png");      // dotfile: no extension
    expect(safeBaseName("!!!.png")).toBe("image");
    expect(safeBaseName("---.jpg")).toBe("image");
  });

  it("produces safe, unique-looking names", () => {
    const a = newUploadFilename("Board.JPG", 1773182781025);
    expect(a).toMatch(/^board-1773182781025-[A-Za-z0-9]{6}\.webp$/);
    expect(isSafeUploadName(a)).toBe(true);
    expect(newUploadFilename("Board.JPG", 1)).not.toBe(newUploadFilename("Board.JPG", 1));
  });
});
