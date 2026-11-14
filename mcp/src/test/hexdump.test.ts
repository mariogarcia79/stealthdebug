import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { parseHexdump, serializeHexdump, formatXxd, fieldValues } from "../hexdump.js";

const XXD = `00000000: 2705 1956 6a1c 4b2e 51f6 2b3c 0013 2a7c  '..Vj.K.Q.+<..*|
00000010: 8000 8000 8000 8000 b6fa 8c33 0505 0200  ...........3....
00000020: 4c69 6e75 78                             Linux`;

test("the MCP copy is the site's parser, unchanged", () => {
  const site = path.resolve(process.cwd(), "../frontend/src/utils/hexdump.ts");
  if (!existsSync(site)) return;   // the image build has only mcp/
  assert.equal(readFileSync(path.resolve(process.cwd(), "src/hexdump.ts"), "utf8"), readFileSync(site, "utf8"));
});

test("xxd, including an ASCII column that looks like hex", () => {
  const d = parseHexdump(`${XXD}\n00000025: dead beef                                face`);
  assert.deepEqual(d.errors, []);
  assert.equal(d.base, 0);
  assert.equal(d.bytes.length, 0x29);
  assert.deepEqual(d.bytes.slice(0, 4), [0x27, 0x05, 0x19, 0x56]);
  assert.deepEqual(d.bytes.slice(0x20, 0x25), [...Buffer.from("Linux")]);
  assert.deepEqual(d.bytes.slice(0x25), [0xde, 0xad, 0xbe, 0xef]);
});

test("hexdump -C with a repeated line and the final length", () => {
  const d = parseHexdump(`00000100  41 41 41 41 41 41 41 41  41 41 41 41 41 41 41 41  |AAAAAAAAAAAAAAAA|
*
00000130  42 43                                             |BC|
00000132`);
  assert.deepEqual(d.errors, []);
  assert.equal(d.base, 0x100);
  assert.equal(d.bytes.length, 0x32);
  assert.deepEqual(d.bytes.slice(0x2f), [0x41, 0x42, 0x43]);
});

test("plain hex, title, fields, errors", () => {
  const d = parseHexdump(`# Header\n27 05 19 56 0x6a,0x1c\n@0x00+4 magic: the magic\n@4-5 two\n@3+2 overlaps\n@0x10+1 outside\n@bad`);
  assert.equal(d.title, "Header");
  assert.deepEqual(d.bytes, [0x27, 0x05, 0x19, 0x56, 0x6a, 0x1c]);
  assert.deepEqual(d.fields, [{ offset: 0, length: 4, name: "magic", note: "the magic" }, { offset: 4, length: 2, name: "two", note: "" }]);
  assert.equal(d.errors.length, 3);
  assert.deepEqual(fieldValues(d, d.fields[0]).map((v) => v.label), ["hex", "u32 LE", "u32 BE"]);
  assert.match(fieldValues(d, d.fields[0])[2].value, /^654645590 \(0x27051956\)$/);
});

test("offsets that jump are reported", () => {
  const d = parseHexdump("00000000: 0001 0203\n00000010: 0405");
  assert.match(d.errors[0], /doesn't follow/);
});

test("serialize round-trips; formatXxd is parseable", () => {
  const body = serializeHexdump("T", formatXxd([1, 2, 3, 4, 5], 0x40), [{ offset: 0x41, length: 2, name: "a: b", note: "n" }]);
  const d = parseHexdump(body);
  assert.deepEqual(d.errors, []);
  assert.equal(d.base, 0x40);
  assert.deepEqual(d.fields, [{ offset: 0x41, length: 2, name: "a  b", note: "n" }]);
});
