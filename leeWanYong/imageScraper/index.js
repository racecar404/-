import { chromium } from "playwright";
import fs from "fs/promises";
import path from "path";

const SEARCH_URL = "https://www.nl.go.kr/NL/contents/search.do?pageNum=1&pageSize=30&srchTarget=total&kwd=%E4%B8%80%E5%A0%82%E7%B4%80%E4%BA%8B#!";
const START = 1;
const END = 960;
const OUT_DIR = "downloads";

const selectors = {
  resultLink: "a:has-text('一堂紀事. 全/ 金明秀 編'), a:has-text('일당기사')",
  viewerBtn:
    '#sub_content > div > div > div > div > div.total_search_filter_wrap > div.filtered_result_wrap > div.filtered_result_list > ul:nth-child(3) > li > dl.book_sub_info.grid_wonmun_info > dd > a',

    
  // any <img> whose src looks like the viewer's image endpoint
pageImage: 'img[src*="view_image.jsp"], img[data-src*="view_image.jsp"], #magazine img',
  canvas: "#magazine canvas, .pageContainer canvas, canvas",

  // NEW: next button
  nextBtn: "#next_btn, button#next_btn, #wrap #next_btn",
};

async function ensureDir(d) { try { await fs.mkdir(d, { recursive: true }); } catch {} }

async function $anyFrame(page, selector, timeout = 3000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const h = await page.$(selector);
      if (h) return { handle: h, frame: page.mainFrame() };
      for (const f of page.frames()) {
        if (f === page.mainFrame()) continue;
        const hf = await f.$(selector);
        if (hf) return { handle: hf, frame: f };
      }
    } catch (err) {
      const msg = (err && err.message) || String(err);
      if (msg.includes("Execution context was destroyed")) {
        await page.waitForTimeout(200);
        continue;
      }
      throw err;
    }
    await page.waitForTimeout(150);
  }
  return null;
}

// ---- page signature to detect page change
async function getPageSignature(viewer) {
  const canvasNode = await $anyFrame(viewer, selectors.canvas, 800);
  if (canvasNode) {
    try {
      const sig = await canvasNode.handle.evaluate((c) => {
        try { return c.toDataURL("image/jpeg", 0.5).slice(0, 120); } catch { return null; }
      });
      if (sig) return `canvas:${sig}`;
    } catch {}
  }
  const imgNode = await $anyFrame(viewer, selectors.pageImage, 800);
  if (imgNode) {
    const src = await imgNode.handle.getAttribute("src");
    if (src) return `img:${src}`;
  }
  return null;
}

async function waitForPageChange(viewer, prevSig, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const sig = await getPageSignature(viewer);
    if (sig && sig !== prevSig) return true;
    await viewer.waitForTimeout(200);
  }
  return false;
}

// ---- NEW: click the "Next" button safely
async function clickNextButton(viewer, { timeout = 4000 } = {}) {
  console.log("→ Clicking Next…");
  const btn = await $anyFrame(viewer, selectors.nextBtn, timeout);
  if (!btn) throw new Error("Next button (#next_btn) not found in any frame.");

  // Log a bit about the button (optional)
  try {
    const classes = await btn.handle.getAttribute("class");
    const disabled = await btn.handle.getAttribute("disabled");
    console.log(`   • next_btn classes="${classes || ""}" disabled=${!!disabled}`);
  } catch {}

  await btn.handle.scrollIntoViewIfNeeded().catch(() => {});
  try {
    await btn.handle.click({ timeout: 2000 });
  } catch {
    // overlay or pointer interceptor — force it
    await viewer.waitForTimeout(150);
    await btn.handle.click({ force: true, timeout: 2000 });
  }
}

// ---- saving current page (img -> canvas fallback)
async function saveRenderedPage(viewer, savePath) {
  const imgNode = await $anyFrame(viewer, selectors.pageImage, 1500);
  if (imgNode) {
    const src = await imgNode.handle.getAttribute("src");
    if (src) {
      console.log(`   • Trying <img> src: ${src}`);
      try {
        const bytes = await viewer.evaluate(async (url) => {
          const res = await fetch(url, { credentials: "include" });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const buf = await res.arrayBuffer();
          return Array.from(new Uint8Array(buf));
        }, src);
        await fs.writeFile(savePath, Buffer.from(bytes));
        console.log(`   ✓ Saved via IMG (${bytes.length.toLocaleString()} bytes)`);
        return true;
      } catch (e) {
        console.warn(`   ⚠️ IMG fetch failed (${e?.message || e}); will try canvas.`);
      }
    } else {
      console.log("   • <img> found but no src; will try canvas.");
    }
  } else {
    console.log("   • No <img> found; will try canvas.");
  }

  const canvasNode = await $anyFrame(viewer, selectors.canvas, 2000);
  if (canvasNode) {
    try {
      const dataUrl = await canvasNode.handle.evaluate((c) => c.toDataURL("image/jpeg", 0.98));
      if (dataUrl && dataUrl.startsWith("data:image")) {
        const base64 = dataUrl.split(",")[1];
        await fs.writeFile(savePath, Buffer.from(base64, "base64"));
        console.log(`   ✓ Saved via CANVAS (~${((base64.length * 3) / 4) | 0} bytes)`);
        return true;
      } else {
        console.warn("   ⚠️ Canvas toDataURL did not return an image data URL.");
      }
    } catch (e) {
      console.warn(`   ⚠️ Canvas capture failed: ${e?.message || e}`);
    }
  } else {
    console.log("   • No canvas found to capture.");
  }

  return false;
}

async function run() {
  await ensureDir(OUT_DIR);
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  console.log("Navigating to search page…");
  await page.goto(SEARCH_URL, { waitUntil: "domcontentloaded" });

  console.log("Clicking search result link…");
  await page.click(selectors.resultLink, { timeout: 15000 });
  await page.waitForLoadState("domcontentloaded");

  console.log("Clicking 원문보기 to open viewer…");
  const [viewer] = await Promise.all([
    context.waitForEvent("page").catch(() => null),
    page.click(selectors.viewerBtn, { timeout: 15000 }).catch(async () => {
      const modalBtn = page.locator(
        '#popDetailView[aria-hidden="false"] a:has-text("원문보기"), #popDetailView[aria-hidden="false"] a[onclick*="openViewer"]'
      );
      await modalBtn.waitFor({ state: "visible", timeout: 15000 });
      await modalBtn.click({ force: true });
    }),
  ]);

  let viewerPage = viewer;
  if (!viewerPage) {
    const deadline = Date.now() + 8000;
    while (!viewerPage && Date.now() < deadline) {
      for (const ptab of context.pages()) {
        if (ptab.url().includes("viewer.nl.go.kr")) { viewerPage = ptab; break; }
      }
      if (!viewerPage) await page.waitForTimeout(200);
    }
    if (!viewerPage) viewerPage = page;
  }

  await viewerPage.waitForLoadState("domcontentloaded");
  await viewerPage.waitForTimeout(1200);
  console.log("✅ Viewer tab ready.");

  for (let p = START; p <= END; p++) {
    console.log(`\n=== Page ${p}/${END} ===`);

    // Navigate: for page 1 we assume the viewer already shows it; for subsequent pages, click Next once
    if (p > START) {
      const before = await getPageSignature(viewerPage);
      await clickNextButton(viewerPage, { timeout: 4000 });
      const changed = await waitForPageChange(viewerPage, before, 12000);
      console.log(changed ? "→ Page changed (signature updated)" : "→ Page change not detected; proceeding after grace wait");
      if (!changed) await viewerPage.waitForTimeout(800);
    }

    const fname = `page_${String(p).padStart(4, "0")}.jpg`;
    const savePath = path.resolve(OUT_DIR, fname);
    console.log(`   • Saving to: ${savePath}`);

    try {
      const ok = await saveRenderedPage(viewerPage, savePath);
      if (!ok) console.warn("   ❌ Could not save this page via img/canvas.");
    } catch (e) {
      console.warn(`   ❌ Save threw for page ${p}: ${e.message}`);
    }

    if (p % 25 === 0) {
      console.log("…cooling down a bit to be polite to the server");
      await viewerPage.waitForTimeout(1200);
    }
  }

  console.log("\nAll done. Closing browser.");
  await browser.close();
}

run().catch((e) => {
  console.error("\nFATAL:", e);
  process.exit(1);
});