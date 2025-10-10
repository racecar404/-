// chunk.js (ESM)
import fs from "fs";

const IN  = "./paragraphs.tagged.jsonl";
const DIR = "./chunks";               // output directory
const MAX_CHARS = 3500;               // tune for your translator

if (!fs.existsSync(DIR)) fs.mkdirSync(DIR);

const lines = fs.readFileSync(IN, "utf8").trim().split(/\r?\n/).filter(Boolean);
const items = lines.map(l => JSON.parse(l));

let buf = [];
let size = 0;
let idx = 1;
const mapping = [];

function flush() {
  if (!buf.length) return;
  const filename = `${DIR}/chunk_${String(idx).padStart(4, "0")}.jsonl`;
  fs.writeFileSync(filename, buf.map(o => JSON.stringify(o)).join("\n"));
  mapping.push({ chunk: filename, count: buf.length,
    ids: buf.map(x => x.id), tags: buf.map(x => x.tag) });
  console.log("🧩 Wrote", filename, "paras:", buf.length, "chars:", size);
  buf = []; size = 0; idx++;
}

for (const it of items) {
  const s = it.text + "\n\n";
  if (size + s.length > MAX_CHARS && buf.length) flush();
  buf.push(it);
  size += s.length;
}
flush();

fs.writeFileSync(`${DIR}/index.json`, JSON.stringify(mapping, null, 2));
console.log("✅ Index:", `${DIR}/index.json`);