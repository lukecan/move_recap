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

  /* --------------------------------------------------------------- DECK */
  function deck(stats) {
    const cards = [when, zones, stressDay, steps, sleep, body, sweat, climb].map(f => f(stats));
    return {
      shown: cards.filter(c => !c.skip).sort((a, b) => b.score - a.score),
      skipped: cards.filter(c => c.skip),
    };
  }

  const api = { when, zones, stressDay, steps, sleep, body, sweat, climb, deck, DAYS, distance, heightShort };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Insights = api;
})(typeof window !== "undefined" ? window : globalThis);
