// tag_kanbun.js (ESM)
import fs from "fs";

const IN  = "./cleaned_paragraphs.txt";
const OUT = "./paragraphs.tagged.jsonl"; // one JSON per line

const text = fs.readFileSync(IN, "utf8");
const paras = text.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);

function kanbunRatio(s) {
  const kanji = (s.match(/[\p{Script=Han}]/gu) || []).length;
  const kana  = (s.match(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu) || []).length;
  const total = kanji + kana;
  return total ? kanji / total : 0;
}

const out = paras.map((p, i) => {
  const ratio = kanbunRatio(p);
  return {
    id: i + 1,
    text: p,
    kanbun_ratio: +ratio.toFixed(3),
    tag: ratio >= 0.9 ? "kanbun_like" : "jp",
  };
});

fs.writeFileSync(OUT, out.map(o => JSON.stringify(o)).join("\n"));
console.log("✅ Wrote:", OUT, "items:", out.length);