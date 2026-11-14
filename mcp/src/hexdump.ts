// Hex dumps with annotated fields, written in posts as a fenced block:
//
//   ```hexdump
//   # uImage header                                   <- optional title
//   00000000: 2705 1956 6a1c 4b2e 51f6 2b3c 0013 2a7c  '..Vj.K.Q.+<..*|
//   00000010: 8000 8000 8000 8000 b6fa 8c33 0505 0200  ...........3....
//   @0x00+4 magic: uImage magic number                <- fields
//   @0x04+4 hcrc: header CRC32
//   @0x08-0x0b time: creation time (Unix, big endian)
//   ```
//
// Dumps: xxd output, hexdump -C output (with "*" for repeated lines), or
// plain hex bytes (no offsets: the dump starts at 0). Fields: "@offset+length
// name" or "@first-last name" (inclusive), then optionally ": note". Offsets
// are those of the dump, hex (0x...) or decimal. Fields may not overlap.
//
// This file is used by the site (viewer and editor) and copied verbatim to
// the MCP server (mcp/src/hexdump.ts, checked by its tests): keep it free of
// imports.

export interface HexField {
  offset: number;      // absolute, like the dump's offsets
  length: number;
  name: string;
  note: string;
}

export interface Hexdump {
  title: string;
  base: number;        // offset of the first byte
  bytes: number[];
  fields: HexField[];
  errors: string[];    // problems found (the rest is still usable)
}

export const MAX_HEXDUMP_BYTES = 8192;
export const MAX_FIELDS = 64;
const FIELD_RE = /^@\s*(0x[0-9a-f]+|\d+)\s*(?:\+\s*(0x[0-9a-f]+|\d+)|-\s*(0x[0-9a-f]+|\d+))\s+([^:]+?)\s*(?::\s*(.*))?$/i;

const num = (s: string) => (/^0x/i.test(s) ? parseInt(s.slice(2), 16) : parseInt(s, 10));
export const hex = (n: number, width = 2) => n.toString(16).padStart(width, "0");

type Format = "xxd" | "hexdumpC" | "plain";

function detect(line: string): Format {
  if (/^\s*[0-9a-f]+:\s/i.test(line)) return "xxd";
  if (/^\s*[0-9a-f]{4,16}\s+([0-9a-f]{2}\s+){1,16}/i.test(line) && (line.includes("|") || /^\s*[0-9a-f]{4,16}\s{2}/i.test(line))) return "hexdumpC";
  return "plain";
}

function hexTokens(region: string, lineNo: number, errors: string[]): number[] {
  const out: number[] = [];
  for (let tok of region.trim().split(/[\s,]+/)) {
    if (!tok) continue;
    tok = tok.replace(/^0x/i, "");
    if (!/^[0-9a-f]+$/i.test(tok) || tok.length % 2) { errors.push(`line ${lineNo}: "${tok}" is not hex bytes`); return out; }
    for (let i = 0; i < tok.length; i += 2) out.push(parseInt(tok.slice(i, i + 2), 16));
  }
  return out;
}

export function parseHexdump(text: string): Hexdump {
  const errors: string[] = [];
  const fields: HexField[] = [];
  let title = "";
  let format: Format | null = null;
  let base = -1;
  const bytes: number[] = [];
  let repeat: number[] | null = null;   // "*": previous line repeats until the next offset
  let prevLine: number[] = [];

  const lines = text.replace(/\r/g, "").split("\n");
  lines.forEach((raw, idx) => {
    const lineNo = idx + 1;
    const line = raw.trimEnd();
    if (!line.trim()) return;
    if (line.startsWith("@")) {
      const m = FIELD_RE.exec(line.trim());
      if (!m) { errors.push(`line ${lineNo}: field must look like "@0x10+4 name: note"`); return; }
      const offset = num(m[1]);
      const length = m[2] !== undefined ? num(m[2]) : num(m[3]) - offset + 1;
      fields.push({ offset, length, name: m[4].trim().slice(0, 60), note: (m[5] ?? "").trim().slice(0, 300) });
      return;
    }
    if (/^#\s/.test(line) && !bytes.length && !title) { title = line.replace(/^#\s+/, "").slice(0, 120); return; }
    if (line.trim() === "*") { repeat = prevLine; return; }

    format ??= detect(line);
    let offset: number | null = null;
    let region = line;
    if (format === "xxd") {
      const m = /^\s*([0-9a-f]+):(.*)$/i.exec(line);
      if (!m) { errors.push(`line ${lineNo}: expected "offset: bytes"`); return; }
      offset = parseInt(m[1], 16);
      region = m[2].replace(/^\s/, "").split(/\s{2,}/)[0];   // the ASCII column follows two spaces
    } else if (format === "hexdumpC") {
      const m = /^\s*([0-9a-f]+)(.*)$/i.exec(line);
      if (!m) { errors.push(`line ${lineNo}: expected "offset  bytes  |ascii|"`); return; }
      offset = parseInt(m[1], 16);
      region = m[2].split("|")[0];
      if (!region.trim()) { // last line of hexdump -C: just the total length
        if (repeat && base >= 0) { while (base + bytes.length + prevLine.length <= offset) bytes.push(...prevLine); repeat = null; }
        return;
      }
    }

    const lineBytes = hexTokens(region, lineNo, errors);
    if (offset !== null) {
      if (base < 0) base = offset;
      if (repeat && repeat.length) {
        while (base + bytes.length + repeat.length <= offset) bytes.push(...repeat);
        repeat = null;
      }
      const expected = base + bytes.length;
      if (offset !== expected) {
        errors.push(`line ${lineNo}: offset 0x${hex(offset)} doesn't follow the previous bytes (0x${hex(expected)})`);
        return;
      }
    } else if (base < 0) base = 0;
    bytes.push(...lineBytes);
    prevLine = lineBytes;
  });

  if (base < 0) base = 0;
  if (bytes.length > MAX_HEXDUMP_BYTES) {
    errors.push(`the dump has ${bytes.length} bytes: only the first ${MAX_HEXDUMP_BYTES} are kept`);
    bytes.length = MAX_HEXDUMP_BYTES;
  }

  // Fields: inside the dump, non-empty, not overlapping (the later one goes)
  const ok: HexField[] = [];
  for (const f of fields.slice(0, MAX_FIELDS)) {
    const end = f.offset + f.length;
    if (!Number.isFinite(f.offset) || !(f.length >= 1)) { errors.push(`field "${f.name}": empty range`); continue; }
    if (f.offset < base || end > base + bytes.length) { errors.push(`field "${f.name}": 0x${hex(f.offset)}+${f.length} is outside the dump`); continue; }
    const clash = ok.find((g) => f.offset < g.offset + g.length && g.offset < end);
    if (clash) { errors.push(`field "${f.name}" overlaps "${clash.name}"`); continue; }
    ok.push(f);
  }
  if (fields.length > MAX_FIELDS) errors.push(`at most ${MAX_FIELDS} fields`);
  if (!bytes.length) errors.push("no bytes found");

  return { title, base, bytes, fields: ok, errors };
}

// Canonical xxd-style text of some bytes
export function formatXxd(bytes: number[], base = 0): string {
  const out: string[] = [];
  const first = Math.floor(base / 16) * 16;
  for (let row = first; row < base + bytes.length; row += 16) {
    const cells: string[] = [];
    let ascii = "";
    for (let i = row; i < row + 16; i++) {
      const b = i >= base && i < base + bytes.length ? bytes[i - base] : null;
      cells.push(b === null ? "  " : hex(b));
      ascii += b === null ? " " : b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : ".";
    }
    const groups = [];
    for (let i = 0; i < 16; i += 2) groups.push(cells[i] + cells[i + 1]);
    out.push(`${hex(row, 8)}: ${groups.join(" ")}  ${ascii.trimEnd()}`);
  }
  return out.join("\n");
}

const fieldLine = (f: HexField) =>
  `@0x${hex(f.offset)}+${f.length} ${f.name.replace(/[:\n]/g, " ").trim()}${f.note ? `: ${f.note.replace(/\n/g, " ")}` : ""}`;

// Body of a ```hexdump block: the title, the dump as given, the fields
export function serializeHexdump(title: string, dumpText: string, fields: HexField[]): string {
  const dump = dumpText.replace(/\r/g, "").split("\n").map((l) => l.trimEnd())
    .filter((l) => l.trim() && !l.startsWith("@") && !/^#\s/.test(l)).join("\n");
  return [title.trim() ? `# ${title.trim().replace(/\n/g, " ")}` : "", dump, ...[...fields].sort((a, b) => a.offset - b.offset).map(fieldLine)]
    .filter(Boolean).join("\n");
}

// The dump part of a block body (without title and field lines)
export function dumpText(body: string): string {
  return body.replace(/\r/g, "").split("\n").filter((l) => !l.startsWith("@") && !/^#\s/.test(l)).join("\n").trim();
}

// The value of a field read several ways, for the info panel
export function fieldValues(d: Hexdump, f: { offset: number; length: number }): { label: string; value: string }[] {
  const b = d.bytes.slice(f.offset - d.base, f.offset - d.base + f.length);
  const out = [{ label: "hex", value: b.map((x) => hex(x)).join(" ") }];
  if ([1, 2, 4, 8].includes(b.length)) {
    const le = b.reduceRight((acc, x) => (acc << 8n) | BigInt(x), 0n);
    const be = b.reduce((acc, x) => (acc << 8n) | BigInt(x), 0n);
    if (b.length === 1) out.push({ label: "u8", value: `${be} (0x${be.toString(16)})` });
    else {
      out.push({ label: `u${b.length * 8} LE`, value: `${le} (0x${le.toString(16).padStart(b.length * 2, "0")})` });
      out.push({ label: `u${b.length * 8} BE`, value: `${be} (0x${be.toString(16).padStart(b.length * 2, "0")})` });
    }
  }
  const printable = b.filter((x) => x >= 0x20 && x < 0x7f).length;
  if (b.length > 1 && printable >= b.length * 0.75) {
    out.push({ label: "ascii", value: JSON.stringify(b.map((x) => (x >= 0x20 && x < 0x7f ? String.fromCharCode(x) : ".")).join("")) });
  }
  return out;
}
