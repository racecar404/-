// ocr-kanbun.js
import fs from "fs";
import path from "path";
import sharp from "sharp";
import vision from "@google-cloud/vision";
import { GoogleAuth } from "google-auth-library";

// ---------- CONFIG ----------
const KEYFILE = "../google-cloud-sa-key.json";         // prefer absolute path in production
const IN_DIR  = "../leeWanYong/imageScraper/downloads";
const OUT_DIR = "./ocr_out";
const START   = 102;
const END     = 956;
const FMT     = p => `page_${String(p).padStart(4, "0")}.jpg`;

// threshold to decide "kanbun-like" blocks
const KANBUN_RATIO = 0.85;  // >85% CJK ideographs vs Kana

// ---------- AUTH / CLIENT ----------
const key = JSON.parse(fs.readFileSync(KEYFILE, "utf8"));
const auth = new GoogleAuth({ credentials: key, scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
const client = new vision.ImageAnnotatorClient({ projectId: key.project_id, auth });

// ---------- UTILS ----------
const ensureDir = d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); };

function countChars(text) {
  const kanji = (text.match(/[\u4E00-\u9FFF]/g) || []).length;    // CJK Unified Ideographs
  const kana  = (text.match(/[\u3040-\u30FF]/g) || []).length;    // Hiragana + Katakana
  return { kanji, kana };
}

function isKanbunBlock(text) {
  const { kanji, kana } = countChars(text);
  if (kanji === 0) return false;
  const ratio = kanji / (kanji + kana);
  return ratio >= KANBUN_RATIO;
}

// Reconstruct block text from symbols (keeps Vision’s line breaks)
function blockToText(block) {
  let out = "";
  for (const para of block.paragraphs || []) {
    for (const word of para.words || []) {
      for (const sym of word.symbols || []) {
        out += sym.text || "";
        const bk = sym.property?.detectedBreak?.type;
        if (bk === "SPACE") out += " ";
        if (bk === "SURE_SPACE" || bk === "EOL_SURE_SPACE" || bk === "LINE_BREAK") out += "\n";
      }
    }
    out += "\n";
  }
  return out.trim();
}

// Crop a polygon (block bounding box) out of the page image using sharp
async function cropBlock(imageBuf, vertices) {
  // vertices usually 4 points; compute bbox
  const xs = vertices.map(v => v.x || 0);
  const ys = vertices.map(v => v.y || 0);
  const left = Math.max(0, Math.min(...xs));
  const top  = Math.max(0, Math.min(...ys));
  const width  = Math.max(1, Math.max(...xs) - left);
  const height = Math.max(1, Math.max(...ys) - top);
  return sharp(imageBuf).extract({ left, top, width, height }).toBuffer();
}

// OCR a whole image buffer with language hints
async function ocrBuffer(buf, langHints) {
  const [res] = await client.documentTextDetection({
    image: { content: buf.toString("base64") },
    imageContext: { languageHints: langHints },
  });
  return res;
}

// ---------- MAIN PER-PAGE ----------
async function ocrPageDualPass(imagePath) {
  const imgBuf = fs.readFileSync(imagePath);

  // Pass 1: Japanese
  const resJA = await ocrBuffer(imgBuf, ["ja"]);
  const page = resJA.fullTextAnnotation?.pages?.[0];
  if (!page) return { text: "", diagnostics: "no page" };

  let merged = "";
  let idx = 0;

  for (const block of page.blocks || []) {
    idx++;
    const blockTextJA = blockToText(block);
    if (!blockTextJA.trim()) continue;

    // Decide if the block looks like kanbun
    const isKanbun = isKanbunBlock(blockTextJA);

    if (!isKanbun) {
      merged += blockTextJA + "\n\n";
      continue;
    }

    // Re-OCR only this block region with zh-Hant
    try {
      const cropped = await cropBlock(imgBuf, block.boundingBox.vertices || []);
      const resZH = await ocrBuffer(cropped, ["zh-Hant"]);
      const blockTextZH = resZH.fullTextAnnotation?.text?.trim();

      if (blockTextZH) {
        merged += blockTextZH + "\n\n";
        console.log(`   • Block ${idx}: kanbun → re-OCR (zh-Hant) ✔`);
      } else {
        merged += blockTextJA + "\n\n";
        console.log(`   • Block ${idx}: kanbun re-OCR returned empty, kept JA.`);
      }
    } catch (e) {
      merged += blockTextJA + "\n\n";
      console.log(`   • Block ${idx}: kanbun re-OCR failed (${e.message}), kept JA.`);
    }
  }

  // Light post-processing: merge excessive single-character newlines
  merged = merged
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[^\S\r\n]+\n/g, "\n");

  return { text: merged.trim(), diagnostics: "ok" };
}

// ---------- RUN ----------
ensureDir(OUT_DIR);

for (let p = START; p <= END; p++) {
  const file = path.join(IN_DIR, FMT(p));
  if (!fs.existsSync(file)) {
    console.log(`⚠️  Skipping missing: ${file}`);
    continue;
  }
  console.log(`\n🔄 Processing: ${file}`);

  try {
    const { text } = await ocrPageDualPass(file);
    const outFile = path.join(OUT_DIR, `${path.parse(FMT(p)).name}.txt`);
    fs.writeFileSync(outFile, text, "utf8");
    console.log(`✅ Wrote: ${outFile}  (${text.length.toLocaleString()} chars)`);
  } catch (e) {
    console.error(`❌ Failed for ${file}: ${e.message}`);
  }
}