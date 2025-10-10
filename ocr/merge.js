import fs from "fs";
import path from "path";

const DIR = "./ocr_out";       // folder containing page_0001.txt ... page_0956.txt
const OUT = "./merged_text.txt";

let merged = "";

for (let i = 1; i <= 956; i++) {
  const padded = String(i).padStart(4, "0");
  const filePath = path.join(DIR, `page_${padded}.txt`);

  if (fs.existsSync(filePath)) {
    const text = fs.readFileSync(filePath, "utf8").trim();
    merged += text + "\n\n";  // separate pages with blank line
  } else {
    console.warn(`⚠️ Missing file: ${filePath}`);
  }
}

fs.writeFileSync(OUT, merged);
console.log("✅ Merged text saved to", OUT);