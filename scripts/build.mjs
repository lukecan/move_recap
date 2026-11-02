// Builds the public site into dist/ for recap.mertcangenc.com.
//   - copies app/ (the site root) and src/ (as js/)
//   - self-hosts zip.js and the font families; the only outside request is
//     the anonymous GoatCounter pixel on the start page (img-src only;
//     connect-src stays 'none', so file data still can't leave the page)
//   - adds link-preview meta tags, licenses.txt and the CNAME file
//   - fails if a page lacks the no-network CSP, has inline scripts or loads
//     anything from another host
// Run: npm run build
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const DIST = join(ROOT, "dist");
const SITE = "https://recap.mertcangenc.com";
const nm = p => join(ROOT, "node_modules", p);

rmSync(DIST, { recursive: true, force: true });
mkdirSync(join(DIST, "js"), { recursive: true });
mkdirSync(join(DIST, "vendor"), { recursive: true });
mkdirSync(join(DIST, "fonts"), { recursive: true });

/* fonts: latin + latin-ext faces, unicode-range kept from fontsource's CSS */
// Antalya theme (also the site UI), then Race Bib and Topo for share images. Browsers only download a face when it's used.
const FONTS = {
  unbounded: [500, 700, 900], "familjen-grotesk": [400, 500, 600], "jetbrains-mono": [400, 600],
  "big-shoulders-display": [700, 900], barlow: [400, 600], "ibm-plex-mono": [400, 600],
  "zilla-slab": [500, 700], "work-sans": [400, 600], "space-mono": [400, 700],
};
let css = "/* Self-hosted from @fontsource (SIL Open Font License) */\n";
for (const [fam, weights] of Object.entries(FONTS)) {
  for (const w of weights) for (const subset of ["latin-ext", "latin"]) {
    const face = readFileSync(nm(`@fontsource/${fam}/${subset}-${w}.css`), "utf8");
    const file = `${fam}-${subset}-${w}-normal.woff2`;
    cpSync(nm(`@fontsource/${fam}/files/${file}`), join(DIST, "fonts", file));
    css += face.replace(/src:[^;]+;/, `src: url(./${file}) format("woff2");`) + "\n";
  }
}
writeFileSync(join(DIST, "fonts", "fonts.css"), css);

/* scripts */
cpSync(nm("@zip.js/zip.js/dist/zip.min.js"), join(DIST, "vendor", "zip.min.js"));
for (const f of ["insights.js", "geo.js", "parse-export.js", "parse-csv.js", "share.js"]) cpSync(join(ROOT, "src", f), join(DIST, "js", f));

/* offline city list for the Places card: cities of 100k+ people plus capitals and province seats */
{
  const { createRequire } = await import("node:module");
  const cities = createRequire(import.meta.url)("all-the-cities");
  const rows = cities.filter(c => c.population >= 100000 || /^(PPLC|PPLA)$/.test(c.featureCode))
    .map(c => [c.name, c.country, c.loc.coordinates[1].toFixed(2), c.loc.coordinates[0].toFixed(2), c.population].join("|"));
  writeFileSync(join(DIST, "js", "cities.js"), `/* ${rows.length} cities from GeoNames (geonames.org, CC BY 4.0) via all-the-cities. Loaded only when a full export is opened. */\nGeo.setData(${JSON.stringify(rows.join("\n"))});\n`);
}

/* pages */
const META = `
<meta name="description" content="Your year in sport, free. Drop in your Garmin export and get a Wrapped-style recap. Processed on your device; nothing is uploaded.">
<meta name="theme-color" content="#14112a">
<meta property="og:type" content="website">
<meta property="og:url" content="${SITE}/">
<meta property="og:title" content="Wellbeing Recap: your year in sport, free">
<meta property="og:description" content="Drop in your Garmin export, get your year as a story. No subscription. Your data never leaves your browser.">
<meta property="og:image" content="${SITE}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="favicon.svg" type="image/svg+xml">`;

// Every page must: carry the no-network CSP, have no inline <script>, load nothing from other hosts.
const CSP_RE = /<meta http-equiv="Content-Security-Policy" content="[^"]*connect-src 'none'[^"]*">/;
for (const page of readdirSync(join(ROOT, "app")).filter(f => f.endsWith(".html"))) {
  let html = readFileSync(join(ROOT, "app", page), "utf8");
  if (page === "index.html") html = html.replace(/(<title>[^<]*<\/title>)/, `$1${META}`);
  const problems = [];
  if (!CSP_RE.test(html)) problems.push("missing CSP with connect-src 'none'");
  if (/<script(?![^>]*\bsrc=)[^>]*>/.test(html)) problems.push("inline <script> (CSP would block it)");
  // anything the browser would fetch on its own (links to other sites in <a> are fine)
  const leaks = html.match(/<(?:script|link|img|iframe|source|video|audio|embed)\b[^>]*?\b(?:src|href)="(?:https?:)?\/\/[^"]+"/gi);
  if (leaks?.length) problems.push(`third-party resources: ${leaks.join(", ")}`);
  for (const ref of html.matchAll(/(?:src|href)="(?!https?:|#|mailto:)([^"]+)"/g)) {
    const path = ref[1].replace(/^\.\//, "") || "index.html";
    const where = path.startsWith("js/") ? join(ROOT, "src", path.slice(3)) : path.startsWith("vendor/") || path.startsWith("fonts/") ? null : join(ROOT, "app", path);
    if (where && !existsSync(where)) problems.push(`broken reference: ${ref[1]}`);
  }
  if (problems.length) throw new Error(`${page}: ${problems.join("; ")}`);
  writeFileSync(join(DIST, page), html);
}
for (const f of readdirSync(join(ROOT, "app")).filter(f => /\.(js|png|svg)$/.test(f))) cpSync(join(ROOT, "app", f), join(DIST, f));

/* licenses: ours plus the full text of everything we ship */
const lic = [["Wellbeing Recap", join(ROOT, "LICENSE")], ["zip.js", nm("@zip.js/zip.js/LICENSE")], ["all-the-cities (code)", nm("all-the-cities/LICENSE")],
  ...Object.keys(FONTS).map(f => [`Font: ${f}`, nm(`@fontsource/${f}/LICENSE`)])];
writeFileSync(join(DIST, "licenses.txt"), lic.map(([n, f]) => `==== ${n} ====\n\n${readFileSync(f, "utf8").trim()}\n`).join("\n")
  + "\n==== City data ====\n\nCity names, countries, coordinates and populations: GeoNames (https://www.geonames.org), licensed under\nCreative Commons Attribution 4.0 (https://creativecommons.org/licenses/by/4.0/). Filtered to cities of 100,000+ people,\ncapitals and province seats; coordinates rounded to two decimals.\n");
writeFileSync(join(DIST, "CNAME"), "recap.mertcangenc.com\n");
writeFileSync(join(DIST, ".nojekyll"), "");

console.log("Built dist/:", readdirSync(DIST).join(", "));
