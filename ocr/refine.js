// prepare.js (ESM)
import fs from "fs";

const IN  = "./merged_text.txt";     // your 27k-line file
const OUT = "./cleaned_paragraphs.txt";

// sentence/line helpers
const END_PUNCT = "。！？…‥」』）】〉》";
const MID_PUNCT = "、，：；・";
const OPEN_BRK  = "「『（（〔［｛〈《【";

const isEnd = ch => END_PUNCT.includes(ch);
const isMid = ch => MID_PUNCT.includes(ch);

const headerFooterPatterns = [
  /^\s*第?\s*[一二三四五六七八九十百千0-9]+\s*頁\s*$/,  // “第X頁”
  /^\s*[0-9０-９]{1,4}\s*$/,                               // bare page number
  /^\s*一\s*堂\s*紀\s*事.*$/,                              // running head (tweak)
];

function deNoise(text) {
  return text
    .replace(/\u00A0/g, " ")
    .replace(/[﹒．]/g, "。")
    .replace(/[，]/g, "、")
    .replace(/[ \t]+/g, " ")
    .replace(/[ 　]+$/gm, "")
    .replace(/^[ 　]+/gm, "");
}

function removeHeadersFooters(lines) {
  return lines.filter(l => !headerFooterPatterns.some(rx => rx.test(l)));
}

function mergeLinesToParagraphs(text) {
  const src = text.split(/\r?\n/);
  const lines = removeHeadersFooters(src);

  const out = [];
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]?.trim() ?? "";
    if (!line) { out.push(""); continue; }

    while (i + 1 < lines.length) {
      const next = lines[i + 1]?.trim() ?? "";
      if (!next) break; // paragraph boundary

      const last = line.slice(-1);
      const unfinished =
        !last || !isEnd(last) || isMid(last) || OPEN_BRK.includes(last);

      if (!unfinished) break;

      // join Japanese lines without space
      line = line + next;
      i++;
    }
    out.push(line);
  }

  // collapse 3+ blanks → 1 blank
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

const raw = fs.readFileSync(IN, "utf8");
const cleaned = mergeLinesToParagraphs(deNoise(raw));
fs.writeFileSync(OUT, cleaned, "utf8");
console.log("✅ Wrote:", OUT,
  "\n  paragraphs:", cleaned.split(/\n{2,}/).length);