/*
 * Wellbeing Recap: insight engine.
 *
 * Each card is a pure function: stats in, insight out.
 *   { id, skip, reason?, score, persona, headline, body, facts[], trace[] }
 * - skip:     true when there is not enough data to say anything honest
 * - score:    0..1 "interestingness", used to order the deck
 * - persona:  short label for the user's pattern
 * - trace:    the rule path that produced this insight (for tuning copy)
 *
 * Runs in the browser (window.Insights) and in Node (module.exports).
 */
(function (root) {
  "use strict";

  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const DAY_NAME = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };
  const pct = x => Math.round(x * 100);
  const sum = a => a.reduce((s, x) => s + x, 0);
  const clamp01 = x => Math.max(0, Math.min(1, x));
  const hour12 = h => `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;

  /* ---------------------------------------------------------------- WHEN */
  // Time-of-day windows. Night wraps past midnight.
  const WINDOWS = [
    { key: "dawn",      label: "early bird",          hours: [4, 5, 6, 7, 8, 9] },
    { key: "midday",    label: "lunch-break athlete", hours: [10, 11, 12, 13, 14] },
    { key: "afternoon", label: "afternoon athlete",   hours: [15, 16, 17] },
    { key: "evening",   label: "evening athlete",     hours: [18, 19, 20, 21] },
    { key: "night",     label: "night owl",           hours: [22, 23, 0, 1, 2, 3] },
  ];

  const WHERE = { dawn: "in the early morning", midday: "around midday", afternoon: "in the afternoon", evening: "in the evening", night: "late at night" };

  function when({ byHour, byWeekday }) {
    const trace = [];
    const total = sum(Object.values(byHour));
    if (total < 20) return { id: "when", skip: true, reason: `Only ${total} activities; need 20 to see a pattern.` };

    const win = WINDOWS.map(w => ({ ...w, n: sum(w.hours.map(h => byHour[h] || 0)) }))
      .map(w => ({ ...w, share: w.n / total }))
      .sort((a, b) => b.share - a.share);
    const [top, second] = win;
    const peakHour = +Object.entries(byHour).sort((a, b) => b[1] - a[1])[0][0];
    trace.push(`top window ${top.key} ${pct(top.share)}%, second ${second.key} ${pct(second.share)}%`);

    const wkTotal = sum(Object.values(byWeekday));
    const weekend = ((byWeekday.Sat || 0) + (byWeekday.Sun || 0)) / wkTotal;
    const favDay = DAYS.slice().sort((a, b) => (byWeekday[b] || 0) - (byWeekday[a] || 0))[0];
    trace.push(`weekend share ${pct(weekend)}%, favourite day ${favDay}`);

    let persona, headline, body, score;
    if (weekend >= 0.45) {
      persona = "weekend warrior";
      headline = "Weekdays are for work. Weekends are for you.";
      body = `${pct(weekend)}% of your activities happened on Saturday or Sunday.`;
      score = 0.6 + (weekend - 0.45);
      trace.push("rule: weekend share ≥ 45% → weekend warrior");
    } else if (top.share >= 0.3 && second.share >= 0.3 && top.share - second.share <= 0.1) {
      persona = "double shift";
      const pair = [top.key, second.key].sort().join("+");
      headline = pair === "dawn+evening" ? "Dawn and dusk. You work out on both ends of the day."
               : `You split your training between two shifts.`;
      body = `${pct(top.share)}% of your workouts started ${WHERE[top.key]}, ${pct(second.share)}% ${WHERE[second.key]}. Your single busiest hour was ${hour12(peakHour)}.`;
      score = 0.75;
      trace.push("rule: top two windows both ≥ 30% and within 10 pts → double shift");
    } else if (top.share < 0.35) {
      persona = "anytime athlete";
      headline = "You train whenever life lets you.";
      body = `No time slot claims more than ${pct(top.share)}% of your workouts. Your busiest hour was ${hour12(peakHour)}.`;
      score = 0.35;
      trace.push("rule: top window < 35% → anytime");
    } else {
      persona = top.label;
      headline = {
        dawn: "You're an early bird.",
        midday: "Your lunch break is your training block.",
        afternoon: "You own the afternoon.",
        evening: `You're a ${hour12(peakHour)} athlete.`,
        night: "Night owl. The city sleeps, you train.",
      }[top.key];
      body = `${pct(top.share)}% of your workouts started ${WHERE[top.key]}.`;
      score = 0.4 + top.share * 0.6;
      trace.push(`rule: single dominant window (${pct(top.share)}% ≥ 35%) → ${top.label}`);
    }
    if (persona !== "weekend warrior") body += ` Favourite day: ${DAY_NAME[favDay]}.`;
    return { id: "when", skip: false, score: clamp01(score), persona, headline, body,
      facts: [["peak hour", hour12(peakHour)], ["top window", `${top.key} ${pct(top.share)}%`], ["weekend", `${pct(weekend)}%`]], trace };
  }

  /* --------------------------------------------------------- HR ZONE DNA */
  // zones: hours in Garmin HR zones 1..5 (time below zone 1 is ignored).
  function zones({ zoneHours }) {
    const trace = [];
    const [z1, z2, z3, z4, z5] = zoneHours;
    const total = z1 + z2 + z3 + z4 + z5;
    if (total < 10) return { id: "zones", skip: true, reason: `Only ${total.toFixed(1)} h with heart rate; need 10 h.` };
    const easy = (z1 + z2) / total, mid = z3 / total, hard = (z4 + z5) / total;
    trace.push(`easy ${pct(easy)}%, tempo ${pct(mid)}%, hard ${pct(hard)}% of ${total.toFixed(0)} h`);

    let persona, headline, body, score;
    if (easy >= 0.7 && hard >= 0.1) {
      persona = "polarized";
      headline = "You train like a pro: mostly easy, sometimes very hard.";
      body = `${pct(easy)}% easy, ${pct(hard)}% hard, and little in between. That's the 80/20 pattern many endurance coaches recommend.`;
      score = 0.85;
      trace.push("rule: easy ≥ 70% and hard ≥ 10% → polarized");
    } else if (hard >= 0.3) {
      persona = "intensity junkie";
      headline = "You like it hard.";
      body = `${pct(hard)}% of your time was in zones 4–5. Your easy days could be easier: most coaches aim for about 80% easy.`;
      score = 0.8;
      trace.push("rule: hard ≥ 30% → intensity junkie");
    } else if (mid >= 0.35) {
      persona = "tempo lover";
      headline = "Comfortably hard is your comfort zone.";
      body = `${pct(mid)}% of your time sat in zone 3. Splitting it into easier easy days and harder hard days is a classic next step.`;
      score = 0.7;
      trace.push("rule: zone 3 ≥ 35% → tempo lover");
    } else if (easy >= 0.6) {
      persona = "base builder";
      headline = "You're building a big aerobic engine.";
      body = `${pct(easy)}% of your training was easy (zones 1–2). Many coaches aim for about 80%; you're ${80 - pct(easy)} points away.`;
      score = 0.6;
      trace.push("rule: easy ≥ 60% → base builder");
    } else {
      persona = "all-rounder";
      headline = "A bit of everything.";
      body = `Easy ${pct(easy)}%, tempo ${pct(mid)}%, hard ${pct(hard)}%. No single zone runs your training.`;
      score = 0.4;
      trace.push("rule: no zone group dominates → all-rounder");
    }
    return { id: "zones", skip: false, score, persona, headline, body,
      facts: [["easy (Z1–2)", `${pct(easy)}%`], ["tempo (Z3)", `${pct(mid)}%`], ["hard (Z4–5)", `${pct(hard)}%`]],
      shares: { easy, mid, hard }, trace };
  }

  /* ---------------------------------------------------------- STRESS DAY */
  // stressByWeekday: average Garmin stress level (0–100) per weekday; days: number of days measured.
  function stressDay({ stressByWeekday, days }) {
    const trace = [];
    if (days < 28) return { id: "stress", skip: true, reason: `Only ${days} days of stress data; need 4 weeks.` };
    const entries = DAYS.map(d => [d, stressByWeekday[d]]).filter(e => e[1] != null);
    const sorted = entries.slice().sort((a, b) => b[1] - a[1]);
    const [peakDay, peak] = sorted[0], [calmDay, calm] = sorted.at(-1);
    const spread = peak - calm;
    const avg = sum(entries.map(e => e[1])) / entries.length;
    const level = avg <= 25 ? "resting" : avg <= 50 ? "low" : avg <= 75 ? "medium" : "high";
    trace.push(`peak ${peakDay} ${peak.toFixed(1)}, calmest ${calmDay} ${calm.toFixed(1)}, spread ${spread.toFixed(1)}, avg ${avg.toFixed(1)} (${level})`);

    let persona, headline, score;
    if (spread < 3) {
      persona = "steady";
      headline = "Same stress, every day of the week.";
      score = 0.3;
      trace.push("rule: spread < 3 → steady");
    } else if (peakDay === "Mon") {
      persona = "monday blues";
      headline = "Monday hits hardest.";
      score = 0.55 + spread / 60;
      trace.push("rule: peak Mon → monday blues");
    } else if (peakDay === "Sat" || peakDay === "Sun") {
      persona = "busy weekender";
      headline = "Plot twist: your weekends are the stressful part.";
      score = 0.65 + spread / 60;
      trace.push("rule: peak Sat/Sun → busy weekender (surprising, ranks higher)");
    } else if (peakDay === "Fri") {
      persona = "friday crunch";
      headline = "Fridays wind you up before they wind you down.";
      score = 0.5 + spread / 60;
      trace.push("rule: peak Fri → friday crunch");
    } else {
      persona = "midweek pressure";
      headline = `${DAY_NAME[peakDay]} is your toughest day.`;
      score = 0.45 + spread / 60;
      trace.push("rule: peak Tue–Thu → midweek pressure");
    }
    const body = persona === "steady"
      ? `Your average stress barely moved between days (${calm.toFixed(0)}–${peak.toFixed(0)}). Overall it sat in Garmin's ${level} range.`
      : `${DAY_NAME[peakDay]} averaged ${peak.toFixed(0)}, ${DAY_NAME[calmDay]} only ${calm.toFixed(0)}. Overall your stress sat in Garmin's ${level} range.`;
    return { id: "stress", skip: false, score: clamp01(score), persona, headline, body,
      facts: [["most stressful", DAY_NAME[peakDay]], ["calmest", DAY_NAME[calmDay]], ["average", `${avg.toFixed(0)} · ${level}`]],
      byDay: entries, trace };
  }

  /* --------------------------------------------- comparison ladders (shared) */
  const num = n => Math.round(n).toLocaleString("en-US");
  const times = r => r >= 10 ? `${Math.round(r)}×` : `${r.toFixed(1).replace(/\.0$/, "")}×`;
  // "94% of X" below 1, "just about X" near 1, "2.5× X" above
  const of = (r, thing) => r < 0.95 ? `${Math.round(r * 100)}% of ${thing}` : r <= 1.05 ? `just about ${thing}` : `${times(r)} ${thing}`;
  const count = r => r >= 10 ? num(r) : r.toFixed(1).replace(/\.0$/, "");
  // Units: stats.units is "metric" (default) or "imperial". Data is always metric inside; only wording changes.
  const MI = 1.609344, FT = 0.3048, GAL = 3.785411784;
  const distance = (km, u) => (u === "imperial" ? `${num(km / MI)} mi` : `${num(km)} km`);
  const heightLong = (m, u) => (u === "imperial" ? `${num(m / FT)} feet` : `${num(m)} metres`);
  const heightShort = (m, u) => (u === "imperial" ? `${num(m / FT)} ft` : `${num(m)} m`);
  const volumeLong = (L, u) => (u === "imperial" ? `${num(L / GAL)} gallons` : `${num(L)} litres`);
  const volumeShort = (L, u) => (u === "imperial" ? `${num(L / GAL)} gal` : `${num(L)} L`);
  // Pick the first rung whose `upTo` is above the value; ratio is value / rung.size.
  const rung = (ladder, v) => ladder.find(r => v < r.upTo) || ladder.at(-1);

  /* --------------------------------------------------------------- STEPS */
  const DISTANCES = [
    { upTo: 120,      size: 42.195, name: "marathons",                   say: r => `That's ${of(r, "a marathon")}, on foot.` },
    { upTo: 500,      size: 344,    name: "London → Paris",              say: r => `That's ${of(r, "the distance from London to Paris")}.` },
    { upTo: 1000,     size: 625,    name: "Lisbon → Madrid",             say: r => `That's ${of(r, "the distance from Lisbon to Madrid")}.` },
    { upTo: 2500,     size: 1200,   name: "the length of Italy",         say: r => `That's ${of(r, "the length of Italy")}.` },
    { upTo: Infinity, size: 2500,   name: "Paris → Moscow",              say: r => `That's ${of(r, "the distance from Paris to Moscow")}.` },
  ];
  // steps: { total, days, distanceKm?, bestDay: { date, steps } }.
  // distanceKm is Garmin's measured daily distance; without it we estimate 0.75 m per step.
  function steps({ steps: s, units }) {
    const trace = [];
    if (!s || s.days < 14) return { id: "steps", skip: true, reason: `Only ${s ? s.days : 0} days of step data; need 2 weeks.` };
    const avg = s.total / s.days, km = s.distanceKm ?? s.total * 0.00075, spike = s.bestDay.steps / avg;
    trace.push(s.distanceKm != null ? "distance: Garmin's measured daily distance" : "distance: estimated at 0.75 m per step");
    const r = rung(DISTANCES, km);
    trace.push(`avg ${num(avg)}/day over ${s.days} days, ≈${num(km)} km, best day ${spike.toFixed(1)}× avg`);
    trace.push(`ladder: ${num(km)} km → ${r.name}`);

    let persona, headline, score;
    if (avg >= 12000)      { persona = "step machine";  headline = "You barely sat down this year.";            score = 0.7; }
    else if (avg >= 10000) { persona = "10k club";      headline = "You live in the 10,000-step club.";          score = 0.6; }
    else if (avg >= 7000)  { persona = "steady walker"; headline = "Steady steps, every single day.";            score = 0.45; }
    else                   { persona = "every step counts"; headline = "Every step added up.";                   score = 0.3; }
    trace.push(`rule: avg ${num(avg)} → ${persona}`);
    let body = `${num(s.total)} steps, about ${distance(km, units)}. ${r.say(km / r.size)}`;
    if (spike >= 2.5) { body += ` Your biggest day, ${s.bestDay.date}, was ${spike.toFixed(1)}× your average.`; score += 0.1; trace.push("rule: best day ≥ 2.5× avg → mention spike, +0.1"); }
    return { id: "steps", skip: false, score: clamp01(score), persona, headline, body,
      hero: [num(avg), "steps a day on average"],
      facts: [["total steps", num(s.total)], ["≈ distance", distance(km, units)], ["best day", num(s.bestDay.steps)]], trace };
  }

  /* --------------------------------------------------------------- SLEEP */
  // sleep: { nights, avgHours, avgScore, bedtime: "HH:MM", wake: "HH:MM" } (nights under 3 h already removed)
  function sleep({ sleep: s }) {
    const trace = [];
    if (!s || s.nights < 30) return { id: "sleep", skip: true, reason: `Only ${s ? s.nights : 0} nights of sleep data; need 30.` };
    const [bh, bm] = s.bedtime.split(":").map(Number);
    const bedMin = (bh < 12 ? bh + 24 : bh) * 60 + bm; // minutes after noon-based midnight, so 00:40 > 23:30
    const clock = t => { const [h, m] = t.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };
    const hrs = s.avgHours, hm = `${Math.floor(hrs)} h ${String(Math.round(hrs % 1 * 60)).padStart(2, "0")} m`;
    const type = bedMin < 22 * 60 + 30 ? "early sleeper" : bedMin <= 24 * 60 ? "classic schedule" : "late sleeper";
    trace.push(`avg ${hrs.toFixed(2)} h, score ${s.avgScore}, bedtime ${s.bedtime} → ${type}, ${s.nights} nights`);

    let persona, headline, body, score;
    if (hrs >= 7.5) {
      persona = "sleep champion"; headline = "Sleep is your secret weapon.";
      body = `${hm} a night on average. That's above the 7+ hours most adult sleep guidelines suggest.`; score = 0.7;
    } else if (hrs >= 7) {
      persona = "well rested"; headline = "You gave your body the hours it asked for.";
      body = `${hm} a night on average, right in the range most adult sleep guidelines suggest.`; score = 0.5;
    } else if (hrs >= 6) {
      persona = "almost there"; headline = `In bed by ${clock(s.bedtime)}, up at ${clock(s.wake)}.`;
      body = `${hm} a night on average. Most guidelines suggest 7+ hours; ${Math.round((7 - hrs) * 60)} more minutes a night would get you there.`; score = 0.55;
    } else {
      persona = "short sleeper"; headline = "Your nights were on the short side.";
      body = `${hm} a night on average. Sleep is where training turns into fitness, so it's a cheap place to find gains.`; score = 0.5;
    }
    trace.push(`rule: avg hours ${hrs.toFixed(1)} → ${persona}`);
    if (type === "late sleeper" && persona !== "short sleeper") { body += ` A true night owl: lights out after midnight.`; score += 0.05; trace.push("rule: bedtime after 00:00 → add night-owl line"); }
    return { id: "sleep", skip: false, score: clamp01(score), persona, headline, body,
      hero: [hm, "per night on average"],
      facts: [["bedtime", clock(s.bedtime)], ["wake-up", clock(s.wake)], ["sleep score", String(Math.round(s.avgScore))]], trace };
  }

  /* ---------------------------------------------------------------- BODY */
  // body: { days, rhr: [first, last], vo2: [first, last], fitnessAge: [first, last] } (any metric may be missing)
  // Only improvements and holds are shown. A recap is not the place to deliver bad news, so worse metrics are left out.
  const BODY_METRICS = [
    { key: "rhr",        label: "Resting heart rate", verb: "came down", unit: "bpm", better: -1, min: 2,   fmt: v => String(Math.round(v)) },
    { key: "vo2",        label: "VO2 Max",            verb: "went up",   unit: "",    better: +1, min: 1,   fmt: v => String(Math.round(v)) },
    { key: "fitnessAge", label: "Fitness age",        verb: "came down", unit: "",    better: -1, min: 0.5, fmt: v => v.toFixed(1) },
  ];
  function body({ body: b }) {
    const trace = [];
    if (!b || b.days < 60) return { id: "body", skip: true, reason: `Only ${b ? b.days : 0} days between first and last reading; need 60.` };
    const rows = BODY_METRICS.filter(m => Array.isArray(b[m.key])).map(m => {
      const [a, z] = b[m.key], d = (z - a) * m.better;
      const status = d >= m.min ? "improved" : d <= -m.min ? "worse" : "held";
      trace.push(`${m.key} ${m.fmt(a)} → ${m.fmt(z)}: ${status}`);
      return { ...m, from: m.fmt(a), to: m.fmt(z), status };
    });
    const up = rows.filter(r => r.status === "improved"), held = rows.filter(r => r.status === "held");
    if (!up.length) {
      trace.push("rule: nothing improved → hide card by design");
      return { id: "body", skip: true, reason: "No metric improved, so the card stays out of the recap (by design).", trace };
    }
    let persona, headline, score;
    if (up.length === rows.length) {
      persona = "upgraded"; score = 0.85;
      headline = up.some(r => r.key === "rhr") ? "Your heart is working less for the same life." : "Every fitness marker moved the right way.";
      trace.push("rule: all metrics improved → upgraded");
    } else {
      persona = "on the way up"; score = 0.6;
      headline = up.length === 1 ? `Your ${up[0].label === "VO2 Max" ? "VO2 Max" : up[0].label.toLowerCase()} ${up[0].verb}.` : `${up.length} of ${rows.length} fitness markers moved the right way.`;
      trace.push(`rule: ${up.length}/${rows.length} improved → on the way up (worse ones hidden)`);
    }
    const shown = [...up, ...held];
    // the before/after rows carry the numbers, so the sentence only frames them
    let body = up.length === rows.length
      ? `${rows.length === 2 ? "Both" : `All ${rows.length}`} markers moved the right way in ${b.days} days.`
      : `${up.length} of ${rows.length} markers improved in ${b.days} days.`;
    if (held.length) body += ` ${held.map(r => r.label).join(" and ")} held steady.`;
    return { id: "body", skip: false, score, persona, headline, body,
      beforeAfter: shown.map(r => ({ label: r.label, from: r.from, to: r.to, unit: r.unit, status: r.status })),
      facts: [["improved", String(up.length)], ["held", String(held.length)], ["period", `${b.days} days`]], trace };
  }

  /* --------------------------------------------------------------- SWEAT */
  const SWEAT = [
    { upTo: 20,       size: 0.5,  name: "half-litre bottles",       say: r => `About ${num(r)} half-litre water bottles.` },
    { upTo: 150,      size: 19,   name: "office water-cooler jugs", say: r => `About ${count(r)} office water-cooler jugs.` },
    { upTo: 600,      size: 150,  name: "bathtubs",                 say: r => `Enough to fill ${count(r)} bathtubs.` },
    { upTo: Infinity, size: 1500, name: "hot tubs",                 say: r => `Enough to fill ${count(r)} hot tubs.` },
  ];
  // sweatLiters: sum of Garmin's per-activity sweat-loss estimates
  function sweat({ sweatLiters: L, units }) {
    const trace = [];
    if (!L || L < 2) return { id: "sweat", skip: true, reason: "Fewer than 2 litres of estimated sweat loss." };
    const r = rung(SWEAT, L);
    trace.push(`${L.toFixed(1)} L → ${r.name} (${(L / r.size).toFixed(2)}×)`);
    const score = clamp01(0.45 + Math.log10(L) / 6);
    trace.push(`rule: fun-fact card, score grows with log(litres) → ${score.toFixed(2)}`);
    return { id: "sweat", skip: false, score, persona: "fun fact", headline: `You sweated about ${volumeLong(L, units)}.`,
      body: `${r.say(L / r.size)} Garmin estimates this from each workout's heart rate, duration and temperature.`,
      hero: [volumeShort(L, units), "of sweat, estimated"],
      facts: [[units === "imperial" ? "gallons" : "litres", volumeShort(L, units)], ["≈", r.name], ["per workout", "estimated"]], trace };
  }

  /* --------------------------------------------------------------- CLIMB */
  const HEIGHTS = [
    { upTo: 1000,     size: 330,  name: "Eiffel Tower",  say: r => `That's ${of(r, "the height of the Eiffel Tower")}.` },
    { upTo: 4425,     size: 828,  name: "Burj Khalifa",  say: r => `That's ${of(r, "the height of the Burj Khalifa")}.` },
    { upTo: 8849,     size: 8849, name: "Mount Everest", say: r => `That's ${Math.round(r * 100)}% of the way up Mount Everest.` },
    { upTo: Infinity, size: 8849, name: "Mount Everest", say: r => `That's ${of(r, "the height of Mount Everest")}.` },
  ];
  // climbMeters: total floors climbed, in metres (Garmin's floorsAscendedInMeters)
  // climbSource "workouts" (CSV quick path) means elevation gained during activities, not floors
  function climb({ climbMeters: m, climbSource, units }) {
    const trace = [];
    if (!m || m < 100) return { id: "climb", skip: true, reason: "Less than 100 m of floors climbed." };
    const r = rung(HEIGHTS, m);
    trace.push(`${num(m)} m → ${r.name} (${(m / r.size).toFixed(2)}×)`);
    const score = clamp01(0.4 + Math.log10(m) / 10);
    trace.push(`rule: fun-fact card, score grows with log(metres) → ${score.toFixed(2)}`);
    if (climbSource === "workouts") {
      return { id: "climb", skip: false, score, persona: "fun fact", headline: `You climbed ${heightLong(m, units)} on your workouts.`,
        body: r.say(m / r.size), hero: [heightShort(m, units), "elevation gained"],
        facts: [["climbed", heightShort(m, units)], ["≈", r.name], ["source", "workouts"]], trace };
    }
    return { id: "climb", skip: false, score, persona: "fun fact", headline: `You climbed ${heightLong(m, units)} of stairs and slopes.`,
      body: `${r.say(m / r.size)} About ${num(m / 3)} floors, one flight at a time.`,
      hero: [heightShort(m, units), "climbed"],
      facts: [["climbed", heightShort(m, units)], ["floors", num(m / 3)], ["≈", r.name]], trace };
  }

  /* ------------------------------------------------------------- CADENCE */
  // Songs whose tempo matches a running cadence (steps per minute = beats per minute).
  // Three songs per BPM from 140 to 200, plus a few above. BPMs checked against Spotify-based BPM sites
  // (SongBPM, SongData.io, Tunebat, Gemtracks, jog.fm, Chosic, 12notez) on 2026-11-02; remasters and live
  // versions can differ by 1–3 BPM. Display titles drop "(Remaster)" / "(feat. …)" tags.
  const SONGS = [
    { title: "DNA.", artist: "Kendrick Lamar", bpm: 140 },
    { title: "Scary Monsters and Nice Sprites", artist: "Skrillex", bpm: 140 },
    { title: "Bleed It Out", artist: "Linkin Park", bpm: 140 },
    { title: "Seek & Destroy", artist: "Metallica", bpm: 141 },
    { title: "Ace of Spades", artist: "Motörhead", bpm: 141 },
    { title: "(Don't Fear) The Reaper", artist: "Blue Öyster Cult", bpm: 141 },
    { title: "All of the Lights", artist: "Kanye West", bpm: 142 },
    { title: "Firestarter", artist: "The Prodigy", bpm: 142 },
    { title: "Suffragette City", artist: "David Bowie", bpm: 142 },
    { title: "Toxic", artist: "Britney Spears", bpm: 143 },
    { title: "Longview", artist: "Green Day", bpm: 143 },
    { title: "Shadow Moses", artist: "Bring Me The Horizon", bpm: 143 },
    { title: "Rockstar", artist: "Nickelback", bpm: 144 },
    { title: "Masterpiece", artist: "Jessie J", bpm: 144 },
    { title: "Barefootin'", artist: "Brownsville Station", bpm: 144 },
    { title: "Rock and Roll All Nite", artist: "KISS", bpm: 145 },
    { title: "Rehab", artist: "Amy Winehouse", bpm: 145 },
    { title: "Pretty Vacant", artist: "Sex Pistols", bpm: 145 },
    { title: "Can't Hold Us", artist: "Macklemore & Ryan Lewis", bpm: 146 },
    { title: "Holiday", artist: "Green Day", bpm: 146 },
    { title: "Born to Be Wild", artist: "Steppenwolf", bpm: 146 },
    { title: "White Wedding", artist: "Billy Idol", bpm: 147 },
    { title: "Physical", artist: "Dua Lipa", bpm: 147 },
    { title: "Original Prankster", artist: "The Offspring", bpm: 147 },
    { title: "Mr. Brightside", artist: "The Killers", bpm: 148 },
    { title: "My Sharona", artist: "The Knack", bpm: 148 },
    { title: "Seek & Destroy (Live / Seattle '89)", artist: "Metallica", bpm: 148 },
    { title: "Dancing in the Dark", artist: "Bruce Springsteen", bpm: 149 },
    { title: "All the Small Things", artist: "blink-182", bpm: 149 },
    { title: "We're Not Gonna Take It", artist: "Twisted Sister", bpm: 149 },
    { title: "Bang Bang", artist: "Jessie J, Ariana Grande, Nicki Minaj", bpm: 150 },
    { title: "Papercut", artist: "Linkin Park", bpm: 150 },
    { title: "Never Too Late", artist: "Three Days Grace", bpm: 150 },
    { title: "I'm Yours", artist: "Jason Mraz", bpm: 151 },
    { title: "Message in a Bottle", artist: "The Police", bpm: 151 },
    { title: "You Could Be Mine", artist: "Guns N' Roses", bpm: 151 },
    { title: "Bombtrack", artist: "Rage Against the Machine", bpm: 152 },
    { title: "Runaway", artist: "Bon Jovi", bpm: 152 },
    { title: "Time for Heroes", artist: "The Libertines", bpm: 152 },
    { title: "Hypnotize", artist: "System of a Down", bpm: 153 },
    { title: "We Rock", artist: "Dio", bpm: 153 },
    { title: "Hot Girls in Love", artist: "Loverboy", bpm: 153 },
    { title: "Identity", artist: "X-Ray Spex", bpm: 154 },
    { title: "Dynasties & Dystopia", artist: "Denzel Curry, Gizzle, Bren Joy", bpm: 154 },
    { title: "Cambaz", artist: "mor ve ötesi", bpm: 154 },
    { title: "Iron Man", artist: "Black Sabbath", bpm: 155 },
    { title: "Jekyll and Hyde", artist: "Five Finger Death Punch", bpm: 155 },
    { title: "Dance with the Devil", artist: "Breaking Benjamin", bpm: 155 },
    { title: "Don't Stop Me Now", artist: "Queen", bpm: 156 },
    { title: "Ain't No Rest for the Wicked", artist: "Cage the Elephant", bpm: 156 },
    { title: "Iris", artist: "The Goo Goo Dolls", bpm: 156 },
    { title: "What's My Age Again?", artist: "blink-182", bpm: 157 },
    { title: "In Bloom", artist: "Nirvana", bpm: 157 },
    { title: "Danger Zone", artist: "Kenny Loggins", bpm: 157 },
    { title: "A.D.H.D", artist: "Kendrick Lamar", bpm: 158 },
    { title: "Come Out and Play", artist: "The Offspring", bpm: 158 },
    { title: "Everlong", artist: "Foo Fighters", bpm: 158 },
    { title: "Whole Lotta Rosie", artist: "AC/DC", bpm: 159 },
    { title: "Side to Side", artist: "Ariana Grande, Nicki Minaj", bpm: 159 },
    { title: "Go with the Flow", artist: "Queens of the Stone Age", bpm: 159 },
    { title: "Happy", artist: "Pharrell Williams", bpm: 160 },
    { title: "Shake It Off", artist: "Taylor Swift", bpm: 160 },
    { title: "The Trooper", artist: "Iron Maiden", bpm: 160 },
    { title: "Pain", artist: "Three Days Grace", bpm: 161 },
    { title: "A Forest", artist: "The Cure", bpm: 161 },
    { title: "Ziggy Stardust", artist: "David Bowie", bpm: 161 },
    { title: "Sugar, We're Goin Down", artist: "Fall Out Boy", bpm: 162 },
    { title: "The Middle", artist: "Jimmy Eat World", bpm: 162 },
    { title: "Many Men (Wish Death)", artist: "50 Cent", bpm: 162 },
    { title: "Paranoid", artist: "Black Sabbath", bpm: 163 },
    { title: "Don't Look Back in Anger", artist: "Oasis", bpm: 163 },
    { title: "I Wanna Be Sedated", artist: "Ramones", bpm: 163 },
    { title: "Girlfriend", artist: "Avril Lavigne", bpm: 164 },
    { title: "Decode", artist: "Paramore", bpm: 164 },
    { title: "Black and Yellow", artist: "Wiz Khalifa", bpm: 164 },
    { title: "Them Bones", artist: "Alice in Chains", bpm: 165 },
    { title: "Like a G6", artist: "Far East Movement", bpm: 165 },
    { title: "Here's to Never Growing Up", artist: "Avril Lavigne", bpm: 165 },
    { title: "Rebel Yell", artist: "Billy Idol", bpm: 166 },
    { title: "Bulls on Parade", artist: "Rage Against the Machine", bpm: 166 },
    { title: "Godzilla", artist: "Eminem", bpm: 166 },
    { title: "Boulevard of Broken Dreams", artist: "Green Day", bpm: 167 },
    { title: "good 4 u", artist: "Olivia Rodrigo", bpm: 167 },
    { title: "Zombie", artist: "The Cranberries", bpm: 167 },
    { title: "Sabotage", artist: "Beastie Boys", bpm: 168 },
    { title: "Spit Out the Bone", artist: "Metallica", bpm: 168 },
    { title: "Pain", artist: "Jimmy Eat World", bpm: 168 },
    { title: "Rock and Roll", artist: "Led Zeppelin", bpm: 169 },
    { title: "Centuries", artist: "Fall Out Boy", bpm: 169 },
    { title: "When the Sun Goes Down", artist: "Arctic Monkeys", bpm: 169 },
    { title: "Master of Puppets", artist: "Metallica", bpm: 170 },
    { title: "Bad Blood", artist: "Taylor Swift", bpm: 170 },
    { title: "I Write Sins Not Tragedies", artist: "Panic! At The Disco", bpm: 170 },
    { title: "Machinehead", artist: "Bush", bpm: 171 },
    { title: "Interstate Love Song", artist: "Stone Temple Pilots", bpm: 171 },
    { title: "Can You Feel My Heart", artist: "Bring Me The Horizon", bpm: 171 },
    { title: "The Pretender", artist: "Foo Fighters", bpm: 172 },
    { title: "The Last in Line", artist: "Dio", bpm: 172 },
    { title: "(She's A) Runaround", artist: "The Undertones", bpm: 172 },
    { title: "Feeling This", artist: "blink-182", bpm: 173 },
    { title: "The Hell Song", artist: "Sum 41", bpm: 173 },
    { title: "Highway Star", artist: "Deep Purple", bpm: 173 },
    { title: "Gold Cobra", artist: "Limp Bizkit", bpm: 174 },
    { title: "Ocean Avenue", artist: "Yellowcard", bpm: 174 },
    { title: "Run to the Hills", artist: "Iron Maiden", bpm: 174 },
    { title: "Footloose", artist: "Kenny Loggins", bpm: 175 },
    { title: "Price Tag", artist: "Jessie J, B.o.B", bpm: 175 },
    { title: "Going Under", artist: "Evanescence", bpm: 175 },
    { title: "Basket Case", artist: "Green Day", bpm: 176 },
    { title: "Dancing with Myself", artist: "Billy Idol", bpm: 176 },
    { title: "Blitzkrieg Bop", artist: "Ramones", bpm: 176 },
    { title: "I'm Still Standing", artist: "Elton John", bpm: 177 },
    { title: "The Boys of Summer", artist: "Don Henley", bpm: 177 },
    { title: "Alone Again Or", artist: "The Damned", bpm: 177 },
    { title: "Mr. Blue Sky", artist: "Electric Light Orchestra", bpm: 178 },
    { title: "Get Ur Freak On", artist: "Missy Elliott", bpm: 178 },
    { title: "The Anthem", artist: "Good Charlotte", bpm: 178 },
    { title: "Kickstart My Heart", artist: "Mötley Crüe", bpm: 179 },
    { title: "Bad Moon Rising", artist: "Creedence Clearwater Revival", bpm: 179 },
    { title: "MONTERO (Call Me By Your Name)", artist: "Lil Nas X", bpm: 179 },
    { title: "I'm Not Okay (I Promise)", artist: "My Chemical Romance", bpm: 180 },
    { title: "Fireflies", artist: "Owl City", bpm: 180 },
    { title: "Do Me a Favour", artist: "Arctic Monkeys", bpm: 180 },
    { title: "Dear Maria, Count Me In", artist: "All Time Low", bpm: 181 },
    { title: "Last Resort", artist: "Papa Roach", bpm: 181 },
    { title: "Question!", artist: "System of a Down", bpm: 181 },
    { title: "All Nightmare Long", artist: "Metallica", bpm: 182 },
    { title: "Let There Be Rock", artist: "AC/DC", bpm: 182 },
    { title: "Santeria", artist: "Sublime", bpm: 182 },
    { title: "The Kill (Bury Me)", artist: "Thirty Seconds to Mars", bpm: 183 },
    { title: "Last Friday Night (T.G.I.F.)", artist: "Katy Perry", bpm: 183 },
    { title: "Give It Away", artist: "Red Hot Chili Peppers", bpm: 183 },
    { title: "The Emptiness Machine", artist: "Linkin Park", bpm: 184 },
    { title: "We Are Young", artist: "fun.", bpm: 184 },
    { title: "Give 'Em Hell, Kid", artist: "My Chemical Romance", bpm: 184 },
    { title: "Headstrong", artist: "Trapt", bpm: 185 },
    { title: "I'm Not a Vampire", artist: "Falling in Reverse", bpm: 185 },
    { title: "Kill Rock 'n Roll", artist: "System of a Down", bpm: 185 },
    { title: "Starboy", artist: "The Weeknd, Daft Punk", bpm: 186 },
    { title: "American Idiot", artist: "Green Day", bpm: 186 },
    { title: "Hysteria", artist: "Muse", bpm: 186 },
    { title: "Ready to Die", artist: "Andrew W.K.", bpm: 187 },
    { title: "Wonderful", artist: "Everclear", bpm: 187 },
    { title: "No Way Back", artist: "Foo Fighters", bpm: 187 },
    { title: "Gunpowder & Lead", artist: "Miranda Lambert", bpm: 188 },
    { title: "ABC", artist: "The Jackson 5", bpm: 188 },
    { title: "Karma Chameleon", artist: "Culture Club", bpm: 188 },
    { title: "Turn the Lights Off", artist: "Tally Hall", bpm: 189 },
    { title: "Lip Gloss", artist: "Lil Mama", bpm: 189 },
    { title: "Billy's Third", artist: "The Undertones", bpm: 189 },
    { title: "Animals", artist: "Maroon 5", bpm: 190 },
    { title: "679", artist: "Fetty Wap", bpm: 190 },
    { title: "Partners in Crime", artist: "Set It Off", bpm: 190 },
    { title: "Waka Waka (Esto es Africa)", artist: "Shakira", bpm: 191 },
    { title: "I'll Be There for You", artist: "The Rembrandts", bpm: 191 },
    { title: "Steal My Sunshine", artist: "LEN", bpm: 191 },
    { title: "Still Waiting", artist: "Sum 41", bpm: 192 },
    { title: "I Hate Everything About You", artist: "Three Days Grace", bpm: 192 },
    { title: "Battery", artist: "Metallica", bpm: 192 },
    { title: "The Rock Show", artist: "blink-182", bpm: 193 },
    { title: "Single Ladies (Put a Ring on It)", artist: "Beyoncé", bpm: 193 },
    { title: "99 Red Balloons", artist: "Nena", bpm: 193 },
    { title: "Welcome to the Black Parade", artist: "My Chemical Romance", bpm: 194 },
    { title: "When I Come Around", artist: "Green Day", bpm: 194 },
    { title: "Angel of Death", artist: "Slayer", bpm: 194 },
    { title: "Lisztomania", artist: "Phoenix", bpm: 195 },
    { title: "Tornado of Souls", artist: "Megadeth", bpm: 195 },
    { title: "Superman", artist: "Goldfinger", bpm: 195 },
    { title: "Prayer of the Refugee", artist: "Rise Against", bpm: 196 },
    { title: "Let's Go Crazy", artist: "Prince", bpm: 196 },
    { title: "Cherry Pie", artist: "Warrant", bpm: 196 },
    { title: "Fat Lip", artist: "Sum 41", bpm: 197 },
    { title: "Linoleum", artist: "NOFX", bpm: 197 },
    { title: "Riot", artist: "Three Days Grace", bpm: 197 },
    { title: "Time of Dying", artist: "Three Days Grace", bpm: 198 },
    { title: "Kryptonite", artist: "3 Doors Down", bpm: 198 },
    { title: "Up the Bracket", artist: "The Libertines", bpm: 198 },
    { title: "I've Got a Woman", artist: "Ray Charles", bpm: 199 },
    { title: "Holy Wars... The Punishment Due", artist: "Megadeth", bpm: 199 },
    { title: "Storming the Burning Fields", artist: "DragonForce", bpm: 199 },
    { title: "Through the Fire and Flames", artist: "DragonForce", bpm: 200 },
    { title: "This Ain't a Scene, It's an Arms Race", artist: "Fall Out Boy", bpm: 200 },
    { title: "Let Me Love You", artist: "DJ Snake, Justin Bieber", bpm: 200 },
    { title: "Bad Reputation", artist: "Joan Jett & the Blackhearts", bpm: 204 },
    { title: "White Riot", artist: "The Clash", bpm: 205 }
  ];
  // the three songs nearest a cadence; one is picked at random so recaps differ
  const songsFor = spm => [...SONGS].sort((a, b) => Math.abs(a.bpm - spm) - Math.abs(b.bpm - spm) || a.bpm - b.bpm).slice(0, 3);

  // cadence: { runs, spm, first, last } — duration-weighted average steps/min over runs, plus first/last 5 runs
  function cadence({ cadence: c, random = Math.random }) {
    const trace = [];
    if (!c || c.runs < 5) return { id: "cadence", skip: true, reason: `Only ${c ? c.runs : 0} runs with cadence; need 5.` };
    const spm = Math.round(c.spm), near = songsFor(spm), song = near[Math.min(2, Math.floor(random() * near.length))];
    const diff = Math.abs(song.bpm - spm);
    trace.push(`${spm} spm over ${c.runs} runs; nearest songs ${near.map(x => x.bpm).join("/")} → picked ${song.title} (${song.bpm}, off by ${diff})`);
    let persona, score = 0.6;
    if (spm >= 178) persona = "quick feet";
    else if (spm >= 168) persona = "smooth strider";
    else if (spm >= 158) persona = "steady strider";
    else persona = "long strider";
    trace.push(`rule: ${spm} spm → ${persona}`);
    let body = diff <= 2
      ? `You run at ${spm} steps a minute and ${song.artist}'s track plays at ${song.bpm} BPM, so every step lands on the beat.`
      : `You run at ${spm} steps a minute and ${song.artist}'s track plays at ${song.bpm} BPM. Queue it up and you'll run in step.`;
    const gain = Math.round(c.last - c.first);
    if (gain >= 3) { body += ` You're ${gain} steps a minute quicker than in your first runs.`; score += 0.1; trace.push(`rule: +${gain} spm since first runs → mention, +0.1`); }
    return { id: "cadence", skip: false, score, persona, headline: diff <= 2 ? `"${song.title}" is your perfect running song.` : `"${song.title}" is right in your stride.`, body,
      hero: [String(spm), "steps per minute"], song,
      facts: [["cadence", `${spm} spm`], ["song", `${song.title} · ${song.bpm} BPM`], ["runs", String(c.runs)]], trace };
  }

  /* --------------------------------------------------------------- POWER */
  // Work done = average watts × seconds. 1 kWh = 3,600 kJ.
  const ENERGY = [
    { upTo: 1.5,      size: 0.015, name: "phone charges", say: r => `That's enough to fully charge a phone about ${count(r)} times.` },
    { upTo: 20,       size: 0.15,  name: "kettles",       say: r => `That's enough to boil about ${count(r)} full kettles.` },
    { upTo: Infinity, size: 0.16,  name: "EV km",         say: (r, u) => `That's enough to drive an electric car about ${distance(r, u)}.` },
  ];
  // power: { sport: "cycling" | "running", sessions, kJ, avgW, bestNP, maxW, rpm }
  function power({ power: p, units }) {
    const trace = [];
    if (!p) return { id: "power", skip: true, reason: "No power data (needs 3 rides or 5 runs with a power meter)." };
    const kWh = p.kJ / 3600, r = rung(ENERGY, kWh), bike = p.sport === "cycling";
    trace.push(`${p.sport}: ${p.sessions} sessions, ${num(p.kJ)} kJ (${kWh.toFixed(2)} kWh) → ${r.name}; avg ${num(p.avgW)} W, best NP ${p.bestNP}, peak ${p.maxW}`);
    let persona, score;
    if (!bike) { persona = "power runner"; score = 0.45; }
    else if (p.avgW >= 220) { persona = "watt machine"; score = 0.65; }
    else if (p.avgW >= 160) { persona = "diesel engine"; score = 0.6; }
    else { persona = "power builder"; score = 0.55; }
    trace.push(`rule: ${p.sport}, avg ${num(p.avgW)} W → ${persona}`);
    const body = r.say(kWh / r.size, units) + (bike ? " On a bike, every kilojoule of work burns about one calorie." : " Garmin measures this from your running power, run by run.");
    const tiles = [[`${num(p.avgW)} W`, bike ? "average per ride" : "average per run"]];
    if (p.bestNP) tiles.push([`${num(p.bestNP)} W`, "best normalized power"]);
    if (p.maxW) tiles.push([`${num(p.maxW)} W`, "peak"]);
    if (bike && p.rpm) tiles.push([`${num(p.rpm)} rpm`, "pedal cadence"]);
    else tiles.push([num(p.sessions), bike ? "rides with power" : "runs with power"]);
    return { id: "power", skip: false, score, persona,
      headline: bike ? `You put ${num(p.kJ)} kJ into the pedals.` : `You put ${num(p.kJ)} kJ of power into your runs.`,
      body, tiles, facts: [["work", `${num(p.kJ)} kJ`], ["average", `${num(p.avgW)} W`], ["≈", r.name]], trace };
  }

  /* --------------------------------------------------------------- DECK */
  function deck(stats) {
    const cards = [when, zones, stressDay, cadence, power, steps, sleep, body, sweat, climb].map(f => f(stats));
    return {
      shown: cards.filter(c => !c.skip).sort((a, b) => b.score - a.score),
      skipped: cards.filter(c => c.skip),
    };
  }

  const api = { when, zones, stressDay, cadence, power, steps, sleep, body, sweat, climb, deck, DAYS, distance, heightShort, SONGS, songsFor };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Insights = api;
})(typeof window !== "undefined" ? window : globalThis);
