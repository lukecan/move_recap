/*
 * Wellbeing Recap: Garmin export → stats for the insight engine.
 *
 * computeStats(files) takes a Map of { path → parsed JSON } holding only the
 * files `isWanted(path)` accepted, and returns the stats object that
 * Insights.deck() reads, plus totals and the recap period.
 *
 * Files are matched by name, not by folder, because export layouts differ
 * between accounts. Raw units: activity distance cm, durations ms,
 * HR-zone times ms, sweat mL.
 */
(function (root) {
  "use strict";

  const PATTERNS = {
    activities: /summarizedActivities\.json$/,
    daily: /^UDSFile_.*\.json$/,
    sleep: /sleepData\.json$/,
    fitnessAge: /fitnessAgeData\.json$/,
    profile: /^user_profile\.json$/,
  };
  const base = p => p.split("/").pop();
  const isWanted = path => Object.values(PATTERNS).some(re => re.test(base(path)));
  const arr = x => (Array.isArray(x) ? x : x ? [x] : []);
  const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
  const median = a => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const prettyDate = iso => `${MONTHS[+iso.slice(5, 7) - 1]} ${+iso.slice(8, 10)}`;
  const hhmm = min => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(Math.round(min % 60)).padStart(2, "0")}`;
  const dayDiff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

  // Garmin activityType → family. Anything unknown is "other".
  const FAMILY = [
    ["running", /run/],
    ["swimming", /swim/],
    ["cycling", /cycl|bik|ride|spin/],
    ["walking & hiking", /walk|hik|mountaineer/],
    ["strength", /strength|hiit|crossfit|bouldering|climb/],
    ["mind & body", /yoga|pilates|breath|meditat|stretch/],
  ];
  const family = t => (FAMILY.find(([, re]) => re.test(t || "")) || ["other"])[0];

  // Local wall-clock pieces. Garmin's *Local epoch values are local time written as if UTC.
  const local = ms => { const d = new Date(ms); return { date: d.toISOString().slice(0, 10), hour: d.getUTCHours(), wd: WD[d.getUTCDay()] }; };

  function choosePeriod(dates) {
    const sorted = [...dates].sort(), first = sorted[0], last = sorted.at(-1);
    let year = +last.slice(0, 4);
    const inLastYear = sorted.filter(d => +d.slice(0, 4) === year).length;
    // Early January export: recap the year that just ended, not a 3-day stub.
    if (inLastYear < 14 && +first.slice(0, 4) < year) year -= 1;
    const yearDates = sorted.filter(d => +d.slice(0, 4) === year);
    const start = yearDates[0], end = yearDates.at(-1);
    const since = +first.slice(0, 4) === year;
    return {
      year, start, end,
      mode: since ? "since" : "year",
      label: since ? `Since ${MONTHS_LONG[+start.slice(5, 7) - 1]} ${year}` : `${year} Recap`,
      range: `${prettyDate(start)} → ${prettyDate(end)}, ${year}`,
      days: dayDiff(start, end) + 1,
      inPeriod: d => d >= start && d <= end,
    };
  }

  // Running cadence and power from per-activity rows { fam, secs, spm, avgW, np, maxW, rpm }, oldest first.
  // Shared with the CSV parser so both paths give the same cards.
  function motion(rows) {
    const wmean = (list, pick) => { const t = list.reduce((s, r) => s + r.secs, 0); return t ? list.reduce((s, r) => s + pick(r) * r.secs, 0) / t : NaN; };
    const runs = rows.filter(r => r.fam === "running" && r.secs >= 300 && r.spm >= 120 && r.spm <= 230);
    const cadence = runs.length >= 5 ? {
      runs: runs.length, spm: wmean(runs, r => r.spm),
      first: mean(runs.slice(0, 5).map(r => r.spm)), last: mean(runs.slice(-5).map(r => r.spm)),
    } : null;
    const withW = fam => rows.filter(r => r.fam === fam && r.secs >= 300 && r.avgW > 0);
    const rides = withW("cycling"), runP = withW("running");
    const [sport, list] = rides.length >= 3 ? ["cycling", rides] : runP.length >= 5 ? ["running", runP] : [null, []];
    let power = null;
    if (sport) {
      const spun = list.filter(r => r.rpm > 0);
      power = {
        sport, sessions: list.length,
        kJ: list.reduce((s, r) => s + r.avgW * r.secs, 0) / 1000,
        avgW: wmean(list, r => r.avgW),
        bestNP: Math.max(0, ...list.map(r => r.np || 0)) || null,
        maxW: Math.max(0, ...list.map(r => r.maxW || 0)) || null,
        rpm: spun.length ? wmean(spun, r => r.rpm) : null,
      };
    }
    return { cadence, power };
  }

  function computeStats(files) {
    const acts = new Map(), uds = new Map(), nights = new Map(), fa = [];
    let profile = null;
    for (const [path, data] of files) {
      const b = base(path);
      if (PATTERNS.activities.test(b)) {
        for (const blk of arr(data)) for (const a of arr(blk.summarizedActivitiesExport)) acts.set(a.activityId, a);
      } else if (PATTERNS.daily.test(b)) {
        for (const u of arr(data)) if (u.totalSteps || !uds.has(u.calendarDate)) uds.set(u.calendarDate, u);
      } else if (PATTERNS.sleep.test(b)) {
        // overlapping files can repeat a night; keep the longer record
        const len = n => (n.deepSleepSeconds || 0) + (n.lightSleepSeconds || 0) + (n.remSleepSeconds || 0);
        for (const n of arr(data)) if (n.sleepScores && (!nights.has(n.calendarDate) || len(n) > len(nights.get(n.calendarDate)))) nights.set(n.calendarDate, n);
      } else if (PATTERNS.fitnessAge.test(b)) {
        fa.push(...arr(data));
      } else if (PATTERNS.profile.test(b)) {
        profile = data;
      }
    }
    const allActs = [...acts.values()].filter(a => a.startTimeLocal).map(a => ({ ...a, _l: local(a.startTimeLocal) }));
    const days = [...uds.values()].filter(u => u.totalSteps);
    const dates = [...allActs.map(a => a._l.date), ...days.map(u => u.calendarDate)];
    if (!dates.length) throw new Error("No activities or daily summaries found. Is this a Garmin Connect data export?");

    const P = choosePeriod(dates);
    const A = allActs.filter(a => P.inPeriod(a._l.date)).sort((x, y) => x.startTimeLocal - y.startTimeLocal);
    const U = days.filter(u => P.inPeriod(u.calendarDate)).sort((x, y) => (x.calendarDate < y.calendarDate ? -1 : 1));

    // Timezone offset (ms) from a daily summary: local midnight minus its GMT instant.
    const tz = (() => { const u = U.find(x => x.wellnessStartTimeLocal && x.wellnessStartTimeGmt); return u ? Date.parse(u.wellnessStartTimeLocal + "Z") - Date.parse(u.wellnessStartTimeGmt + "Z") : 0; })();

    /* activities */
    const byHour = {}, byWeekday = {}, fam = {};
    const zoneMs = [0, 0, 0, 0, 0];
    let sweatMl = 0, moveMs = 0;
    for (const a of A) {
      byHour[a._l.hour] = (byHour[a._l.hour] || 0) + 1;
      byWeekday[a._l.wd] = (byWeekday[a._l.wd] || 0) + 1;
      for (let z = 1; z <= 5; z++) zoneMs[z - 1] += a[`hrTimeInZone_${z}`] || 0;
      sweatMl += a.waterEstimated || 0;
      moveMs += a.duration || 0;
      const f = fam[family(a.activityType)] ||= { count: 0, km: 0, hours: 0 };
      f.count++; f.km += (a.distance || 0) / 1e5; f.hours += (a.duration || 0) / 3.6e6;
    }
    const activeDays = [...new Set(A.map(a => a._l.date))].sort();
    let streak = activeDays.length ? 1 : 0, run = streak;
    for (let i = 1; i < activeDays.length; i++) { run = dayDiff(activeDays[i - 1], activeDays[i]) === 1 ? run + 1 : 1; streak = Math.max(streak, run); }

    /* daily summaries */
    const stressVals = {};
    let stressDays = 0, climb = 0;
    for (const u of U) {
      climb += u.floorsAscendedInMeters || 0;
      const t = (u.allDayStress?.aggregatorList || []).find(x => x.type === "TOTAL");
      if (t && t.averageStressLevel > 0) { (stressVals[local(Date.parse(u.calendarDate)).wd] ||= []).push(t.averageStressLevel); stressDays++; }
    }
    const stressByWeekday = Object.fromEntries(Object.entries(stressVals).map(([d, v]) => [d, mean(v)]));
    const best = U.reduce((m, u) => (u.totalSteps > (m?.totalSteps || 0) ? u : m), null);
    const totalSteps = U.reduce((s, u) => s + u.totalSteps, 0);
    // Garmin's own daily distance (stride-calibrated); fall back to a step estimate only when missing
    const measured = U.filter(u => u.totalDistanceMeters > 0);
    const distanceKm = measured.length >= U.length * 0.8 ? U.reduce((s, u) => s + (u.totalDistanceMeters || u.totalSteps * 0.75), 0) / 1000 : null;

    /* sleep: nights of 3 h or more */
    const N = [...nights.values()].filter(n => P.inPeriod(n.calendarDate))
      .map(n => ({ n, h: ((n.deepSleepSeconds || 0) + (n.lightSleepSeconds || 0) + (n.remSleepSeconds || 0)) / 3600 }))
      .filter(x => x.h >= 3);
    const clockMin = gmt => { const d = new Date(Date.parse(gmt + "Z") + tz); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
    const sleep = N.length ? {
      nights: N.length,
      avgHours: mean(N.map(x => x.h)),
      avgScore: mean(N.map(x => x.n.sleepScores.overallScore)),
      bedtime: hhmm((median(N.map(x => (clockMin(x.n.sleepStartTimestampGMT) + 720) % 1440)) + 720) % 1440),
      wake: hhmm(median(N.map(x => clockMin(x.n.sleepEndTimestampGMT)))),
    } : { nights: 0 };

    /* body: first vs last week of the period, so one odd reading can't swing it */
    const rhrDays = U.filter(u => u.restingHeartRate);
    const wk = (list, pick) => [Math.round(mean(list.slice(0, 7).map(pick))), Math.round(mean(list.slice(-7).map(pick)))];
    const vo2 = A.filter(a => a.vO2MaxValue).map(a => a.vO2MaxValue);
    const ages = fa.filter(r => r.currentBioAge && P.inPeriod(String(r.asOfDateGmt).slice(0, 10))).sort((x, y) => (x.asOfDateGmt < y.asOfDateGmt ? -1 : 1));
    const body = { days: rhrDays.length > 1 ? dayDiff(rhrDays[0].calendarDate, rhrDays.at(-1).calendarDate) : 0 };
    if (rhrDays.length >= 14) body.rhr = wk(rhrDays, u => u.restingHeartRate);
    if (vo2.length >= 2) body.vo2 = [vo2[0], vo2.at(-1)];
    if (ages.length >= 2) body.fitnessAge = [ages[0].currentBioAge, ages.at(-1).currentBioAge];

    const { cadence, power } = motion(A.map(a => ({
      fam: family(a.activityType), secs: (a.duration || 0) / 1000,
      spm: a.avgDoubleCadence || (a.avgRunCadence ? a.avgRunCadence * 2 : 0),   // avgRunCadence is per leg
      avgW: a.avgPower, np: a.normPower, maxW: a.maxPower, rpm: a.avgBikeCadence,
    })));

    const firstName = profile?.firstName || null;
    return {
      period: { mode: P.mode, label: P.label, range: P.range, year: P.year, start: P.start, end: P.end, days: P.days },
      name: firstName,
      totals: {
        activities: A.length, activeDays: activeDays.length, longestStreak: streak,
        hours: moveMs / 3.6e6, families: fam,
      },
      // ---- insight engine inputs ----
      byHour, byWeekday,
      zoneHours: zoneMs.map(ms => ms / 3.6e6),
      stressByWeekday, days: stressDays,
      steps: { total: totalSteps, days: U.length, distanceKm, bestDay: best ? { date: prettyDate(best.calendarDate), steps: best.totalSteps } : null },
      sleep, body,
      sweatLiters: sweatMl / 1000,
      climbMeters: climb,
      cadence, power,
    };
  }

  const api = { computeStats, isWanted, family, motion, PATTERNS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ParseExport = api;
})(typeof window !== "undefined" ? window : globalThis);
