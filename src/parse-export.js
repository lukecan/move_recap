/*
 * Move Recap: Garmin export → stats for the insight engine.
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
    gear: /gear\.json$/,
    records: /personalRecord\.json$/,
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

  // Garmin strength categories → the body area they mostly train
  const AREA = [
    ["legs & glutes", /SQUAT|LUNGE|DEADLIFT|LEG_CURL|CALF|HIP_RAISE|HIP_STABILITY|PLYO|STEP_UP|GLUTE/],
    ["core", /CORE|CRUNCH|PLANK|SIT_UP|LEG_RAISE|HIP_SWING/],
    ["chest", /BENCH|CHEST|PUSH_UP|FLYE?\b/],
    ["back", /ROW|PULL_UP|LAT_|HYPEREXTENSION|PULLDOWN/],
    ["shoulders", /SHOULDER|LATERAL_RAISE|SHRUG|OVERHEAD/],
    ["arms", /CURL|TRICEP/],
    ["full body", /TOTAL_BODY|OLYMPIC|CARRY|CARDIO|MOVE|SLED|BATTLE_ROPE|BANDED|SUSPENSION|FLYE/],
  ];
  const areaOf = cat => (AREA.find(([, re]) => re.test(cat || "")) || ["full body"])[0];
  const SKIP_SETS = /WARM_UP|STRETCH|UNKNOWN|REST/;
  const fold = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i").toLowerCase().trim();
  const MON = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  // "Wed May 20 15:00:00 GMT 2026" → "2026-05-20"
  const prDate = s => { const m = /^\w{3} (\w{3}) (\d{1,2}) .* (\d{4})$/.exec(s || ""); return m ? `${m[3]}-${String(MON[m[1]] + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}` : null; };

  // Swimming strokes, strength sets, mind & body minutes, temperatures, places, shoes, records.
  function details(A, all, { gear, recs, inPeriod }) {
    const swims = A.filter(a => family(a.activityType) === "swimming");
    const stroked = swims.filter(a => a.strokes > 0);
    const swim = stroked.length >= 3 ? {
      swims: stroked.length, strokes: stroked.reduce((s, a) => s + a.strokes, 0),
      km: swims.reduce((s, a) => s + (a.distance || 0), 0) / 1e5,
      openKm: swims.filter(a => /open_water/.test(a.activityType)).reduce((s, a) => s + (a.distance || 0), 0) / 1e5,
    } : null;

    const lifts = A.filter(a => /strength/.test(a.activityType) && arr(a.summarizedExerciseSets).length);
    let strength = null;
    if (lifts.length >= 5) {
      const moves = {}, areas = {};
      let sets = 0, reps = 0;
      for (const a of lifts) for (const e of arr(a.summarizedExerciseSets)) {
        if (SKIP_SETS.test(e.category) || !e.sets) continue;
        sets += e.sets; reps += e.reps || 0;
        const name = e.subCategory || e.category;
        moves[name] = (moves[name] || 0) + e.sets;
        const ar = areaOf(e.category); areas[ar] = (areas[ar] || 0) + e.sets;
      }
      const fav = Object.entries(moves).sort((x, y) => y[1] - x[1])[0];
      if (sets >= 20) strength = { sessions: lifts.length, minutes: lifts.reduce((s, a) => s + (a.duration || 0), 0) / 6e4, moves: Object.keys(moves).length,
        sets, reps, favourite: fav ? fav[0] : null, favouriteSets: fav ? fav[1] : 0, areas };
    }

    const calm = A.filter(a => /yoga|breathwork|meditation|pilates/.test(a.activityType));
    const minutes = calm.reduce((s, a) => s + (a.duration || 0), 0) / 6e4;
    const drops = calm.filter(a => Number.isFinite(a.differenceStress)).map(a => a.differenceStress);
    const breaths = calm.filter(a => a.avgRespirationRate > 0).map(a => a.avgRespirationRate);
    const kinds = {};
    for (const a of calm) { const k = /yoga|pilates/.test(a.activityType) ? "yoga" : /breath/.test(a.activityType) ? "breathwork" : "meditation"; kinds[k] = (kinds[k] || 0) + 1; }
    const mind = calm.length >= 3 && minutes >= 30 ? {
      sessions: calm.length, minutes, kinds,
      slowestBreath: breaths.length ? Math.min(...breaths) : null,
      stressChange: drops.length >= 3 ? mean(drops) : null,
    } : null;

    // swims log water temperature, not air: leave them out
    const warm = A.filter(a => Number.isFinite(a.maxTemperature) && Number.isFinite(a.minTemperature) && family(a.activityType) !== "swimming");
    let weather = null;
    if (warm.length >= 10) {
      const hot = warm.reduce((m, a) => (a.maxTemperature > m.maxTemperature ? a : m));
      const cold = warm.reduce((m, a) => (a.minTemperature < m.minTemperature ? a : m));
      const pick = (a, t) => ({ c: t, date: a._l.date, sport: family(a.activityType) });
      weather = { workouts: warm.length, hot: pick(hot, hot.maxTemperature), cold: pick(cold, cold.minTemperature) };
    }

    // places: the city each workout started in, from its start coordinates (offline list, see geo.js).
    // Without the list (or coordinates), fall back to Garmin's location names, grouped across spellings.
    const Geo = root.Geo || (typeof require !== "undefined" ? require("./geo.js") : null);
    let places;
    if (Geo && Geo.ready()) {
      const cities = new Map(), countries = new Map();
      for (const a of A) {
        const hit = Geo.nearest(a.startLatitude, a.startLongitude);
        if (!hit) continue;
        const k = `${hit.city}|${hit.cc}`, c = cities.get(k) || { name: hit.city, cc: hit.cc, country: Geo.countryName(hit.cc), count: 0 };
        c.count++; cities.set(k, c); countries.set(hit.cc, (countries.get(hit.cc) || 0) + 1);
      }
      const list = [...cities.values()].sort((x, y) => y.count - x.count);
      places = list.length >= 2 ? { list, countries: countries.size } : null;
    }
    const groups = new Map();
    for (const a of A) if (a.locationName) {
      const k = fold(a.locationName), g = groups.get(k) || { count: 0, names: {} };
      g.count++; g.names[a.locationName] = (g.names[a.locationName] || 0) + 1; groups.set(k, g);
    }
    // show the spelling with local letters (Muratpaşa over Muratpasa), else the most common one
    const accented = n => /[^\x00-\x7f]/.test(n);
    const placeList = [...groups.values()].map(g => ({ name: Object.entries(g.names).sort((x, y) => accented(y[0]) - accented(x[0]) || y[1] - x[1])[0][0], count: g.count })).sort((x, y) => y.count - x.count);
    if (places === undefined) places = placeList.length >= 2 ? { list: placeList, countries: null } : null;

    // shoes: distance of every activity logged with them, all time (shoe life isn't yearly)
    let shoes = null;
    if (gear) {
      const byId = new Map(all.map(a => [String(a.activityId), a]));
      const list = arr(gear.gearDTOS).filter(g => /shoe/i.test(g.gearTypeName || "") && g.gearStatusName !== "retired").map(g => {
        const ids = arr((gear.gearActivityDTOs || {})[String(g.gearPk)]).map(x => String(x.activityId));
        return { name: g.displayName || g.customMakeModel || "Your shoes", km: ids.reduce((s, id) => s + ((byId.get(id) || {}).distance || 0), 0) / 1e5, maxKm: g.maximumMeters ? g.maximumMeters / 1000 : null };
      }).filter(x => x.km >= 50).sort((x, y) => y.km - x.km);
      if (list.length) shoes = { list };
    }

    // "Best …" times faster than the world record are watch glitches (a miscounted pool length, a GPS jump): drop them.
  const PR_DIST = { "100m": 100, "400m": 400, "750m": 750, "1000m": 1000, "1500m": 1500, "1km": 1000, "1mile": 1609.344, "5km": 5000, "10km": 10000, "Half Marathon": 21097.5, "Marathon": 42195, "40km": 40000 };
  const WR_SEC_PER_M = { Swim: 0.46, Run: 0.13, Cycle: 0.04, Ride: 0.04 };
  const plausible = (type, value) => {
    const m = /^Best (.+?) (Pool Swim|Run|Ride|Cycle)$/.exec(type);
    if (!m || !PR_DIST[m[1]]) return true;
    return value >= PR_DIST[m[1]] * WR_SEC_PER_M[m[2] === "Pool Swim" ? "Swim" : m[2]];
  };
  // personal records set during the period that still stand
    const seen = new Set();
    const records = recs.map(r => ({ type: r.personalRecordType, value: r.value, date: prDate(r.prStartTimeGMT), current: r.current }))
      .filter(r => r.current && r.type && r.date && inPeriod(r.date) && r.value > 0 && !/Goal Streak/.test(r.type) && plausible(r.type, r.value))
      .filter(r => !seen.has(r.type) && seen.add(r.type));
    return { swim, strength, mind, weather, places, shoes, records: records.length ? records : null };
  }

  function computeStats(files) {
    const acts = new Map(), uds = new Map(), nights = new Map(), fa = [];
    let profile = null, gear = null, recs = [];
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
      } else if (PATTERNS.gear.test(b)) {
        gear = arr(data)[0] || null;
      } else if (PATTERNS.records.test(b)) {
        for (const blk of arr(data)) recs.push(...arr(blk.personalRecords));
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

    const extras = details(A, allActs, { gear, recs, inPeriod: P.inPeriod });

    const firstName = profile?.firstName || null;
    return {
      period: { mode: P.mode, label: P.label, range: P.range, year: P.year, start: P.start, end: P.end, days: P.days },
      name: firstName,
      totals: {
        activities: A.length, activeDays: activeDays.length, longestStreak: streak,
        hours: moveMs / 3.6e6, families: fam,
        calories: A.reduce((s, a) => s + (a.calories || 0), 0) / 4.184,   // the export stores kilojoules
      },
      // ---- insight engine inputs ----
      byHour, byWeekday,
      zoneHours: zoneMs.map(ms => ms / 3.6e6),
      stressByWeekday, days: stressDays,
      steps: { total: totalSteps, days: U.length, distanceKm, bestDay: best ? { date: best.calendarDate, steps: best.totalSteps } : null },
      sleep, body,
      sweatLiters: sweatMl / 1000,
      climbMeters: climb,
      cadence, power,
      ...extras,
    };
  }

  const api = { computeStats, isWanted, family, motion, PATTERNS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ParseExport = api;
})(typeof window !== "undefined" ? window : globalThis);
