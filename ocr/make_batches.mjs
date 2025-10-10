import fs from "fs/promises";
import path from "path";

const SRC = "paragraphs.tagged.jsonl";
const OUT_DIR = "batches";
const MAX_CHARS = 8000;

// Heuristic junk filter: very short & mostly Latin/digits/symbols
function isJunk(s) {
  const t = s.trim();
  if (!t) return true;
  if (t.length <= 3 && /^[A-Za-z0-9.\-_/+ ]+$/.test(t)) return true;
  // frequent OCR noise tokens
  if (/^(PL3|PLS|WEN|MEP)$/i.test(t)) return true;
  return false;
}

// Merge consecutive items with same tag into blocks
function mergeByTag(items) {
  const blocks = [];
  let cur = null;
  for (const it of items) {
    if (!cur || cur.tag !== it.tag) {
      if (cur) blocks.push(cur);
      cur = { tag: it.tag, paras: [it.text] };
    } else {
      cur.paras.push(it.text);
    }
  }
  if (cur) blocks.push(cur);
  return blocks;
}

// Label block
function labelOf(tag) {
  return tag === "kanbun_like" ? "[KANBUN]" : "[JAPANESE]";
}

const src = await fs.readFile(SRC, "utf8");
const lines = src.trim().split(/\r?\n/);

// 1) parse, filter junk
const records = [];
for (const line of lines) {
  try {
    const d = JSON.parse(line);
    const text = String(d.text ?? "").replace(/\r\n?/g, "\n").trim();
    const tag = d.tag === "kanbun_like" ? "kanbun_like" : "jp";
    if (!isJunk(text)) records.push({ id: d.id, text, tag });
  } catch {
    /* ignore bad lines */
  }
}

// 2) merge consecutive paragraphs by tag
const mergedBlocks = mergeByTag(records);

// 3) build a single big string with labels, preserving paragraphs
const labeled = mergedBlocks
  .map(b => `${labelOf(b.tag)}\n${b.paras.join("\n\n")}`)
  .join("\n\n");

// 4) split into ~MAX_CHARS batches at paragraph boundaries
const paras = labeled.split(/\n{2,}/);
const batches = [];
let buf = "";

for (const p of paras) {
  const chunk = (buf ? buf + "\n\n" : "") + p;
  if (chunk.length <= MAX_CHARS) {
    buf = chunk;
  } else {
    if (buf) batches.push(buf);
    if (p.length <= MAX_CHARS) {
      buf = p;
    } else {
      // extremely long paragraph: hard-split every ~MAX_CHARS
      let s = p;
      while (s.length > MAX_CHARS) {
        batches.push(s.slice(0, MAX_CHARS));
        s = s.slice(MAX_CHARS);
      }
      buf = s;
    }
  }
}
if (buf) batches.push(buf);

// 5) write out
await fs.mkdir(OUT_DIR, { recursive: true });
await Promise.all(
  batches.map((content, i) =>
    fs.writeFile(path.join(OUT_DIR, `batch_${String(i + 1).padStart(3, "0")}.txt`), content, "utf8")
  )
);

console.log(`Wrote ${batches.length} batches to ${OUT_DIR}/`);