// Measures WCAG contrast for every piece of text on every recap card and on the landing page.
// Usage: npm run build && node scripts/contrast-audit.cjs [path/to/export.zip]
// Needs Playwright (npx playwright / the pre-installed one). Exits 1 if anything fails AA.
const { chromium } = require("playwright");
const path = require("path");
const DIST = path.join(__dirname, "..", "dist");

function audit() {
  const parse = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r, g, b, a }; };
  const lum = ({ r, g, b }) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
  // gradients: judge against their darkest/lightest-relevant stop, declared per card
  const GRADIENT = { "c-intro": "rgb(13,58,92)", "c-end": "rgb(12,107,102)" };
  const hex = h => ({ r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16), a: 1 });
  const bgOf = el => {
    if (el.dataset?.bg || el.getAttribute?.("data-bg")) return hex(el.getAttribute("data-bg"));
    // the story's top bar floats over whichever card is showing
    if (el.closest(".top, .bars")) { const vis = [...document.querySelectorAll(".card")].find(c => !c.hidden); if (vis) el = vis; }
    for (let n = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      for (const [cls, col] of Object.entries(GRADIENT)) if (n.classList?.contains(cls)) return parse(col);
      const c = parse(cs.backgroundColor); if (c && c.a > 0.5) return c;
    }
    return parse(getComputedStyle(document.body).backgroundColor);
  };
  const out = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t; (t = walker.nextNode());) {
    const el = t.parentElement; if (!t.textContent.trim() || !el || el.closest("[hidden],script,style,title")) continue;
    if (el.closest("svg") && el.tagName !== "text") continue;
    const cs = getComputedStyle(el); if (cs.visibility === "hidden" || cs.display === "none") continue;
    const card = el.closest(".card"); if (card && card.hidden) continue;
    const bg = bgOf(el); let fg = parse(el.tagName === "text" ? cs.fill : cs.color); if (!fg || !bg) continue;
    const fgOp = parseFloat(cs.opacity) * (el.parentElement ? parseFloat(getComputedStyle(el.parentElement).opacity) : 1);
    fg = over({ ...fg, a: fg.a * fgOp }, bg);
    const L1 = lum(fg), L2 = lum(bg), ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const size = parseFloat(cs.fontSize), bold = +cs.fontWeight >= 700, large = size >= 24 || (bold && size >= 18.66);
    const need = large ? 3 : 4.5;
    if (ratio < need) out.push({ where: card ? [...card.classList].find(c => c.startsWith("c-")) : "landing", text: t.textContent.trim().slice(0, 40), ratio: +ratio.toFixed(2), need, size });
  }
  return out;
}

(async () => {
  const zipPath = process.argv[2];
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 844 }, locale: "en-GB" });
  await p.goto("file://" + path.join(DIST, "index.html"));
  const fails = [...(await p.evaluate(audit))];
  const runDeck = async label => {
    await p.click("#pause"); const n = await p.$$eval(".card", c => c.length);
    for (let i = 0; i < n; i++) { await p.evaluate(i => show(i), i); fails.push(...(await p.evaluate(audit)).map(f => ({ ...f, deck: label }))); }
    await p.click("#close");
  };
  await p.click("#example"); await runDeck("example");
  if (zipPath) { await p.setInputFiles("#file", zipPath); await p.waitForSelector("#story:not([hidden])"); await runDeck("zip"); }
  const uniq = [...new Map(fails.map(f => [`${f.where}|${f.text}`, f])).values()];
  if (uniq.length) { console.log(`${uniq.length} text items below WCAG AA:`); console.table(uniq); process.exitCode = 1; } else console.log("All text meets WCAG AA.");
  await b.close();
})();
