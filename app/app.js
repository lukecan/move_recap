"use strict";
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const num = n => Math.round(n).toLocaleString("en-US");
const TITLES = { when: "When you move", zones: "Heart-rate DNA", stress: "Your stress week", steps: "Steps", sleep: "Sleep", body: "Your body", sweat: "Sweat", climb: "Climbing" };
const FOOT = '<div class="foot">From your Garmin Connect data</div>';

/* ---------- example (invented) ---------- */
const EXAMPLE = {
  period: { mode: "year", label: "2026 Recap", range: "Jan 1 → Nov 2, 2026", days: 306 },
  name: "Alex", example: true,
  totals: { activities: 96, activeDays: 81, longestStreak: 6, hours: 142, families: { "walking & hiking": { count: 58, km: 690, hours: 110 }, running: { count: 21, km: 140, hours: 15 }, strength: { count: 17, km: 0, hours: 17 } } },
  byHour: { 8: 9, 9: 14, 10: 12, 11: 6, 14: 4, 17: 3, 19: 4 },
  byWeekday: { Mon: 3, Tue: 4, Wed: 2, Thu: 5, Fri: 3, Sat: 18, Sun: 17 },
  zoneHours: [14, 18, 22, 6, 1],
  stressByWeekday: { Mon: 33, Tue: 35, Wed: 42, Thu: 39, Fri: 34, Sat: 21, Sun: 19 }, days: 300,
  steps: { total: 3825000, days: 300, bestDay: { date: "Sep 14", steps: 41000 } },
  sleep: { nights: 280, avgHours: 7.1, avgScore: 74, bedtime: "23:05", wake: "06:50" },
  body: { days: 295, rhr: [60, 59], vo2: [40, 42], fitnessAge: [38.0, 37.2] },
  sweatLiters: 140, climbMeters: 14000,
};

/* ---------- language (landing page only; cards stay English for now) ---------- */
const T = {
  en: {
    statusOpening: "Opening your file…", statusReading: (i, n, f) => `Reading ${i} of ${n}: ${f}`, statusFailed: "Something went wrong reading this file.",
    errNotZip: "Please choose the .zip file from Garmin's email (no need to unzip it) or the Activities .csv file.",
    errNotExport: "This ZIP doesn't look like a Garmin Connect export. Look for a file Garmin emailed you after “Request Data Export”.",
    errNotCsv: "This CSV doesn't look like Garmin Connect's activity list. Use “Export CSV” on the Activities page.",
    errNoData: "No activities or daily summaries found. Is this a Garmin Connect data export?",
    errEmptyCsv: "No activities found in this CSV.",
    statusUnits: "One question before your quick recap: which units does your Garmin use?",
    calTitle: "Garmin export ready? Open your Wellbeing Recap",
    calBody: "Check your email for Garmin's download link, then drop the ZIP at https://recap.mertcangenc.com",
    calFile: "wellbeing-recap-reminder.ics",
  },
  tr: {
    h1: "Sporla geçen yılın. <em>Ücretsiz.</em> Abonelik yok.",
    lede: "Garmin verilerini bırak, yılını bir hikâye olarak gör: ne zaman hareket ettiğin, kalbinin nasıl değiştiği, nasıl uyuduğun ve nasıl bir sporcu olduğun.",
    uploadLabel: "Dosyanı yükle",
    unitsLegend: "Garmin'in hangi birimleri kullanıyor?", metric: "Metrik", imperial: "Emperyal",
    unitsNote: "Aktivite CSV'n bunu söylemiyor. Garmin Connect hesabında ne görüyorsan onu seç.",
    unitsGo: "Hızlı özetimi hazırla",
    previewLabel: "Örnek bir özete göz at", previewTag: "Örnek · oynatmak için dokun",
    remindText: "Talep ettin mi? 2 gün sonrası için hatırlatıcı ekle:", remindGoogle: "Google Takvim", remindApple: "Apple Takvim",
    statusUnits: "Hızlı özetinden önce tek bir soru: Garmin'in hangi birimleri kullanıyor?",
    calTitle: "Garmin export'un hazır mı? Wellbeing Recap'ini aç",
    calBody: "Garmin'in indirme bağlantısı için e-postana bak, sonra ZIP'i https://recap.mertcangenc.com adresine bırak.",
    calFile: "wellbeing-recap-hatirlatici.ics",
    pill: "Cihazında işlenir · hiçbir şey yüklenmez",
    dropTitle: "Garmin export ZIP'ini ya da aktivite CSV'ni buraya bırak",
    dropSub: "ya da dosyayı seçmek için dokun",
    example: "Örnek bir özete göz at",
    fullTitle: "Tam özet: verilerini 3 adımda indir",
    full1: "Bilgisayardan <code>garmin.com/account/datamanagement</code> adresini aç ve saatinin bağlı olduğu hesapla giriş yap. Telefon uygulamasından dışa aktarma yapılamıyor.",
    full2: "<b>Export Your Data</b>, ardından <b>Request Data Export</b>'u seç. Garmin indirme bağlantısını genelde 24–48 saat içinde e-postayla gönderir.",
    full3: "E-postadaki ZIP'i indir (bağlantının süresi doluyor) ve yukarıya bırak. Dosyayı açmana gerek yok.",
    quickTitle: "Acelen mi var? Aktivite listenden hızlı özet",
    quick1: "Bilgisayardan <code>connect.garmin.com</code> adresini aç ve <b>Activities → All Activities</b> sayfasına git.",
    quick2: "Sayfayı <b>en alta kadar kaydır</b>, yeni aktivite yüklenmeyene kadar devam et. Garmin sadece ekranda görünen satırları indiriyor; kaydırmazsan elinde 20 aktivite kalır.",
    quick3: "Sağ üstteki <b>Export CSV</b>'ye tıkla ve dosyayı yukarıya bırak. Aktivite kartların hemen hazır olur. Uyku, stres ve kalp kartları için tam export gerekiyor.",
    f1t: "Verin sende kalır", f1: "Dosya bu sayfanın içinde okunur. Sunucu yok, hesap yok, çerez yok.",
    f2t: "Sadece gerekenler", f2: "Aktivite özetlerini, günlük istatistikleri, uykuyu ve fitness yaşını okuruz. Ham GPS dosyalarına dokunmayız.",
    f3t: "İlk gününden itibaren", f3: "Saatini bu yıl mı aldın? Özetin aldığın günden başlar. Değilse bütün takvim yılını kapsar.",
    legal: 'Garmin Connect veri export\'larıyla çalışır. Garmin ile bağlantılı değildir ve Garmin tarafından desteklenmez. Yorumlar eğlence ve motivasyon içindir, tıbbi tavsiye değildir. <a href="privacy.html">Gizlilik</a> · <a href="https://github.com/lukecan/wellbeing_recap" rel="noopener">Açık kaynak (MIT)</a> · <a href="https://github.com/lukecan/wellbeing_recap/issues/new/choose" target="_blank" rel="noopener">Geri bildirim ve hatalar</a>',
    statusOpening: "Dosyan açılıyor…", statusReading: (i, n, f) => `Okunuyor (${i}/${n}): ${f}`, statusFailed: "Dosya okunurken bir sorun çıktı.",
    errNotZip: "Lütfen Garmin'in e-postasındaki .zip dosyasını (açmadan) ya da aktivite listesinin .csv dosyasını seç.",
    errNotExport: "Bu ZIP bir Garmin Connect export'una benzemiyor. “Request Data Export” sonrası Garmin'in e-postayla gönderdiği dosyayı kullan.",
    errNotCsv: "Bu CSV, Garmin Connect'in aktivite listesine benzemiyor. Activities sayfasındaki “Export CSV” düğmesini kullan.",
    errNoData: "Hiç aktivite ya da günlük özet bulunamadı. Bu bir Garmin Connect export'u mu?",
    errEmptyCsv: "Bu CSV'de hiç aktivite yok.",
  },
};
const ENGLISH = {};
document.querySelectorAll("[data-i18n]").forEach(el => (ENGLISH[el.dataset.i18n] = el.innerHTML));
document.querySelectorAll("[data-i18n-label]").forEach(el => (ENGLISH[el.dataset.i18nLabel] = el.getAttribute("aria-label")));
let lang = (() => { try { const v = localStorage.getItem("wr-lang"); if (v === "en" || v === "tr") return v; } catch (e) {} return /^tr\b/i.test(navigator.language || "") ? "tr" : "en"; })();
const t = (key, ...args) => { const v = (T[lang] && T[lang][key]) ?? T.en[key] ?? ENGLISH[key]; return typeof v === "function" ? v(...args) : v; };
function applyLang() {
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-i18n]").forEach(el => { el.innerHTML = lang === "en" ? ENGLISH[el.dataset.i18n] : (T[lang][el.dataset.i18n] ?? ENGLISH[el.dataset.i18n]); });
  document.querySelectorAll("[data-i18n-label]").forEach(el => el.setAttribute("aria-label", (lang === "tr" && T.tr[el.dataset.i18nLabel]) || ENGLISH[el.dataset.i18nLabel]));
  setCalendarLink();
  document.querySelectorAll(".lang button").forEach(b => b.setAttribute("aria-pressed", b.dataset.lang === lang));
}
document.querySelector(".lang").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; lang = b.dataset.lang; try { localStorage.setItem("wr-lang", lang); } catch (err) {} applyLang(); status(""); });
applyLang();
// parsers throw English messages; show them in the page language
const ERRORS = [[/^Please choose the \.zip/, "errNotZip"], [/^This ZIP doesn't look/, "errNotExport"], [/^This CSV doesn't look/, "errNotCsv"], [/^No activities or daily summaries/, "errNoData"], [/^No activities found in this CSV/, "errEmptyCsv"]];
const localError = e => { const m = String(e?.message || ""); const hit = ERRORS.find(([re]) => re.test(m)); return hit ? t(hit[1]) : t("statusFailed"); };

/* ---------- anonymous visit count (GoatCounter, no script, no cookies) ----------
   One image request per page view with: the page path, the site the visitor came from (origin only,
   or ?ref= / utm_source from our own links) and a cache-buster. Never any file data: file contents
   can't leave the page because the CSP blocks every connection (connect-src 'none'). Skipped when the
   browser asks not to be tracked, and everywhere except the live site. */
(function countVisit() {
  try {
    if (location.hostname !== "recap.mertcangenc.com" || navigator.doNotTrack === "1" || window.doNotTrack === "1" || navigator.globalPrivacyControl) return;
    const qs = new URLSearchParams(location.search);
    let ref = qs.get("ref") || qs.get("utm_source") || "";
    if (!ref && document.referrer) { const o = new URL(document.referrer).origin; if (o !== location.origin) ref = o; }
    const q = new URLSearchParams({ p: location.pathname, r: ref, rnd: Math.random().toString(36).slice(2) });
    new Image().src = "https://wellbeing-recap.goatcounter.com/count?" + q.toString();
  } catch (e) { /* counting is optional */ }
})();

/* ---------- units ---------- */
const IMPERIAL_LOCALES = /^(en-US|en-LR|my)(-|$)/i;
let units = (() => { try { const v = localStorage.getItem("wr-units"); if (v === "metric" || v === "imperial") return v; } catch (e) {} return IMPERIAL_LOCALES.test(navigator.language || "") ? "imperial" : "metric"; })();
// ZIP exports are always metric inside, so units only change wording there; we ask only when a CSV arrives.
$("#u-" + units).checked = true;
$("#units").addEventListener("change", e => { if (e.target.name !== "units") return; units = e.target.value; try { localStorage.setItem("wr-units", units); } catch (err) {} });
let pendingCsv = null;
$("#unitsGo").addEventListener("click", async () => {
  const file = pendingCsv; pendingCsv = null; $("#units").hidden = true;
  if (!file) return;
  status(t("statusOpening"));
  try { const stats = await readCsv(file); stats.units = units; status(""); openStory(stats); }
  catch (e) { console.warn(e); status(localError(e), true); }
});
const dist = (km, u) => Insights.distance(km, u);

/* ---------- reading the ZIP ---------- */
const status = (msg, err = false) => { const s = $("#status"); s.textContent = msg; s.classList.toggle("err", err); };
async function readExport(file) {
  if (!/\.zip$/i.test(file.name)) throw new Error(T.en.errNotZip);
  zip.configure({ useWebWorkers: false });
  const reader = new zip.ZipReader(new zip.BlobReader(file));
  try {
    const entries = await reader.getEntries();
    const wanted = entries.filter(e => !e.directory && ParseExport.isWanted(e.filename));
    if (!wanted.length) throw new Error(T.en.errNotExport);
    const files = new Map();
    for (const [i, e] of wanted.entries()) {
      status(t("statusReading", i + 1, wanted.length, e.filename.split("/").pop().replace(/^[^_]*@[^_]*_/, "")));
      try { files.set(e.filename, JSON.parse(await e.getData(new zip.TextWriter()))); } catch (err) { console.warn("skipped", e.filename, err); }
    }
    return ParseExport.computeStats(files);
  } finally { await reader.close(); }
}
async function readCsv(file) {
  const text = await file.text();
  if (!ParseCsv.isGarminCsv(text)) throw new Error(T.en.errNotCsv);
  return ParseCsv.computeStatsFromCsv(text, { units });
}
async function handle(file) {
  if (!file) return;
  if (/\.csv$/i.test(file.name)) {
    pendingCsv = file; $("#units").hidden = false; status(t("statusUnits"));
    $("#units").scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    $("#u-" + units).focus();
    return;
  }
  $("#units").hidden = true; pendingCsv = null;
  status(t("statusOpening"));
  try { const stats = await readExport(file); stats.units = units; status(""); openStory(stats); }
  catch (e) { console.warn(e); status(localError(e), true); }
}
const drop = $("#drop");
$("#file").addEventListener("change", e => handle(e.target.files[0]));
["dragenter", "dragover"].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", e => handle(e.dataTransfer.files[0]));
$("#example").addEventListener("click", () => openStory({ ...EXAMPLE, units }));
$("#preview").addEventListener("click", () => openStory({ ...EXAMPLE, units }));

/* ---------- "remind me" for the 1–2 day export wait (no server: a calendar link and an .ics file) ---------- */
function reminderTimes() {
  const start = new Date(); start.setDate(start.getDate() + 2); start.setHours(19, 0, 0, 0);
  const end = new Date(start.getTime() + 15 * 60000);
  const z = d => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return { start, end, s: z(start), e: z(end) };
}
function setCalendarLink() {
  const r = reminderTimes();
  const q = new URLSearchParams({ action: "TEMPLATE", text: t("calTitle"), dates: `${r.s}/${r.e}`, details: t("calBody") });
  $("#gcal").href = "https://calendar.google.com/calendar/render?" + q.toString();
}
$("#ical").addEventListener("click", () => {
  const r = reminderTimes(), esc = s => s.replace(/[\\;,]/g, m => "\\" + m);
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Wellbeing Recap//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT", `UID:${Date.now()}@recap.mertcangenc.com`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`,
    `DTSTART:${r.s}`, `DTEND:${r.e}`, `SUMMARY:${esc(t("calTitle"))}`, `DESCRIPTION:${esc(t("calBody"))}`, "URL:https://recap.mertcangenc.com",
    "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(t("calTitle"))}`, "TRIGGER:PT0M", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR"].join("\r\n") + "\r\n";
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: t("calFile") });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
});
setCalendarLink();

/* ---------- card visuals ---------- */
function vizWhen(byHour) {
  const cx = 150, cy = 140, r0 = 50, rmax = 112, max = Math.max(...Object.values(byHour)); let s = "";
  for (let h = 0; h < 24; h++) {
    const v = byHour[h] || 0, a = h / 24 * Math.PI * 2 - Math.PI / 2 + Math.PI / 24, len = v ? 6 + v / max * (rmax - r0 - 6) : 2;
    s += `<line x1="${cx + Math.cos(a) * r0}" y1="${cy + Math.sin(a) * r0}" x2="${cx + Math.cos(a) * (r0 + len)}" y2="${cy + Math.sin(a) * (r0 + len)}" stroke="${v === max ? "#ee6420" : "rgba(255,248,238,.6)"}" stroke-width="8" stroke-linecap="round"/>`;
  }
  [[0, "12 AM"], [6, "6 AM"], [12, "12 PM"], [18, "6 PM"]].forEach(([h, t]) => { const a = h / 24 * Math.PI * 2 - Math.PI / 2; s += `<text x="${cx + Math.cos(a) * (rmax + 18)}" y="${cy + Math.sin(a) * (rmax + 18) + 4}" text-anchor="middle">${t}</text>`; });
  return `<svg viewBox="0 0 300 280" role="img" aria-label="Workouts by hour of day">${s}</svg>`;
}
function vizZones({ easy, mid, hard }) {
  const W = 300, y = 26, h = 30, e = easy * W, m = mid * W, hd = hard * W, tx = .8 * W;
  // label colour per segment: dark on sand/orange, light on pomegranate (data-bg lets the contrast audit see the real backdrop)
  const seg = (x, w, fill, l, ink = "#14112a") => w <= 0 ? "" : `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>${w > 40 ? `<text x="${x + w / 2}" y="${y + 19}" text-anchor="middle" data-bg="${fill}" style="fill:${ink};font-weight:600">${l}</text>` : ""}`;
  return `<svg viewBox="0 0 ${W} 92" role="img" aria-label="Easy ${Math.round(easy * 100)}%, tempo ${Math.round(mid * 100)}%, hard ${Math.round(hard * 100)}%"><clipPath id="zc"><rect x="0" y="${y}" width="${W}" height="${h}" rx="9"/></clipPath><g clip-path="url(#zc)">${seg(0, e, "#ecdcbc", "easy")}${seg(e, m, "#ee6420", "tempo")}${seg(e + m, hd, "#a8213b", "hard", "#fff8ee")}</g><line x1="${tx}" x2="${tx}" y1="${y - 10}" y2="${y + h + 10}" stroke="#fff8ee" stroke-width="2" stroke-dasharray="3 3"/><text x="${tx}" y="${y - 14}" text-anchor="middle" style="fill:#fff8ee">80% easy target</text><text x="0" y="${y + h + 22}">Zones 1–2</text><text x="${W}" y="${y + h + 22}" text-anchor="end">Zones 4–5</text></svg>`;
}
function vizStress(byDay) {
  const W = 300, H = 120, vals = byDay.map(e => e[1]), lo = Math.min(...vals) - 4, hi = Math.max(...vals), bw = W / byDay.length, peak = hi;
  return `<svg viewBox="0 -16 ${W} ${H + 34}" role="img" aria-label="Average stress by weekday: ${byDay.map(e => e[0] + " " + Math.round(e[1])).join(", ")}">` + byDay.map(([d, v], i) => { const bh = Math.max(3, (v - lo) / (hi - lo || 1) * H), x = i * bw + 5; return `<rect x="${x}" y="${H - bh}" width="${bw - 10}" height="${bh}" rx="5" fill="${v === peak ? "#fff8ee" : "rgba(255,248,238,.38)"}"/><text x="${x + (bw - 10) / 2}" y="${H - bh - 5}" text-anchor="middle" style="fill:#fff8ee">${Math.round(v)}</text><text x="${x + (bw - 10) / 2}" y="${H + 14}" text-anchor="middle">${d}</text>`; }).join("") + "</svg>";
}

/* ---------- building the deck ---------- */
function introCard(s) {
  const who = s.name ? `${esc(s.name)}, ` : "";
  if (s.source === "csv") return ["c-intro", `<div class="eyebrow">${esc(s.period.range)}</div><h1>Your quick recap: ${num(s.totals.activities)} activities.</h1><p>Built from your activities list. Here's what it says about how you move.</p><div class="foot">Tap right → next · Tap left ← back</div>`];
  const h = s.period.mode === "since" ? `${who}your watch has been with you for ${s.period.days} days.` : `${who}here's your ${esc(String(s.period.label).replace(" Recap", ""))}.`;
  return ["c-intro", `<div class="eyebrow">${esc(s.period.range)}</div><h1>${h}</h1><p>Your runs, your rest days, your nights and everything in between. Let's take a look.</p><div class="foot">Tap right → next · Tap left ← back</div>`];
}
function totalsCard(s) {
  const t = s.totals, fams = Object.entries(t.families).sort((a, b) => b[1].hours - a[1].hours).slice(0, 4), maxH = fams[0]?.[1].hours || 1;
  return ["c-totals", `<div class="eyebrow">In total</div><div class="hero"><b>${num(t.activities)}</b><span>activities</span></div>
    <div class="grid2"><div><b>${num(t.activeDays)}</b><span>active days</span></div><div><b>${num(t.longestStreak)}</b><span>days in a row, your longest streak</span></div><div><b>${num(t.hours)} h</b><span>spent moving</span></div><div><b>${Object.keys(t.families).length}</b><span>${Object.keys(t.families).length === 1 ? "kind of sport" : "kinds of sport"}</span></div></div>
    <div class="rows">${fams.map(([f, v]) => `<div class="row"><span class="l">${esc(f)}</span><span class="v">${v.count}×${v.km >= 1 ? ` · ${dist(v.km, s.units)}` : ` · ${num(v.hours)} h`}</span><div class="t"><i style="width:${v.hours / maxH * 100}%"></i></div></div>`).join("")}</div>
    <div class="foot">From your Garmin Connect data</div>`];
}
function insightCard(c, s) {
  const viz = c.id === "when" ? vizWhen(s.byHour) : c.id === "zones" ? vizZones(c.shares) : c.id === "stress" ? vizStress(c.byDay)
    : c.beforeAfter ? `<div>${c.beforeAfter.map(r => `<div class="ba"><span class="k">${esc(r.label)}</span><span class="from">${esc(r.from)}</span><span>→</span><span class="to">${esc(r.to)}${r.unit ? ` <small>${esc(r.unit)}</small>` : ""}</span></div>`).join("")}</div>`
    : c.hero ? `<div class="hero"><b>${esc(c.hero[0])}</b><span>${esc(c.hero[1])}</span></div>` : "";
  return [`c-${c.id}`, `<div class="eyebrow">${TITLES[c.id]}</div><span class="persona">${esc(c.persona)}</span><h2>${esc(c.headline)}</h2>${viz}<p>${esc(c.body)}</p>${FOOT}`];
}
// personas that describe who you are (not fun facts or body trends), best first
const identity = shown => shown.filter(c => ["when", "zones", "stress", "steps", "sleep"].includes(c.id)).slice(0, 2);
function moreCard(s) {
  const tip = s.truncated ? `<p>Your CSV had ${num(s.totals.activities)} activities. Garmin only exports the rows on screen, so scroll to the bottom of the Activities page before you click Export CSV.</p>` : "";
  return ["c-more", `<div class="eyebrow">Want the full story?</div><h2>This was the quick version.</h2>${tip}<p>The full Garmin export adds sleep, stress, steps, heart-rate zones and how your body changed over the year. Request it once; it usually arrives within 1–2 days.</p><div class="foot">garmin.com/account/datamanagement → Export Your Data</div>`];
}
function summaryText(s, shown) {
  const t = s.totals, fams = Object.entries(t.families).sort((a, b) => b[1].km - a[1].km);
  const personas = identity(shown).map(c => c.persona);
  return [`Wellbeing Recap · ${s.period.label}${s.name ? " · " + s.name : ""}`, `${num(t.activities)} activities · ${num(t.activeDays)} active days`,
    fams.filter(([, v]) => v.km >= 1).slice(0, 2).map(([f, v]) => `${dist(v.km, s.units)} ${f}`).join(" · "),
    personas.length ? `My types: ${personas.join(" · ")}` : ""].filter(Boolean).join("\n");
}
function endCard(s, shown) {
  const t = s.totals, fams = Object.entries(t.families).sort((a, b) => b[1].km - a[1].km);
  const tiles = [[num(t.activities), "activities"], [num(t.activeDays), "active days"],
    ...fams.filter(([, v]) => v.km >= 1).slice(0, 2).map(([f, v]) => [dist(v.km, s.units), f]),
    ...identity(shown).map(c => [c.persona, TITLES[c.id].toLowerCase()])].slice(0, 6);
  return ["c-end", `<span class="persona">${esc(s.period.label)}</span><h2>${s.name ? esc(s.name) + "'s" : "Your"} recap</h2>
    <div class="summary">${tiles.map(([v, k]) => `<div><b>${esc(v)}</b><span>${esc(k)}</span></div>`).join("")}</div>
    <button class="share" id="shareAll" type="button">Share my recap ↗</button>
    <a class="fb" href="https://github.com/lukecan/wellbeing_recap/issues/new/choose" target="_blank" rel="noopener">Tell us what you think →</a>
    <div class="foot">Your data never left this page</div>`];
}

/* ---------- share specs: what each card says, in a form Share.render can draw ---------- */
const plain = html => { const d = document.createElement("div"); d.innerHTML = html; return d.textContent; };
function shareSpecs(s, shown) {
  const base = { period: s.period.label, year: s.period.year || String(s.period.end || "").slice(0, 4) };
  const t = s.totals, fams = Object.entries(t.families).sort((a, b) => b[1].hours - a[1].hours).slice(0, 4), maxH = fams[0]?.[1].hours || 1;
  const intro = { ...base, id: "intro", eyebrow: s.period.range,
    headline: s.source === "csv" ? `Your quick recap: ${num(t.activities)} activities.` : plain(introCard(s)[1].match(/<h1>(.*?)<\/h1>/)[1]),
    body: "Your runs, your rest days, your nights and everything in between." };
  const totals = { ...base, id: "totals", eyebrow: "In total", big: [num(t.activities), `activities · ${num(t.activeDays)} active days`],
    viz: { type: "rows", rows: fams.map(([f, v]) => [f, `${v.count}×${v.km >= 1 ? " · " + dist(v.km, s.units) : " · " + num(v.hours) + " h"}`, v.hours / maxH]) } };
  const insight = c => ({ ...base, id: c.id, eyebrow: TITLES[c.id], chip: c.persona, headline: c.headline, body: c.body,
    big: c.beforeAfter ? null : c.hero || null,
    viz: c.id === "when" ? { type: "clock", byHour: s.byHour } : c.id === "zones" ? { type: "zones", shares: c.shares }
      : c.id === "stress" ? { type: "bars", rows: c.byDay } : c.beforeAfter ? { type: "ba", rows: c.beforeAfter } : null });
  const end = { ...base, id: "end", eyebrow: s.period.label, headline: `${s.name ? s.name + "'s" : "My"} ${s.period.mode === "year" ? s.period.label : "recap"}`,
    viz: { type: "tiles", tiles: plainTiles(s, shown) } };
  return [intro, totals, ...shown.map(insight), ...(s.source === "csv" ? [null] : []), end];
}
function plainTiles(s, shown) {
  const t = s.totals, fams = Object.entries(t.families).sort((a, b) => b[1].km - a[1].km);
  return [[num(t.activities), "activities"], [num(t.activeDays), "active days"],
    ...fams.filter(([, v]) => v.km >= 1).slice(0, 2).map(([f, v]) => [dist(v.km, s.units), f]),
    ...identity(shown).map(c => [c.persona, TITLES[c.id].toLowerCase()])].slice(0, 6);
}

/* ---------- story player ---------- */
let cards = [], bars = [], idx = 0, t0 = 0, elapsed = 0, paused = false, raf = 0, summary = "", specs = [], current = null;
const DUR = 15000, reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
function openStory(s) {
  const d = Insights.deck(s);
  const list = [introCard(s), totalsCard(s), ...d.shown.map(c => insightCard(c, s)), ...(s.source === "csv" ? [moreCard(s)] : []), endCard(s, d.shown)];
  summary = summaryText(s, d.shown); specs = shareSpecs(s, d.shown); current = s;
  $("#cards").innerHTML = list.map(([cls, html], i) => `<section class="card ${cls}" aria-label="Card ${i + 1} of ${list.length}" ${i ? "hidden" : ""}>${html}</section>`).join("");
  $("#bars").innerHTML = list.map(() => "<span><i></i></span>").join("");
  cards = [...$("#cards").children]; bars = [...$("#bars").children];
  $("#topLabel").textContent = s.period.label; $("#exampleTag").hidden = !s.example;
  $("#story").hidden = false; document.body.style.overflow = "hidden";
  $("#shareAll").addEventListener("click", () => openSheet("all"));
  paused = reduce; setPause(); show(0);
  cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
  $("#next").focus();
}
function closeStory() { $("#story").hidden = true; document.body.style.overflow = ""; cancelAnimationFrame(raf); $("#file").value = ""; }
function show(n) {
  idx = Math.max(0, Math.min(cards.length - 1, n)); elapsed = 0; t0 = performance.now();
  cards.forEach((c, i) => (c.hidden = i !== idx));
  $("#stage").classList.toggle("light", ["c-body", "c-totals", "c-sweat"].some(c => cards[idx].classList.contains(c)));
  $("#shareCard").hidden = !specs[idx] || cards[idx].classList.contains("c-end");
  bars.forEach((b, i) => { b.className = i < idx ? "done" : ""; b.firstChild.style.width = ""; });
  cards[idx].querySelectorAll(":scope > *").forEach(el => { el.style.animation = "none"; void el.offsetWidth; el.style.animation = ""; });
}
function tick(now) {
  if (!paused) {
    const p = (elapsed + now - t0) / DUR;
    bars[idx].firstChild.style.width = Math.min(p, 1) * 100 + "%";
    if (p >= 1) { if (idx < cards.length - 1) show(idx + 1); else { paused = true; setPause(); } }
  }
  raf = requestAnimationFrame(tick);
}
function setPause() { const b = $("#pause"); b.textContent = paused ? "▶" : "❚❚"; b.setAttribute("aria-label", paused ? "Play" : "Pause"); }
function togglePause(force) { const want = force ?? !paused; if (want === paused) return; if (want) elapsed += performance.now() - t0; else t0 = performance.now(); paused = want; setPause(); }
/* ---------- share sheet ---------- */
const sheetState = { scope: "card", theme: (() => { try { return localStorage.getItem("wr-theme") || "antalya"; } catch { return "antalya"; } })(), format: "story" };
let prepared = { key: "", files: [] }, previewUrl = "", galleryUrls = [], wasPaused = false, lastFocus = null, prepToken = 0;
function clearGallery() { galleryUrls.forEach(u => URL.revokeObjectURL(u)); galleryUrls = []; $("#sheetGallery").replaceChildren(); }
const caption = () => `${summary}\n\nMade free at recap.mertcangenc.com #WellbeingRecap`;
const fileName = (sp, i) => `wellbeing-recap-${String(i + 1).padStart(2, "0")}-${sp.id}-${sheetState.theme}-${sheetState.format}.png`;
function syncChips() {
  document.querySelectorAll("#sheet .chips").forEach(g => g.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", b.dataset.v === sheetState[g.dataset.opt])));
  const canShareFiles = !!(navigator.canShare && navigator.share);
  $("#sheetShare").textContent = canShareFiles ? (sheetState.scope === "all" ? "Share all cards" : "Share") : (sheetState.scope === "all" ? "Download all cards" : "Download image");
  $("#sheetSave").hidden = !canShareFiles;
}
async function prepare() {
  const token = ++prepToken, key = `${sheetState.scope}|${sheetState.theme}|${sheetState.format}|${idx}`;
  $("#sheetShare").disabled = true; $("#sheetNote").textContent = "Preparing your image…"; syncChips();
  const all = sheetState.scope === "all";
  const list = all ? specs.map((sp, i) => [sp, i]).filter(([sp]) => sp) : [[specs[idx], idx]];
  // "All cards" shows every image side by side, so a theme can be judged across the whole recap
  $("#sheetPreview").hidden = all; $("#sheetGallery").hidden = !all;
  if (all) { clearGallery(); $("#sheetGallery").scrollLeft = 0; }
  const files = [];
  for (const [sp, i] of list) {
    const canvas = await Share.render(sp, { theme: sheetState.theme, format: sheetState.format });
    if (token !== prepToken) return;               // a newer choice replaced this one
    const file = await Share.toFile(canvas, fileName(sp, i));
    if (token !== prepToken) return;               // checked again: encoding is async too
    files.push(file);
    if (all) {
      const url = URL.createObjectURL(files.at(-1)); galleryUrls.push(url);
      $("#sheetGallery").append(Object.assign(document.createElement("img"), { src: url, alt: `Card ${files.length} of ${list.length}` }));
      $("#sheetNote").textContent = `Drawing ${files.length} of ${list.length}…`;
    } else { if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = URL.createObjectURL(files.at(-1)); $("#sheetImg").src = previewUrl; }
  }
  prepared = { key, files };
  $("#sheetShare").disabled = false;
  $("#sheetNote").textContent = all ? `${files.length} cards · swipe to see them all, or switch the theme.` : "Ready.";
}
function openSheet(scope = "card") {
  if (!specs[idx] && scope === "card") return;
  sheetState.scope = scope; wasPaused = paused; togglePause(true); lastFocus = document.activeElement;
  $("#sheet").hidden = false; syncChips(); prepare(); $("#sheetClose").focus();
}
function closeSheet() { $("#sheet").hidden = true; prepToken++; clearGallery(); togglePause(wasPaused); (lastFocus || $("#next")).focus(); }
function download(files) {
  files.forEach((f, n) => setTimeout(() => {
    const url = URL.createObjectURL(f), a = Object.assign(document.createElement("a"), { href: url, download: f.name });
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
  }, n * 350));
}
$("#shareCard").addEventListener("click", () => openSheet("card"));
$("#sheetClose").addEventListener("click", closeSheet);
$("#sheet").addEventListener("click", e => { if (e.target.id === "sheet") closeSheet(); });
$("#sheet").addEventListener("click", e => {
  const b = e.target.closest(".chips button"); if (!b) return;
  const opt = b.parentElement.dataset.opt; sheetState[opt] = b.dataset.v;
  if (opt === "theme") { try { localStorage.setItem("wr-theme", b.dataset.v); } catch {} }
  prepare();
});
// Files are rendered before the tap, so the share call keeps the tap's user activation (Safari needs that).
$("#sheetShare").addEventListener("click", async () => {
  const files = prepared.files; if (!files.length) return;
  if (navigator.canShare && navigator.share && navigator.canShare({ files })) {
    try { await navigator.share({ files, text: caption() }); $("#sheetNote").textContent = "Shared. Thanks for spreading the word!"; }
    catch (e) { if (e.name !== "AbortError") { download(files); $("#sheetNote").textContent = "Sharing isn't available here, so we downloaded the images."; } }
  } else { download(files); $("#sheetNote").textContent = files.length > 1 ? `Downloading ${files.length} images…` : "Downloaded."; }
});
$("#sheetSave").addEventListener("click", () => { download(prepared.files); $("#sheetNote").textContent = "Downloaded."; });
$("#sheetCaption").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(caption()); $("#sheetNote").textContent = "Caption copied. Paste it under your post."; }
  catch { $("#sheetNote").textContent = caption().split("\n").filter(Boolean).join(" · "); }
});
$("#next").addEventListener("click", () => show(idx + 1));
$("#prev").addEventListener("click", () => show(idx - 1));
$("#pause").addEventListener("click", () => togglePause());
$("#close").addEventListener("click", closeStory);
document.addEventListener("keydown", e => {
  if ($("#story").hidden) return;
  if (!$("#sheet").hidden) { if (e.key === "Escape") closeSheet(); return; }
  if (e.key === "ArrowRight") show(idx + 1); else if (e.key === "ArrowLeft") show(idx - 1);
  else if (e.key === "Escape") closeStory();
  else if (e.key === " ") { e.preventDefault(); togglePause(); }
});
let holdTimer, holding = false;
["next", "prev"].forEach(id => {
  const el = $("#" + id);
  el.addEventListener("pointerdown", () => { holdTimer = setTimeout(() => { holding = !paused; togglePause(true); }, 220); });
  el.addEventListener("pointerup", () => { clearTimeout(holdTimer); if (holding) { togglePause(false); holding = false; el.addEventListener("click", ev => ev.stopImmediatePropagation(), { once: true, capture: true }); } });
});
