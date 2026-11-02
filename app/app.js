"use strict";
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// the story speaks the language the page was in when it opened (SL); cards come from Insights in that language
let SL = "en";
const L = (en, tr) => (SL === "tr" ? tr : en);
const num = n => Insights.number(n, SL);
const TITLES_EN = { when: "When you move", zones: "Heart-rate DNA", stress: "Your stress week", cadence: "Your rhythm", power: "Power", swim: "Swimming", strength: "Strength", mind: "Mind & body", shoes: "Your shoes", weather: "Weather", records: "Records", places: "Places", steps: "Steps", sleep: "Sleep", body: "Your body", sweat: "Sweat", climb: "Climbing" };
const TITLES_TR = { when: "Hareket zamanın", zones: "Nabız DNA'n", stress: "Stres haftan", cadence: "Ritmine kulak ver", power: "Güç", swim: "Yüzme", strength: "Kuvvet", mind: "Zihin ve beden", shoes: "Ayakkabıların", weather: "Hava", records: "Rekorlar", places: "Yerler", steps: "Adımlar", sleep: "Uyku", body: "Vücudun", sweat: "Ter", climb: "Tırmanış" };
const title = id => (SL === "tr" ? TITLES_TR : TITLES_EN)[id];
const lower = s => String(s).toLocaleLowerCase(SL);
const cap = s => { s = String(s); return s.charAt(0).toLocaleUpperCase(SL) + s.slice(1); };   // first letter only ("Zihin ve beden")
const foot = () => `<div class="foot">${L("From your Garmin Connect data", "Garmin Connect verilerinden")}</div>`;
const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_TR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
// "2026 Recap" / "Since April 2026" · "2026 Özeti" / "Nisan 2026'dan beri" · "Quick Recap" / "Hızlı Özet"
function periodLabel(p) {
  if (p.mode === "quick") return L("Quick Recap", "Hızlı Özet");
  const year = p.year || +String(p.end).slice(0, 4);
  if (p.mode === "since") { const m = +String(p.start).slice(5, 7) - 1; return L(`Since ${MONTHS_EN[m]} ${year}`, `${MONTHS_TR[m]} ${year}${Insights.suffix(year, "abl")} beri`); }
  return L(`${year} Recap`, `${year} Özeti`);
}
// "Jan 1 → Nov 2, 2026" / "1 Ocak → 2 Kasım 2026"
const periodRange = p => (p.start && p.end ? `${Insights.date(p.start, SL)} → ${Insights.date(p.end, SL)}${L(",", "")} ${String(p.end).slice(0, 4)}` : p.range || "");

/* ---------- example (invented) ---------- */
const EXAMPLE = {
  period: { mode: "year", year: 2026, start: "2026-01-01", end: "2026-11-02", days: 306 },
  name: "Alex", example: true,
  totals: { activities: 110, activeDays: 90, longestStreak: 6, hours: 158, families: { "walking & hiking": { count: 58, km: 690, hours: 110 }, cycling: { count: 14, km: 420, hours: 16 }, running: { count: 21, km: 140, hours: 15 }, strength: { count: 17, km: 0, hours: 17 } }, calories: 98000 },
  byHour: { 8: 9, 9: 14, 10: 12, 11: 6, 14: 4, 17: 3, 19: 4 },
  byWeekday: { Mon: 3, Tue: 4, Wed: 2, Thu: 5, Fri: 3, Sat: 18, Sun: 17 },
  zoneHours: [14, 18, 22, 6, 1],
  stressByWeekday: { Mon: 33, Tue: 35, Wed: 42, Thu: 39, Fri: 34, Sat: 21, Sun: 19 }, days: 300,
  steps: { total: 3825000, days: 300, bestDay: { date: "2026-09-14", steps: 41000 } },
  sleep: { nights: 280, avgHours: 7.1, avgScore: 74, bedtime: "23:05", wake: "06:50" },
  body: { days: 295, rhr: [60, 59], vo2: [40, 42], fitnessAge: [38.0, 37.2] },
  sweatLiters: 140, climbMeters: 14000,
  cadence: { runs: 21, spm: 164, first: 160, last: 167 },
  power: { sport: "cycling", sessions: 14, kJ: 9800, avgW: 172, bestNP: 214, maxW: 612, rpm: 86 },
  swim: { swims: 22, strokes: 31800, km: 38, openKm: 9 },
  strength: { sessions: 17, minutes: 690, moves: 31, sets: 240, reps: 2600, favourite: "GOBLET_SQUAT", favouriteSets: 38, areas: { "legs & glutes": 96, core: 60, back: 44, "full body": 40 } },
  mind: { sessions: 12, minutes: 260, kinds: { yoga: 8, meditation: 4 }, slowestBreath: 8.2, stressChange: -6 },
  shoes: { list: [{ name: "Trail runners", km: 610, maxKm: 700 }] },
  weather: { workouts: 80, hot: { c: 34, date: "2026-07-21", sport: "running" }, cold: { c: -3, date: "2026-01-12", sport: "walking & hiking" } },
  records: [{ type: "Best 5km Run", value: 1642, date: "2026-09-20", current: true }, { type: "Farthest Run", value: 21300, date: "2026-10-04", current: true }, { type: "Most Steps in a Day", value: 41000, date: "2026-09-14", current: true }],
  places: { countries: 2, list: [{ name: "Lisbon", cc: "PT", count: 61 }, { name: "Porto", cc: "PT", count: 9 }, { name: "Madrid", cc: "ES", count: 4 }, { name: "Seville", cc: "ES", count: 2 }] },
};

/* ---------- language: the landing page here; story cards via SL and Insights ---------- */
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
    lede: "Garmin verilerini bırak, yılını bir hikâye olarak izle: nasıl bir sporcu olduğunu, nabzının nasıl değiştiğini ve yıl boyunca nasıl uyuduğunu gör.",
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
    pill: "Tarayıcında çalışır · hiçbir verin internete yüklenmez",
    dropTitle: "Garmin export ZIP'ini ya da aktivite CSV'ni buraya bırak",
    dropSub: "ya da dosyayı seçmek için dokun",
    example: "Örnek bir özete göz at",
    fullTitle: "Tam özet: verilerini 3 adımda indir",
    full1: "Bilgisayardan <code>garmin.com/account/datamanagement</code> adresini aç ve saatinin bağlı olduğu hesapla giriş yap. Telefon uygulamasından dışa aktarma yapılamıyor.",
    full2: "<b>Export Your Data</b>, ardından <b>Request Data Export</b>'u seç. Garmin indirme bağlantısını genelde 24–48 saat içinde e-postayla gönderir.",
    full3: "E-postadaki ZIP'i indir (bağlantının süresi doluyor) ve yukarıya bırak. Dosyayı açmana gerek yok.",
    quickTitle: "Acelen mi var? Aktivite listenden hızlı özet",
    quick1: "Tarayıcından <code>connect.garmin.com</code> adresini aç ve <b>Activities → All Activities</b> sayfasına git.",
    quick2: "Sayfayı <b>en alta kadar kaydır</b>, yeni aktivite yüklenmeyene kadar devam et. Garmin sadece ekranda görünen satırları indiriyor; kaydırmazsan elinde 20 aktivite kalır.",
    quick3: "Sağ üstteki <b>Export CSV</b>'ye tıkla ve dosyayı yukarıya bırak. Aktivite kartların hemen hazır olur. Uyku, stres ve kalp kartları için tam export gerekiyor.",
    f1t: "Verin sende kalır", f1: "Dosya bu sayfanın içinde okunur. Sunucu yok, hesap yok, çerez yok.",
    f2t: "Sadece gerekenler", f2: "Yalnızca aktivite özetlerini, günlük istatistikleri, uykuyu ve fitness yaşını okur.",
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
// story and share-sheet chrome, by [data-s] key
const S = {
  en: { share: "Share", what: "What", personal: "Records & places", theme: "Theme", size: "Size", card: "This card", all: "All cards", out: "Keep private", in: "Include",
    story: "Story 9:16<small>Instagram · WhatsApp</small>", post: "Post 4:5<small>Strava · LinkedIn · feed</small>", save: "Download", caption: "Copy caption", shareCard: "Share ↗", example: "Example data", close: "Close" },
  tr: { share: "Paylaş", what: "Ne", personal: "Rekorlar ve yerler", theme: "Tema", size: "Boyut", card: "Bu kart", all: "Tüm kartlar", out: "Gizli tut", in: "Ekle",
    story: "Hikâye 9:16<small>Instagram · WhatsApp</small>", post: "Gönderi 4:5<small>Strava · LinkedIn · akış</small>", save: "İndir", caption: "Metni kopyala", shareCard: "Paylaş ↗", example: "Örnek veri", close: "Kapat" },
};
function applyStoryLang() {
  $("#story").lang = SL;
  document.querySelectorAll("#story [data-s]").forEach(el => (el.innerHTML = S[SL][el.dataset.s]));
  $("#sheetClose").setAttribute("aria-label", S[SL].close); $("#close").setAttribute("aria-label", L("Close recap", "Özeti kapat"));
  $("#prev").setAttribute("aria-label", L("Previous card", "Önceki kart")); $("#next").setAttribute("aria-label", L("Next card", "Sonraki kart"));
}
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
const dist = (km, u) => Insights.distance(km, u, SL);
const fam = f => Insights.family(f, SL);

/* ---------- reading the ZIP ---------- */
const status = (msg, err = false) => { const s = $("#status"); s.textContent = msg; s.classList.toggle("err", err); };
// the offline city list is ~200 KB, so it loads only when a full export is opened
let citiesLoading = null;
const loadCities = () => citiesLoading ||= new Promise(res => {
  if (Geo.ready()) return res();
  const s = Object.assign(document.createElement("script"), { src: "js/cities.js" });
  s.onload = s.onerror = () => res();   // without it, places fall back to Garmin's location names
  document.head.appendChild(s);
});
async function readExport(file) {
  if (!/\.zip$/i.test(file.name)) throw new Error(T.en.errNotZip);
  const cities = loadCities();
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
    await cities;
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
function vizLadder({ label, rungs, you }) {
  const items = [...rungs].reverse(), k = items.findIndex(r => r.done);
  items.splice(k < 0 ? items.length : k, 0, { you: true, name: you || "You", label });
  return `<div class="ladder" role="list">${items.map(r => `<div role="listitem" class="rung ${r.you ? "you" : r.done ? "done" : "next"}"><span>${esc(r.name)}</span><span>${esc(r.label)}</span></div>`).join("")}</div>`;
}
function vizWhen(byHour) {
  const cx = 150, cy = 140, r0 = 50, rmax = 112, max = Math.max(...Object.values(byHour)); let s = "";
  for (let h = 0; h < 24; h++) {
    const v = byHour[h] || 0, a = h / 24 * Math.PI * 2 - Math.PI / 2 + Math.PI / 24, len = v ? 6 + v / max * (rmax - r0 - 6) : 2;
    s += `<line x1="${cx + Math.cos(a) * r0}" y1="${cy + Math.sin(a) * r0}" x2="${cx + Math.cos(a) * (r0 + len)}" y2="${cy + Math.sin(a) * (r0 + len)}" stroke="${v === max ? "#ee6420" : "rgba(255,248,238,.6)"}" stroke-width="8" stroke-linecap="round"/>`;
  }
  (SL === "tr" ? [[0, "00:00"], [6, "06:00"], [12, "12:00"], [18, "18:00"]] : [[0, "12 AM"], [6, "6 AM"], [12, "12 PM"], [18, "6 PM"]]).forEach(([h, t]) => { const a = h / 24 * Math.PI * 2 - Math.PI / 2; s += `<text x="${cx + Math.cos(a) * (rmax + 18)}" y="${cy + Math.sin(a) * (rmax + 18) + 4}" text-anchor="middle">${t}</text>`; });
  return `<svg viewBox="0 0 300 280" role="img" aria-label="${L("Workouts by hour of day", "Saate göre antrenmanlar")}">${s}</svg>`;
}
function vizZones({ easy, mid, hard }) {
  const W = 300, y = 26, h = 30, e = easy * W, m = mid * W, hd = hard * W, tx = .8 * W;
  // label colour per segment: dark on sand/orange, light on pomegranate (data-bg lets the contrast audit see the real backdrop)
  const seg = (x, w, fill, l, ink = "#14112a") => w <= 0 ? "" : `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>${w > 40 ? `<text x="${x + w / 2}" y="${y + 19}" text-anchor="middle" data-bg="${fill}" style="fill:${ink};font-weight:600">${l}</text>` : ""}`;
  return `<svg viewBox="0 0 ${W} 92" role="img" aria-label="Easy ${Math.round(easy * 100)}%, tempo ${Math.round(mid * 100)}%, hard ${Math.round(hard * 100)}%"><clipPath id="zc"><rect x="0" y="${y}" width="${W}" height="${h}" rx="9"/></clipPath><g clip-path="url(#zc)">${seg(0, e, "#ecdcbc", L("easy", "hafif"))}${seg(e, m, "#ee6420", "tempo")}${seg(e + m, hd, "#a8213b", L("hard", "sert"), "#fff8ee")}</g><line x1="${tx}" x2="${tx}" y1="${y - 10}" y2="${y + h + 10}" stroke="#fff8ee" stroke-width="2" stroke-dasharray="3 3"/><text x="${tx}" y="${y - 14}" text-anchor="middle" style="fill:#fff8ee">${L("80% easy target", "%80 hafif hedefi")}</text><text x="0" y="${y + h + 22}">${L("Zones 1–2", "Bölge 1–2")}</text><text x="${W}" y="${y + h + 22}" text-anchor="end">${L("Zones 4–5", "Bölge 4–5")}</text></svg>`;
}
function vizStress(byDay) {
  const W = 300, H = 120, vals = byDay.map(e => e[1]), lo = Math.min(...vals) - 4, hi = Math.max(...vals), bw = W / byDay.length, peak = hi;
  return `<svg viewBox="0 -16 ${W} ${H + 34}" role="img" aria-label="${L("Average stress by weekday", "Günlere göre ortalama stres")}: ${byDay.map(e => e[0] + " " + Math.round(e[1])).join(", ")}">` + byDay.map(([d, v], i) => { const bh = Math.max(3, (v - lo) / (hi - lo || 1) * H), x = i * bw + 5; return `<rect x="${x}" y="${H - bh}" width="${bw - 10}" height="${bh}" rx="5" fill="${v === peak ? "#fff8ee" : "rgba(255,248,238,.38)"}"/><text x="${x + (bw - 10) / 2}" y="${H - bh - 5}" text-anchor="middle" style="fill:#fff8ee">${Math.round(v)}</text><text x="${x + (bw - 10) / 2}" y="${H + 14}" text-anchor="middle">${d}</text>`; }).join("") + "</svg>";
}

/* ---------- building the deck ---------- */
const introBody = () => L("Your runs, your rest days, your nights and everything in between. Let's take a look.", "Koşuların, dinlenme günlerin, gecelerin ve aradaki her şey. Haydi bakalım.");
const tapHint = () => `<div class="foot">${L("Tap right → next · Tap left ← back", "Sağ: ileri · Sol: geri")}</div>`;
function introHeadline(s) {
  if (s.source === "csv") return L(`Your quick recap: ${num(s.totals.activities)} activities.`, `Hızlı özetin: ${num(s.totals.activities)} aktivite.`);
  const year = s.period.year || String(s.period.end).slice(0, 4), cap = x => x.charAt(0).toLocaleUpperCase(SL) + x.slice(1);
  const h = s.period.mode === "since" ? L(`your watch has been with you for ${s.period.days} days.`, `saatin ${s.period.days} gündür seninle.`) : L(`here's your ${year}.`, `işte senin ${year} yılın.`);
  return s.name ? `${s.name}, ${h}` : cap(h);
}
function introCard(s) {
  const body = s.source === "csv" ? L("Built from your activities list. Here's what it says about how you move.", "Aktivite listenden yola çıkarak nasıl hareket ettiğine bakalım.") : introBody();
  return ["c-intro", `<div class="eyebrow">${esc(periodRange(s.period))}</div><h1>${esc(introHeadline(s))}</h1><p>${body}</p>${tapHint()}`];
}
function totalsCard(s) {
  const t = s.totals, fams = Object.entries(t.families).sort((a, b) => b[1].hours - a[1].hours).slice(0, 4), maxH = fams[0]?.[1].hours || 1;
  const kinds = Object.keys(t.families).length, h = L("h", "sa");
  return ["c-totals", `<div class="eyebrow">${L("In total", "Toplam")}</div><div class="hero"><b>${num(t.activities)}</b><span>${L("activities", "aktivite")}</span></div>
    <div class="grid2"><div><b>${num(t.activeDays)}</b><span>${L("active days", "aktif gün")}</span></div><div><b>${num(t.longestStreak)}</b><span>${L("days in a row, your longest streak", "gün üst üste, en uzun serin")}</span></div><div><b>${num(t.hours)} ${h}</b><span>${L("spent moving", "hareket halinde")}</span></div><div><b>${kinds}</b><span>${L(kinds === 1 ? "kind of sport" : "kinds of sport", "farklı spor")}</span></div></div>
    <div class="rows">${fams.map(([f, v]) => `<div class="row"><span class="l">${esc(cap(fam(f)))}</span><span class="v">${v.count}×${v.km >= 1 ? ` · ${dist(v.km, s.units)}` : ` · ${num(v.hours)} ${h}`}</span><div class="t"><i style="width:${v.hours / maxH * 100}%"></i></div></div>`).join("")}</div>
    ${kcalLine(t) ? `<p class="kcal">${esc(kcalLine(t))}</p>` : ""}
    ${foot()}`];
}
// a slice of cheese pizza is about 285 kcal
const kcalLine = t => (t.calories >= 1000 ? L(`${num(t.calories)} kcal burned, about ${num(t.calories / 285)} slices of pizza.`, `${num(t.calories)} kcal yaktın, yaklaşık ${num(t.calories / 285)} dilim pizza.`) : "");
function insightCard(c, s) {
  const viz = c.id === "when" ? vizWhen(s.byHour) : c.id === "zones" ? vizZones(c.shares) : c.id === "stress" ? vizStress(c.byDay)
    : c.beforeAfter ? `<div>${c.beforeAfter.map(r => `<div class="ba"><span class="k">${esc(r.label)}</span><span class="from">${esc(r.from)}</span><span>→</span><span class="to">${esc(r.to)}${r.unit ? ` <small>${esc(r.unit)}</small>` : ""}</span></div>`).join("")}</div>`
    : c.ladder ? vizLadder(c.ladder)
    : c.rows ? `<div class="rows">${c.rows.map(([l, v, f]) => `<div class="row"><span class="l">${esc(cap(l))}</span><span class="v">${esc(v)}</span><div class="t"><i style="width:${Math.max(4, f * 100)}%"></i></div></div>`).join("")}</div>`
    : c.tiles ? `<div class="grid2">${c.tiles.map(([v, k]) => `<div><b>${esc(v)}</b><span>${esc(k)}</span></div>`).join("")}</div>`
    : c.hero ? `<div class="hero"><b>${esc(c.hero[0])}</b><span>${esc(c.hero[1])}</span></div>` : "";
  return [`c-${c.id}`, `<div class="eyebrow">${title(c.id)}</div><span class="persona">${esc(c.persona)}</span><h2>${esc(c.headline)}</h2>${viz}<p>${esc(c.body)}</p>${foot()}`];
}
// personas that describe who you are (not fun facts or body trends), best first
const identity = shown => shown.filter(c => ["when", "zones", "stress", "steps", "sleep"].includes(c.id)).slice(0, 2);
function moreCard(s) {
  const tip = s.truncated ? `<p>${L(`Your CSV had ${num(s.totals.activities)} activities. Garmin only exports the rows on screen, so scroll to the bottom of the Activities page before you click Export CSV.`, `CSV dosyanda ${num(s.totals.activities)} aktivite vardı. Garmin yalnızca ekranda görünen satırları indirir; Export CSV'ye basmadan önce Activities sayfasını en alta kadar kaydır.`)}</p>` : "";
  return ["c-more", `<div class="eyebrow">${L("Want the full story?", "Hikâyenin tamamını ister misin?")}</div><h2>${L("This was the quick version.", "Bu kısa versiyondu.")}</h2>${tip}<p>${L("The full Garmin export adds sleep, stress, steps, heart-rate zones and how your body changed over the year. Request it once; it usually arrives within 1–2 days.", "Tam Garmin export'u uykuyu, stresi, adımları, nabız bölgelerini ve vücudunun yıl içindeki değişimini ekler. Bir kez talep et; genelde 1–2 gün içinde gelir.")}</p><div class="foot">garmin.com/account/datamanagement → Export Your Data</div>`];
}
function summaryText(s, shown) {
  const t = s.totals, fams = Object.entries(t.families).sort((a, b) => b[1].km - a[1].km);
  const personas = identity(shown).map(c => c.persona);
  return [`Wellbeing Recap · ${periodLabel(s.period)}${s.name ? " · " + s.name : ""}`, L(`${num(t.activities)} activities · ${num(t.activeDays)} active days`, `${num(t.activities)} aktivite · ${num(t.activeDays)} aktif gün`),
    fams.filter(([, v]) => v.km >= 1).slice(0, 2).map(([f, v]) => `${dist(v.km, s.units)} ${fam(f)}`).join(" · "),
    personas.length ? `${L("My types", "Tiplerim")}: ${personas.join(" · ")}` : ""].filter(Boolean).join("\n");
}
function endCard(s, shown, extraCount = 0) {
  const t = s.totals, fams = Object.entries(t.families).sort((a, b) => b[1].km - a[1].km);
  const tiles = plainTiles(s, shown);
  const head = s.name ? L(`${s.name}'s recap`, `${s.name}, işte özetin`) : L("Your recap", "İşte özetin");
  return ["c-end", `<span class="persona">${esc(periodLabel(s.period))}</span><h2>${esc(head)}</h2>
    <div class="summary">${tiles.map(([v, k]) => `<div><b>${esc(v)}</b><span>${esc(k)}</span></div>`).join("")}</div>
    <button class="share" id="shareAll" type="button">${L("Share my recap ↗", "Özetimi paylaş ↗")}</button>
    ${extraCount ? `<button class="more-cards" id="moreCards" type="button">${L(`${extraCount} more ${extraCount === 1 ? "card" : "cards"} →`, `${extraCount} kart daha →`)}</button>` : ""}
    <a class="fb" href="https://github.com/lukecan/wellbeing_recap/issues/new/choose" target="_blank" rel="noopener">${L("Tell us what you think →", "Ne düşündüğünü bize yaz →")}</a>
    <div class="foot">${L("Your data never left this page", "Verilerin bu sayfadan hiç çıkmadı")}</div>`];
}

/* ---------- share specs: what each card says, in a form Share.render can draw ---------- */
const plain = html => { const d = document.createElement("div"); d.innerHTML = html; return d.textContent; };
// a fingerprint of the year's numbers: the same recap always draws the same pattern, another person's never does
const patternSeed = s => [s.period.start, s.totals.activities, s.totals.activeDays, Math.round(s.totals.hours), s.steps?.total || 0, s.name || ""].join("|");
function shareSpecs(s, shown, extra = []) {
  const base = { lang: SL, period: periodLabel(s.period), year: s.period.year || String(s.period.end || "").slice(0, 4), seed: patternSeed(s) };
  const t = s.totals, fams = Object.entries(t.families).sort((a, b) => b[1].hours - a[1].hours).slice(0, 4), maxH = fams[0]?.[1].hours || 1;
  const intro = { ...base, id: "intro", eyebrow: periodRange(s.period), headline: introHeadline(s),
    body: L("Your runs, your rest days, your nights and everything in between.", "Koşuların, dinlenme günlerin, gecelerin ve aradaki her şey.") };
  const totals = { ...base, id: "totals", eyebrow: L("In total", "Toplam"), big: [num(t.activities), L(`activities · ${num(t.activeDays)} active days`, `aktivite · ${num(t.activeDays)} aktif gün`)], body: kcalLine(t) || undefined,
    viz: { type: "rows", rows: fams.map(([f, v]) => [fam(f), `${v.count}×${v.km >= 1 ? " · " + dist(v.km, s.units) : " · " + num(v.hours) + " " + L("h", "sa")}`, v.hours / maxH]) } };
  const insight = c => ({ ...base, id: c.id, private: !!c.private, eyebrow: title(c.id), chip: c.persona, headline: c.headline, body: c.body,
    big: c.beforeAfter ? null : c.hero || null,
    viz: c.id === "when" ? { type: "clock", byHour: s.byHour } : c.id === "zones" ? { type: "zones", shares: c.shares }
      : c.id === "stress" ? { type: "bars", rows: c.byDay } : c.beforeAfter ? { type: "ba", rows: c.beforeAfter }
      : c.ladder ? { type: "ladder", ...c.ladder } : c.rows ? { type: "rows", rows: c.rows }
      : c.tiles ? { type: "tiles", tiles: c.tiles } : null });
  const label = periodLabel(s.period);
  const end = { ...base, id: "end", eyebrow: s.name ? `${s.name} · Wellbeing Recap` : "Wellbeing Recap",
    headline: L(`${s.name ? s.name + "'s" : "My"} ${s.period.mode === "year" ? label : "recap"}`, s.period.mode === "year" ? label : `${s.name ? s.name + ", " : ""}${lower(label)}`),
    cta: [L("Want yours?", "Sen de ister misin?"), L("free", "ücretsiz")], viz: { type: "tiles", tiles: plainTiles(s, shown) } };
  return [intro, totals, ...shown.map(insight), ...(s.source === "csv" ? [null] : []), end, ...extra.map(insight)];
}
function plainTiles(s, shown) {
  const t = s.totals, fams = Object.entries(t.families).sort((a, b) => b[1].km - a[1].km);
  return [[num(t.activities), L("activities", "aktivite")], [num(t.activeDays), L("active days", "aktif gün")],
    ...fams.filter(([, v]) => v.km >= 1).slice(0, 2).map(([f, v]) => [dist(v.km, s.units), fam(f)]),
    ...identity(shown).map(c => [c.persona, lower(title(c.id))])].slice(0, 6);
}

/* ---------- story player ---------- */
let cards = [], bars = [], idx = 0, t0 = 0, elapsed = 0, paused = false, raf = 0, summary = "", specs = [], current = null, endIdx = 0;
const MAX_CARDS = 12;   // intro, totals, the summary (and the quick-recap note) count towards it
const DUR = 15000, reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
function openStory(stats) {
  SL = lang; applyStoryLang();
  const s = { ...stats, lang: SL }, d = Insights.deck(s), csv = s.source === "csv";
  // the best-scoring cards play in the story; the rest wait behind "N more cards" on the summary
  const room = MAX_CARDS - 3 - (csv ? 1 : 0), main = d.shown.slice(0, room), extra = d.shown.slice(room);
  const list = [introCard(s), totalsCard(s), ...main.map(c => insightCard(c, s)), ...(csv ? [moreCard(s)] : []), endCard(s, main, extra.length), ...extra.map(c => insightCard(c, s))];
  endIdx = list.length - 1 - extra.length;
  summary = summaryText(s, main); specs = shareSpecs(s, main, extra); current = s;
  $("#cards").innerHTML = list.map(([cls, html], i) => `<section class="card ${cls}" aria-label="${L(`Card ${i + 1} of ${list.length}`, `Kart ${i + 1} / ${list.length}`)}" ${i ? "hidden" : ""}>${html}</section>`).join("");
  $("#bars").innerHTML = list.slice(0, endIdx + 1).map(() => "<span><i></i></span>").join("");
  cards = [...$("#cards").children]; bars = [...$("#bars").children];
  const seed = patternSeed(s);
  try { $("#cards").style.setProperty("--pattern-light", `url(${Share.patternUrl(seed, "#fff8ee", .09)})`); $("#cards").style.setProperty("--pattern-dark", `url(${Share.patternUrl(seed, "#1d1528", .08)})`); } catch { /* the pattern is decoration */ }
  $("#topLabel").textContent = periodLabel(s.period); $("#exampleTag").hidden = !s.example;
  $("#story").hidden = false; document.body.style.overflow = "hidden";
  $("#shareAll").addEventListener("click", () => openSheet("all"));
  $("#moreCards")?.addEventListener("click", () => { togglePause(false); show(endIdx + 1); });
  paused = reduce; setPause(); show(0);
  cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
  $("#next").focus();
}
function closeStory() { $("#story").hidden = true; document.body.style.overflow = ""; cancelAnimationFrame(raf); $("#file").value = ""; }
function show(n) {
  idx = Math.max(0, Math.min(cards.length - 1, n)); elapsed = 0; t0 = performance.now();
  cards.forEach((c, i) => (c.hidden = i !== idx));
  $("#stage").classList.toggle("light", ["c-body", "c-totals", "c-sweat", "c-power", "c-records"].some(c => cards[idx].classList.contains(c)));
  $("#shareCard").hidden = !specs[idx] || cards[idx].classList.contains("c-end");
  bars.forEach((b, i) => { b.className = i < idx ? "done" : ""; b.firstChild.style.width = ""; });
  $("#bars").classList.toggle("bonus", idx > endIdx);
  cards[idx].querySelectorAll(":scope > *").forEach(el => { el.style.animation = "none"; void el.offsetWidth; el.style.animation = ""; });
}
function tick(now) {
  if (!paused) {
    const p = (elapsed + now - t0) / DUR;
    if (bars[idx]) bars[idx].firstChild.style.width = Math.min(p, 1) * 100 + "%";
    // the story stops on the summary; bonus cards play on only once opened
    if (p >= 1) { if (idx !== endIdx && idx < cards.length - 1) show(idx + 1); else { paused = true; setPause(); } }
  }
  raf = requestAnimationFrame(tick);
}
function setPause() { const b = $("#pause"); b.textContent = paused ? "▶" : "❚❚"; b.setAttribute("aria-label", paused ? L("Play", "Oynat") : L("Pause", "Duraklat")); }
function togglePause(force) { const want = force ?? !paused; if (want === paused) return; if (want) elapsed += performance.now() - t0; else t0 = performance.now(); paused = want; setPause(); }
/* ---------- share sheet ---------- */
const sheetState = { personal: "out", scope: "card", theme: (() => { try { return localStorage.getItem("wr-theme") || "antalya"; } catch { return "antalya"; } })(), format: "story" };
let prepared = { key: "", files: [] }, previewUrl = "", galleryUrls = [], wasPaused = false, lastFocus = null, prepToken = 0;
function clearGallery() { galleryUrls.forEach(u => URL.revokeObjectURL(u)); galleryUrls = []; $("#sheetGallery").replaceChildren(); }
const caption = () => `${summary}\n\n${L("Made free at recap.mertcangenc.com", "recap.mertcangenc.com'da ücretsiz hazırlandı")} #WellbeingRecap`;
const fileName = (sp, i) => `wellbeing-recap-${String(i + 1).padStart(2, "0")}-${sp.id}-${sheetState.theme}-${sheetState.format}.png`;
function syncChips() {
  document.querySelectorAll("#sheet .chips").forEach(g => g.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", b.dataset.v === sheetState[g.dataset.opt])));
  const canShareFiles = !!(navigator.canShare && navigator.share);
  const all = sheetState.scope === "all";
  $("#sheetShare").textContent = canShareFiles ? (all ? L("Share all cards", "Tüm kartları paylaş") : L("Share", "Paylaş")) : (all ? L("Download all cards", "Tüm kartları indir") : L("Download image", "Görseli indir"));
  $("#sheetSave").hidden = !canShareFiles;
}
async function prepare() {
  const token = ++prepToken, key = `${sheetState.scope}|${sheetState.theme}|${sheetState.format}|${sheetState.personal}|${idx}`;
  $("#optPersonal").hidden = sheetState.scope !== "all" || !specs.some(sp => sp && sp.private);
  $("#sheetShare").disabled = true; $("#sheetNote").textContent = L("Preparing your image…", "Görselin hazırlanıyor…"); syncChips();
  const all = sheetState.scope === "all";
  // records and places stay out of "All cards" unless the viewer opts in; sharing that one card is a choice too
  const list = all ? specs.map((sp, i) => [sp, i]).filter(([sp]) => sp && (!sp.private || sheetState.personal === "in")) : [[specs[idx], idx]];
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
      $("#sheetGallery").append(Object.assign(document.createElement("img"), { src: url, alt: L(`Card ${files.length} of ${list.length}`, `Kart ${files.length} / ${list.length}`) }));
      $("#sheetNote").textContent = L(`Drawing ${files.length} of ${list.length}…`, `Çiziliyor: ${files.length} / ${list.length}…`);
    } else { if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = URL.createObjectURL(files.at(-1)); $("#sheetImg").src = previewUrl; }
  }
  prepared = { key, files };
  $("#sheetShare").disabled = false;
  $("#sheetNote").textContent = all ? L(`${files.length} cards · swipe to see them all, or switch the theme.`, `${files.length} kart · hepsini görmek için kaydır ya da temayı değiştir.`) : L("Ready.", "Hazır.");
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
    try { await navigator.share({ files, text: caption() }); $("#sheetNote").textContent = L("Shared. Thanks for spreading the word!", "Paylaşıldı. Haberi yaydığın için teşekkürler!"); }
    catch (e) { if (e.name !== "AbortError") { download(files); $("#sheetNote").textContent = L("Sharing isn't available here, so we downloaded the images.", "Burada paylaşım yapılamıyor, görselleri indirdik."); } }
  } else { download(files); $("#sheetNote").textContent = files.length > 1 ? L(`Downloading ${files.length} images…`, `${files.length} görsel indiriliyor…`) : L("Downloaded.", "İndirildi."); }
});
$("#sheetSave").addEventListener("click", () => { download(prepared.files); $("#sheetNote").textContent = L("Downloaded.", "İndirildi."); });
$("#sheetCaption").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(caption()); $("#sheetNote").textContent = L("Caption copied. Paste it under your post.", "Metin kopyalandı. Gönderinin altına yapıştır."); }
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
