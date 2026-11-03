/*
 * Move Recap: Garmin Connect "Export CSV" (Activities list) → stats.
 *
 * The quick path. It only knows about activities, so the deck gets the
 * intro, totals, when-you-move and climbing cards; sleep, stress, steps,
 * heart-rate zones and body trends need the full export.
 *
 * CSV quirks handled here:
 *   - "--" means empty
 *   - thousands separators ("3,300", "7,574") and a leading apostrophe on negatives ("'-13")
 *   - distance is km for most sports but metres for pool swims ("3,300")
 *   - Date is local wall-clock time: "2026-11-02 06:30:54"
 *   - Garmin only exports the rows loaded on screen (20 until you scroll)
 *   - the file has no units: the user tells us. Imperial = miles, swim yards, feet
 */
(function (root) {
  "use strict";
  const PE = root.ParseExport || (typeof require !== "undefined" ? require("./parse-export.js") : {});
  const family = PE.family, motion = PE.motion;
  const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const GARMIN_PAGE = 20;

  // RFC 4180-ish: quoted fields may hold commas and doubled quotes.
  function parseCsv(text) {
    const rows = []; let row = [], field = "", q = false;
    text = text.replace(/^﻿/, "");
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') q = false;
        else field += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field); field = "";
        if (row.some(x => x !== "")) rows.push(row);
        row = [];
      } else field += c;
    }
    row.push(field);
    if (row.some(x => x !== "")) rows.push(row);
    return rows;
  }
  const number = v => {
    if (v == null) return null;
    const s = String(v).trim().replace(/^'/, "").replace(/,/g, "");
    return s === "" || s === "--" ? null : Number.isFinite(+s) ? +s : null;
  };
  const seconds = v => {
    if (!v || v === "--") return 0;
    const p = String(v).split(":").map(Number);
    return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 60 + p[1] : 0;
  };
  const pretty = iso => `${MONTHS[+iso.slice(5, 7) - 1]} ${+iso.slice(8, 10)}`;
  const dayDiff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

  function isGarminCsv(text) {
    const head = parseCsv(text.split(/\r?\n/, 1)[0] || "")[0] || [];
    return head.includes("Activity Type") && head.includes("Date");
  }

  const MI = 1.609344, YD = 0.9144, FT = 0.3048;
  function computeStatsFromCsv(text, { units = "metric" } = {}) {
    const imp = units === "imperial";
    const [head, ...body] = parseCsv(text);
    if (!head || !head.includes("Activity Type") || !head.includes("Date"))
      throw new Error("This CSV doesn't look like Garmin Connect's activity export. Use “Export CSV” on the Activities page.");
    const col = name => head.indexOf(name);
    const C = { type: col("Activity Type"), date: col("Date"), dist: col("Distance"), time: col("Time"), ascent: col("Total Ascent"), cal: col("Calories"),
      // columns only appear when some activity has them; cadence is steps/min for runs, rpm for rides
      spm: col("Avg Run Cadence"), strokes: col("Total Strokes"), rpm: col("Avg Bike Cadence"), avgW: col("Avg Power"), np: col("Normalized Power® (NP®)"), maxW: col("Max Power") };
    const opt = (r, i) => (i >= 0 ? number(r[i]) : null);
    const rows = body.map(r => ({
      type: r[C.type] || "", date: (r[C.date] || "").trim(), dist: number(r[C.dist]), secs: seconds(r[C.time]),
      ascent: C.ascent >= 0 ? number(r[C.ascent]) : null,
      cal: opt(r, C.cal), strokes: opt(r, C.strokes),
      spm: opt(r, C.spm), rpm: opt(r, C.rpm), avgW: opt(r, C.avgW), np: opt(r, C.np), maxW: opt(r, C.maxW),
    })).filter(r => /^\d{4}-\d{2}-\d{2}/.test(r.date));
    if (!rows.length) throw new Error("No activities found in this CSV.");

    const byHour = {}, byWeekday = {}, fam = {};
    let climb = 0, moveS = 0;
    for (const r of rows) {
      const [d, t = "00:00"] = r.date.split(" ");
      const hour = +t.slice(0, 2), wd = WD[new Date(d + "T00:00:00Z").getUTCDay()];
      byHour[hour] = (byHour[hour] || 0) + 1;
      byWeekday[wd] = (byWeekday[wd] || 0) + 1;
      const f = family(r.type.toLowerCase());
      // swims are listed in metres (or yards), everything else in km (or miles)
      const km = r.dist == null ? 0
        : f === "swimming" && r.dist > 50 ? r.dist * (imp ? YD : 1) / 1000
        : r.dist * (imp ? MI : 1);
      const x = fam[f] ||= { count: 0, km: 0, hours: 0 };
      x.count++; x.km += km; x.hours += r.secs / 3600;
      climb += (r.ascent || 0) * (imp ? FT : 1); moveS += r.secs;
    }
    const dates = rows.map(r => r.date.slice(0, 10)).sort();
    const active = [...new Set(dates)];
    let streak = 1, run = 1;
    for (let i = 1; i < active.length; i++) { run = dayDiff(active[i - 1], active[i]) === 1 ? run + 1 : 1; streak = Math.max(streak, run); }
    const start = dates[0], end = dates.at(-1);
    const truncated = rows.length <= GARMIN_PAGE;
    const swimRows = rows.filter(r => family(r.type.toLowerCase()) === "swimming");
    const stroked = swimRows.filter(r => r.strokes > 0);
    const swimKm = r => r.dist == null ? 0 : r.dist > 50 ? r.dist * (imp ? YD : 1) / 1000 : r.dist * (imp ? MI : 1);
    const swim = stroked.length >= 3 ? { swims: stroked.length, strokes: stroked.reduce((s, r) => s + r.strokes, 0),
      km: swimRows.reduce((s, r) => s + swimKm(r), 0), openKm: swimRows.filter(r => /open water/i.test(r.type)).reduce((s, r) => s + swimKm(r), 0) } : null;
    const { cadence, power } = motion([...rows].sort((a, b) => (a.date < b.date ? -1 : 1)).map(r => ({ ...r, fam: family(r.type.toLowerCase()) })));

    return {
      source: "csv", truncated, units,
      period: { mode: "quick", label: "Quick Recap", range: `${pretty(start)} → ${pretty(end)}, ${end.slice(0, 4)}`, year: +end.slice(0, 4), start, end, days: dayDiff(start, end) + 1 },
      name: null,
      totals: { activities: rows.length, activeDays: active.length, longestStreak: streak, hours: moveS / 3600, families: fam,
        calories: rows.reduce((s, r) => s + (r.cal || 0), 0) },
      byHour, byWeekday,
      zoneHours: [0, 0, 0, 0, 0],
      stressByWeekday: {}, days: 0,
      steps: null, sleep: { nights: 0 }, body: { days: 0 }, sweatLiters: 0,
      climbMeters: climb, climbSource: "workouts",
      cadence, power, swim,
    };
  }

  const api = { computeStatsFromCsv, isGarminCsv, parseCsv, GARMIN_PAGE };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ParseCsv = api;
})(typeof window !== "undefined" ? window : globalThis);
