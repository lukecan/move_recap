/*
 * Move Recap: insight engine.
 *
 * Each card is a pure function: stats in, insight out.
 *   { id, skip, reason?, score, persona, headline, body, facts[], trace[] }
 * - skip:     true when there is not enough data to say anything honest
 * - score:    0..1 "interestingness", used to order the deck
 * - persona:  short label for the user's pattern
 * - trace:    the rule path that produced this insight (for tuning copy; English only)
 *
 * Language: stats.lang "en" (default) or "tr". Every visible string is written as t(english, turkish),
 * and numbers, dates, hours and units follow the language. Data stays the same.
 *
 * Runs in the browser (window.Insights) and in Node (module.exports).
 */
(function (root) {
  "use strict";

  /* ------------------------------------------------------------ language */
  let LANG = "en";
  const TR = () => LANG === "tr";
  const t = (en, tr) => (TR() ? tr : en);
  // run a card with the language its stats ask for
  const inLang = f => stats => { const prev = LANG; LANG = stats && stats.lang === "tr" ? "tr" : "en"; try { return f(stats || {}); } finally { LANG = prev; } };

  // Turkish suffixes follow the last spoken word of a number (62 → "iki" → 'si) or a name's last vowel.
  const UNITS_TR = ["", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz"];
  const TENS_TR = ["", "on", "yirmi", "otuz", "kırk", "elli", "altmış", "yetmiş", "seksen", "doksan"];
  const spokenTail = n => {
    n = Math.abs(Math.round(n));
    if (n === 0) return "sıfır";
    if (n % 10) return UNITS_TR[n % 10];
    if (n % 100) return TENS_TR[(n % 100) / 10];
    if (n % 1000) return "yüz";
    return n % 1e6 ? "bin" : "milyon";
  };
  const lastVowel = w => (String(w).toLowerCase().match(/[aıoueiöü](?=[^aıoueiöü]*$)/) || ["e"])[0];
  const hard = w => /[çfhkpsşt]$/i.test(String(w));
  const endsVowel = w => /[aıoueiöü]$/i.test(String(w));
  const four = v => ({ a: "ı", ı: "ı", o: "u", u: "u", e: "i", i: "i", ö: "ü", ü: "ü" })[v];
  const two = v => ("aıou".includes(v) ? "a" : "e");
  const SUF = {
    poss: w => (endsVowel(w) ? "s" : "") + four(lastVowel(w)),              // 'si, 'ı, 'u
    acc: w => (endsVowel(w) ? "y" : "") + four(lastVowel(w)),               // 'yi, 'ı
    loc: w => (hard(w) ? "t" : "d") + two(lastVowel(w)),                     // 'da, 'te
    abl: w => (hard(w) ? "t" : "d") + two(lastVowel(w)) + "n",               // 'dan, 'ten
  };
  const sufN = (n, kind) => "'" + SUF[kind](spokenTail(n));
  const sufW = (w, kind) => "'" + SUF[kind](w);
  // "62%" in English, "%62'si" in Turkish (or another suffix)
  const P = (p, kind = "poss") => (TR() ? `%${p}${kind ? sufN(p, kind) : ""}` : `${p}%`);
  const and = list => list.join(", ").replace(/, ([^,]*)$/, t(" and $1", " ve $1"));

  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const DAY_EN = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };
  const DAY_TR = { Mon: "Pazartesi", Tue: "Salı", Wed: "Çarşamba", Thu: "Perşembe", Fri: "Cuma", Sat: "Cumartesi", Sun: "Pazar" };
  const DAY_TR_SHORT = { Mon: "Pzt", Tue: "Sal", Wed: "Çar", Thu: "Per", Fri: "Cum", Sat: "Cmt", Sun: "Paz" };
  const day = d => (TR() ? DAY_TR : DAY_EN)[d];
  const MONTH_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const MONTH_TR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
  // "2026-05-21" → "May 21" / "21 Mayıs"; anything else passes through
  const date = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ""); if (!m) return s || ""; const mo = +m[2] - 1, d = +m[3]; return TR() ? `${d} ${MONTH_TR[mo]}` : `${MONTH_EN[mo]} ${d}`; };
  const hourOf = h => (TR() ? `${String(h).padStart(2, "0")}:00` : `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`);
  const clockOf = hhmm => { const [h, m] = hhmm.split(":").map(Number); return TR() ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}` : `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };

  const pct = x => Math.round(x * 100);
  const sum = a => a.reduce((s, x) => s + x, 0);
  const clamp01 = x => Math.max(0, Math.min(1, x));
  const num = n => Math.round(n).toLocaleString(TR() ? "tr-TR" : "en-US");
  const dec1 = x => { const s = x.toFixed(1).replace(/\.0$/, ""); return TR() ? s.replace(".", ",") : s; };

  /* ---------------------------------------------------------------- WHEN */
  // Time-of-day windows. Night wraps past midnight.
  const WINDOWS = [
    { key: "dawn",      hours: [4, 5, 6, 7, 8, 9] },
    { key: "midday",    hours: [10, 11, 12, 13, 14] },
    { key: "afternoon", hours: [15, 16, 17] },
    { key: "evening",   hours: [18, 19, 20, 21] },
    { key: "night",     hours: [22, 23, 0, 1, 2, 3] },
  ];
  const WIN_PERSONA = () => ({ dawn: t("early bird", "erkenci kuş"), midday: t("lunch-break athlete", "öğle arası sporcusu"), afternoon: t("afternoon athlete", "öğleden sonra sporcusu"), evening: t("evening athlete", "akşam sporcusu"), night: t("night owl", "gece kuşu") });
  const WHERE = () => ({ dawn: t("in the early morning", "sabahın erken saatlerinde"), midday: t("around midday", "öğle saatlerinde"), afternoon: t("in the afternoon", "öğleden sonra"), evening: t("in the evening", "akşam saatlerinde"), night: t("late at night", "gece geç saatlerde") });

  function when({ byHour, byWeekday }) {
    const trace = [];
    const total = sum(Object.values(byHour || {}));
    if (total < 20) return { id: "when", skip: true, reason: `Only ${total} activities; need 20 to see a pattern.` };

    const win = WINDOWS.map(w => ({ ...w, n: sum(w.hours.map(h => byHour[h] || 0)) }))
      .map(w => ({ ...w, share: w.n / total }))
      .sort((a, b) => b.share - a.share);
    const [top, second] = win, W = WHERE();
    const peakHour = +Object.entries(byHour).sort((a, b) => b[1] - a[1])[0][0];
    trace.push(`top window ${top.key} ${pct(top.share)}%, second ${second.key} ${pct(second.share)}%`);

    const wkTotal = sum(Object.values(byWeekday));
    const weekend = ((byWeekday.Sat || 0) + (byWeekday.Sun || 0)) / wkTotal;
    const favDay = DAYS.slice().sort((a, b) => (byWeekday[b] || 0) - (byWeekday[a] || 0))[0];
    trace.push(`weekend share ${pct(weekend)}%, favourite day ${favDay}`);

    let key, persona, headline, body, score;
    if (weekend >= 0.45) {
      key = "weekend"; persona = t("weekend warrior", "hafta sonu savaşçısı");
      headline = t("Weekdays are for work. Weekends are for you.", "Hafta içi işe, hafta sonu kendine.");
      body = t(`${P(pct(weekend))} of your activities happened on Saturday or Sunday.`, `Aktivitelerinin ${P(pct(weekend))} cumartesi ya da pazar günü yapıldı.`);
      score = 0.6 + (weekend - 0.45);
      trace.push("rule: weekend share ≥ 45% → weekend warrior");
    } else if (top.share >= 0.3 && second.share >= 0.3 && top.share - second.share <= 0.1) {
      key = "double"; persona = t("double shift", "çift mesai");
      const pair = [top.key, second.key].sort().join("+");
      headline = pair === "dawn+evening" ? t("Dawn and dusk. You work out on both ends of the day.", "Çift mesai. Günü antrenmanla açıp kapatıyorsun.")
               : t("You split your training between two shifts.", "Antrenmanlarını iki vardiyaya bölüyorsun.");
      body = t(`${P(pct(top.share))} of your workouts started ${W[top.key]}, ${P(pct(second.share))} ${W[second.key]}. Your single busiest hour was ${hourOf(peakHour)}.`,
               `Antrenmanlarının ${P(pct(top.share))} ${W[top.key]}, ${P(pct(second.share))} ${W[second.key]} başladı. En yoğun saatin ${hourOf(peakHour)}.`);
      score = 0.75;
      trace.push("rule: top two windows both ≥ 30% and within 10 pts → double shift");
    } else if (top.share < 0.35) {
      key = "anytime"; persona = t("anytime athlete", "her an sporcusu");
      headline = t("You train whenever life lets you.", "Hayat ne zaman izin verirse.");
      body = t(`No time slot claims more than ${P(pct(top.share))} of your workouts. Your busiest hour was ${hourOf(peakHour)}.`,
               `Hiçbir saat dilimi antrenmanlarının ${P(pct(top.share), "acc")} geçmedi. En yoğun saatin ${hourOf(peakHour)}.`);
      score = 0.35;
      trace.push("rule: top window < 35% → anytime");
    } else {
      key = top.key; persona = WIN_PERSONA()[top.key];
      headline = {
        dawn: t("You're an early bird.", "Sen bir erkencisin."),
        midday: t("Your lunch break is your training block.", "Öğle arası senin antrenman molan."),
        afternoon: t("You own the afternoon.", "Öğleden sonraları senden sorulur."),
        evening: t(`You're a ${hourOf(peakHour)} athlete.`, `Akşam ${hourOf(peakHour)} sporcususun.`),
        night: t("Night owl. The city sleeps, you train.", "Gece kuşu. Şehir uyurken sen ter döküyorsun."),
      }[top.key];
      body = t(`${P(pct(top.share))} of your workouts started ${W[top.key]}.`, `Antrenmanlarının ${P(pct(top.share))} ${W[top.key]} başladı.`);
      score = 0.4 + top.share * 0.6;
      trace.push(`rule: single dominant window (${pct(top.share)}% ≥ 35%) → ${top.key}`);
    }
    if (key !== "weekend") body += t(` Favourite day: ${day(favDay)}.`, ` Favori günün: ${day(favDay)}.`);
    return { id: "when", skip: false, score: clamp01(score), persona, headline, body,
      facts: [["peak hour", hourOf(peakHour)], ["top window", `${top.key} ${pct(top.share)}%`], ["weekend", `${pct(weekend)}%`]], trace };
  }

  /* --------------------------------------------------------- HR ZONE DNA */
  // zones: hours in Garmin HR zones 1..5 (time below zone 1 is ignored).
  function zones({ zoneHours }) {
    const trace = [];
    const [z1, z2, z3, z4, z5] = zoneHours || [0, 0, 0, 0, 0];
    const total = z1 + z2 + z3 + z4 + z5;
    if (total < 10) return { id: "zones", skip: true, reason: `Only ${total.toFixed(1)} h with heart rate; need 10 h.` };
    const easy = (z1 + z2) / total, mid = z3 / total, hardS = (z4 + z5) / total;
    trace.push(`easy ${pct(easy)}%, tempo ${pct(mid)}%, hard ${pct(hardS)}% of ${total.toFixed(0)} h`);

    let persona, headline, body, score;
    if (easy >= 0.7 && hardS >= 0.1) {
      persona = t("polarized", "polarize");
      headline = t("You train like a pro: mostly easy, sometimes very hard.", "Profesyoneller gibisin: genelde hafif, bazen çok sert.");
      body = t(`${P(pct(easy))} easy, ${P(pct(hardS))} hard, and little in between. That's the 80/20 pattern many endurance coaches recommend.`,
               `${P(pct(easy), null)} hafif, ${P(pct(hardS), null)} sert, arası pek yok. Birçok dayanıklılık antrenörünün önerdiği 80/20 düzeni bu.`);
      score = 0.85;
      trace.push("rule: easy ≥ 70% and hard ≥ 10% → polarized");
    } else if (hardS >= 0.3) {
      persona = t("intensity junkie", "yoğunluk tutkunu");
      headline = t("You like it hard.", "Sınırları zorlamayı seviyorsun.");
      body = t(`${P(pct(hardS))} of your time was in zones 4–5. Your easy days could be easier: most coaches aim for about 80% easy.`,
               `Sürenin ${P(pct(hardS))} 4–5. bölgelerde geçti. Hafif günlerin biraz daha hafif olabilir: çoğu antrenör yaklaşık %80 hafif tempoyu hedefler.`);
      score = 0.8;
      trace.push("rule: hard ≥ 30% → intensity junkie");
    } else if (mid >= 0.35) {
      persona = t("tempo lover", "tempo sever");
      headline = t("Comfortably hard is your comfort zone.", "Konfor alanın tatlı bir zorluk.");
      body = t(`${P(pct(mid))} of your time sat in zone 3. Splitting it into easier easy days and harder hard days is a classic next step.`,
               `Sürenin ${P(pct(mid))} 3. bölgede geçti. Antrenmanları daha hafif ve daha sert günlere bölmek klasik bir sonraki adım.`);
      score = 0.7;
      trace.push("rule: zone 3 ≥ 35% → tempo lover");
    } else if (easy >= 0.6) {
      persona = t("base builder", "temel inşacı");
      headline = t("You're building a big aerobic engine.", "Sağlam bir aerobik motor inşa ediyorsun.");
      body = t(`${P(pct(easy))} of your training was easy (zones 1–2). Many coaches aim for about 80%; you're ${80 - pct(easy)} points away.`,
               `Antrenmanlarının ${P(pct(easy))} hafifti (1–2. bölge). Birçok antrenör %80 civarını hedefler; sen ${80 - pct(easy)} puan uzaktasın.`);
      score = 0.6;
      trace.push("rule: easy ≥ 60% → base builder");
    } else {
      persona = t("all-rounder", "çok yönlü");
      headline = t("A bit of everything.", "Her şeyden biraz.");
      body = t(`Easy ${P(pct(easy))}, tempo ${P(pct(mid))}, hard ${P(pct(hardS))}. No single zone runs your training.`,
               `Hafif ${P(pct(easy), null)}, tempo ${P(pct(mid), null)}, sert ${P(pct(hardS), null)}. Antrenmanlarını tek bir bölge yönetmiyor.`);
      score = 0.4;
      trace.push("rule: no zone group dominates → all-rounder");
    }
    return { id: "zones", skip: false, score, persona, headline, body,
      facts: [["easy (Z1–2)", `${pct(easy)}%`], ["tempo (Z3)", `${pct(mid)}%`], ["hard (Z4–5)", `${pct(hardS)}%`]],
      shares: { easy, mid, hard: hardS }, trace };
  }

  /* ---------------------------------------------------------- STRESS DAY */
  // stressByWeekday: average Garmin stress level (0–100) per weekday; days: number of days measured.
  function stressDay({ stressByWeekday = {}, days = 0 }) {
    const trace = [];
    if (days < 28) return { id: "stress", skip: true, reason: `Only ${days} days of stress data; need 4 weeks.` };
    const entries = DAYS.map(d => [d, stressByWeekday[d]]).filter(e => e[1] != null);
    const sorted = entries.slice().sort((a, b) => b[1] - a[1]);
    const [peakDay, peak] = sorted[0], [calmDay, calm] = sorted.at(-1);
    const spread = peak - calm;
    const avg = sum(entries.map(e => e[1])) / entries.length;
    const lvl = avg <= 25 ? 0 : avg <= 50 ? 1 : avg <= 75 ? 2 : 3;
    const level = t(["resting", "low", "medium", "high"][lvl], ["dinlenme", "düşük", "orta", "yüksek"][lvl]);
    trace.push(`peak ${peakDay} ${peak.toFixed(1)}, calmest ${calmDay} ${calm.toFixed(1)}, spread ${spread.toFixed(1)}, avg ${avg.toFixed(1)} (lvl ${lvl})`);

    let persona, headline, score, steady = false;
    if (spread < 3) {
      steady = true; persona = t("steady", "istikrarlı");
      headline = t("Same stress, every day of the week.", "Haftanın her günü aynı stres.");
      score = 0.3;
      trace.push("rule: spread < 3 → steady");
    } else if (peakDay === "Mon") {
      persona = t("monday blues", "pazartesi sendromu");
      headline = t("Monday hits hardest.", "Pazartesi sendromu gerçek.");
      score = 0.55 + spread / 60;
      trace.push("rule: peak Mon → monday blues");
    } else if (peakDay === "Sat" || peakDay === "Sun") {
      persona = t("busy weekender", "yoğun hafta sonu");
      headline = t("Plot twist: your weekends are the stressful part.", "Ters köşe: senin için hafta sonları daha stresli.");
      score = 0.65 + spread / 60;
      trace.push("rule: peak Sat/Sun → busy weekender (surprising, ranks higher)");
    } else if (peakDay === "Fri") {
      persona = t("friday crunch", "cuma telaşı");
      headline = t("Fridays wind you up before they wind you down.", "Cuma günleri rahatlamadan önce seni iyice geriyor.");
      score = 0.5 + spread / 60;
      trace.push("rule: peak Fri → friday crunch");
    } else {
      persona = t("midweek pressure", "hafta ortası baskısı");
      headline = t(`${day(peakDay)} is your toughest day.`, `En zorlu günün ${day(peakDay).toLocaleLowerCase("tr")}.`);
      score = 0.45 + spread / 60;
      trace.push("rule: peak Tue–Thu → midweek pressure");
    }
    const lo = calm.toFixed(0), hi = peak.toFixed(0);
    const body = steady
      ? t(`Your average stress barely moved between days (${lo}–${hi}). Overall it sat in Garmin's ${level} range.`,
          `Ortalama stresin günden güne neredeyse hiç değişmedi (${lo}–${hi}). Genel olarak Garmin'in ${level} aralığındaydı.`)
      : t(`${day(peakDay)} averaged ${hi}, ${day(calmDay)} only ${lo}. Overall your stress sat in Garmin's ${level} range.`,
          `${day(peakDay)} ortalaması ${hi}, ${day(calmDay).toLocaleLowerCase("tr")} ise sadece ${lo}. Genel olarak stresin Garmin'in ${level} aralığındaydı.`);
    return { id: "stress", skip: false, score: clamp01(score), persona, headline, body,
      facts: [["most stressful", peakDay], ["calmest", calmDay], ["average", `${avg.toFixed(0)}`]],
      byDay: entries.map(([d, v]) => [TR() ? DAY_TR_SHORT[d] : d, v]), trace };
  }

  /* --------------------------------------------- comparison ladders (shared) */
  const times = r => (r >= 10 ? num(r) : dec1(r));
  // English: "94% of X" below 1, "just about X" near 1, "2.5× X" above.
  // Turkish: "X'in %94'ü", "neredeyse X kadar", "X'in 2,5 katı" (gen = "X'in", nom = "X").
  const of = (r, en, gen, nom) => TR()
    ? (r < 0.95 ? `${gen} ${P(Math.round(r * 100))}` : r <= 1.05 ? `neredeyse ${nom} kadar` : `${gen} ${times(r)} katı`)
    : (r < 0.95 ? `${Math.round(r * 100)}% of ${en}` : r <= 1.05 ? `just about ${en}` : `${times(r)}× ${en}`);
  const count = r => (r >= 10 ? num(r) : dec1(r));
  // Units: stats.units is "metric" (default) or "imperial". Data is always metric inside; only wording changes.
  const MI = 1.609344, FT = 0.3048, GAL = 3.785411784;
  const distance = (km, u) => (u === "imperial" ? `${num(km / MI)} mi` : `${num(km)} km`);
  const heightLong = (m, u) => (u === "imperial" ? `${num(m / FT)} ${t("feet", "fit")}` : `${num(m)} ${t("metres", "metre")}`);
  const heightShort = (m, u) => (u === "imperial" ? `${num(m / FT)} ft` : `${num(m)} m`);
  const volumeLong = (L, u) => (u === "imperial" ? `${num(L / GAL)} ${t("gallons", "galon")}` : `${num(L)} ${t("litres", "litre")}`);
  const volumeShort = (L, u) => (u === "imperial" ? `${num(L / GAL)} gal` : `${num(L)} L`);
  // Pick the first rung whose `upTo` is above the value; ratio is value / rung.size.
  const rung = (ladder, v) => ladder.find(r => v < r.upTo) || ladder.at(-1);
  const FAMILY_TR = { running: "koşu", swimming: "yüzme", cycling: "bisiklet", "walking & hiking": "yürüyüş ve doğa", strength: "kuvvet", "mind & body": "zihin ve beden", other: "diğer" };
  const family = f => (TR() ? FAMILY_TR[f] || f : f);

  /* --------------------------------------------------------------- STEPS */
  const DISTANCES = [
    { upTo: 120,      size: 42.195, name: "marathons",      say: r => t(`That's ${of(r, "a marathon")}, on foot.`, `Yürüyerek ${of(r, "", "bir maratonun", "bir maraton")}.`) },
    { upTo: 500,      size: 344,    name: "London → Paris", say: r => t(`That's ${of(r, "the distance from London to Paris")}.`, `Bu, ${of(r, "", "Londra–Paris mesafesinin", "Londra–Paris mesafesi")}.`) },
    { upTo: 1000,     size: 625,    name: "Lisbon → Madrid", say: r => t(`That's ${of(r, "the distance from Lisbon to Madrid")}.`, `Bu, ${of(r, "", "Lizbon–Madrid mesafesinin", "Lizbon–Madrid mesafesi")}.`) },
    { upTo: 2500,     size: 1200,   name: "the length of Italy", say: r => t(`That's ${of(r, "the length of Italy")}.`, `Bu, ${of(r, "", "İtalya'nın boyunun", "İtalya'nın boyu")}.`) },
    { upTo: Infinity, size: 2500,   name: "Paris → Moscow", say: r => t(`That's ${of(r, "the distance from Paris to Moscow")}.`, `Bu, ${of(r, "", "Paris–Moskova mesafesinin", "Paris–Moskova mesafesi")}.`) },
  ];
  // steps: { total, days, distanceKm?, bestDay: { date (ISO), steps } }.
  // distanceKm is Garmin's measured daily distance; without it we estimate 0.75 m per step.
  function steps({ steps: s, units }) {
    const trace = [];
    if (!s || s.days < 14) return { id: "steps", skip: true, reason: `Only ${s ? s.days : 0} days of step data; need 2 weeks.` };
    const avg = s.total / s.days, km = s.distanceKm ?? s.total * 0.00075, spike = s.bestDay.steps / avg;
    trace.push(s.distanceKm != null ? "distance: Garmin's measured daily distance" : "distance: estimated at 0.75 m per step");
    const r = rung(DISTANCES, km);
    trace.push(`avg ${Math.round(avg)}/day over ${s.days} days, ≈${Math.round(km)} km, best day ${spike.toFixed(1)}× avg`);
    trace.push(`ladder: ${Math.round(km)} km → ${r.name}`);

    let persona, headline, score;
    if (avg >= 12000)      { persona = t("step machine", "adım makinesi");        headline = t("You barely sat down this year.", "Bu yıl neredeyse hiç oturmadın.");         score = 0.7; }
    else if (avg >= 10000) { persona = t("10k club", "10 bin kulübü");             headline = t("You live in the 10,000-step club.", "10.000 adım kulübünün daimi üyesisin."); score = 0.6; }
    else if (avg >= 7000)  { persona = t("steady walker", "istikrarlı yürüyüşçü"); headline = t("Steady steps, every single day.", "Her gün, istikrarlı adımlar.");           score = 0.45; }
    else                   { persona = t("every step counts", "her adım sayılır"); headline = t("Every step added up.", "Her adımın hanene yazıldı.");                     score = 0.3; }
    trace.push(`rule: avg ${Math.round(avg)} → ${persona}`);
    let body = t(`${num(s.total)} steps, about ${distance(km, units)}. ${r.say(km / r.size)}`, `${num(s.total)} adım, yaklaşık ${distance(km, units)}. ${r.say(km / r.size)}`);
    if (spike >= 2.5) {
      body += t(` Your biggest day, ${date(s.bestDay.date)}, was ${dec1(spike)}× your average.`, ` En hareketli günün ${date(s.bestDay.date)}: ortalamanın ${dec1(spike)} katı.`);
      score += 0.1; trace.push("rule: best day ≥ 2.5× avg → mention spike, +0.1");
    }
    return { id: "steps", skip: false, score: clamp01(score), persona, headline, body,
      hero: [num(avg), t("steps a day on average", "günlük ortalama adım")],
      facts: [["total steps", num(s.total)], ["≈ distance", distance(km, units)], ["best day", num(s.bestDay.steps)]], trace };
  }

  /* --------------------------------------------------------------- SLEEP */
  // sleep: { nights, avgHours, avgScore, bedtime: "HH:MM", wake: "HH:MM" } (nights under 3 h already removed)
  function sleep({ sleep: s }) {
    const trace = [];
    if (!s || s.nights < 30) return { id: "sleep", skip: true, reason: `Only ${s ? s.nights : 0} nights of sleep data; need 30.` };
    const [bh, bm] = s.bedtime.split(":").map(Number);
    const bedMin = (bh < 12 ? bh + 24 : bh) * 60 + bm; // minutes after noon-based midnight, so 00:40 > 23:30
    const hrs = s.avgHours, H = Math.floor(hrs), M = String(Math.round(hrs % 1 * 60)).padStart(2, "0");
    const hm = t(`${H} h ${M} m`, `${H} sa ${M} dk`);
    const type = bedMin < 22 * 60 + 30 ? "early sleeper" : bedMin <= 24 * 60 ? "classic schedule" : "late sleeper";
    trace.push(`avg ${hrs.toFixed(2)} h, score ${s.avgScore}, bedtime ${s.bedtime} → ${type}, ${s.nights} nights`);

    let key, persona, headline, body, score;
    if (hrs >= 7.5) {
      key = "champion"; persona = t("sleep champion", "uyku şampiyonu"); headline = t("Sleep is your secret weapon.", "Uyku senin gizli silahın.");
      body = t(`${hm} a night on average. That's above the 7+ hours most adult sleep guidelines suggest.`, `Gecede ortalama ${hm}. Yetişkinler için önerilen 7+ saatin üzerindesin.`); score = 0.7;
    } else if (hrs >= 7) {
      key = "rested"; persona = t("well rested", "dinç"); headline = t("You gave your body the hours it asked for.", "Vücuduna istediği saatleri verdin.");
      body = t(`${hm} a night on average, right in the range most adult sleep guidelines suggest.`, `Gecede ortalama ${hm}, tam da uzmanların önerdiği aralıkta.`); score = 0.5;
    } else if (hrs >= 6) {
      key = "almost"; persona = t("almost there", "az kaldı"); headline = t(`In bed by ${clockOf(s.bedtime)}, up at ${clockOf(s.wake)}.`, `Yatış ${clockOf(s.bedtime)}, kalkış ${clockOf(s.wake)}.`);
      const more = Math.round((7 - hrs) * 60);
      body = t(`${hm} a night on average. Most guidelines suggest 7+ hours; ${more} more minutes a night would get you there.`, `Gecede ortalama ${hm}. Önerilen 7+ saate ulaşmak için gecede ${more} dakika daha yeter.`); score = 0.55;
    } else {
      key = "short"; persona = t("short sleeper", "kısa uyuyan"); headline = t("Your nights were on the short side.", "Gecelerin biraz kısa geçmiş.");
      body = t(`${hm} a night on average. Sleep is where training turns into fitness, so it's a cheap place to find gains.`, `Gecede ortalama ${hm}. Antrenman uykuda gelişime dönüşür; kazanç bulmanın en ucuz yolu burası.`); score = 0.5;
    }
    trace.push(`rule: avg hours ${hrs.toFixed(1)} → ${key}`);
    if (type === "late sleeper" && key !== "short") { body += t(" A true night owl: lights out after midnight.", " Gerçek bir gece kuşu: ışıklar gece yarısından sonra sönüyor."); score += 0.05; trace.push("rule: bedtime after 00:00 → add night-owl line"); }
    return { id: "sleep", skip: false, score: clamp01(score), persona, headline, body,
      hero: [hm, t("per night on average", "gecelik ortalama")],
      facts: [["bedtime", clockOf(s.bedtime)], ["wake-up", clockOf(s.wake)], ["sleep score", String(Math.round(s.avgScore))]], trace };
  }

  /* ---------------------------------------------------------------- BODY */
  // body: { days, rhr: [first, last], vo2: [first, last], fitnessAge: [first, last] } (any metric may be missing)
  // Only improvements and holds are shown. A recap is not the place to deliver bad news, so worse metrics are left out.
  const BODY_METRICS = [
    { key: "rhr",        en: "Resting heart rate", tr: "Dinlenik nabız", up: ["Your resting heart rate came down.", "Dinlenik nabzın düştü."], unit: "bpm", better: -1, min: 2,   fmt: v => String(Math.round(v)) },
    { key: "vo2",        en: "VO2 Max",            tr: "VO2 Max",        up: ["Your VO2 Max went up.", "VO2 Max değerin yükseldi."],          unit: "",    better: +1, min: 1,   fmt: v => String(Math.round(v)) },
    { key: "fitnessAge", en: "Fitness age",        tr: "Fitness yaşı",   up: ["Your fitness age came down.", "Fitness yaşın düştü."],         unit: "",    better: -1, min: 0.5, fmt: v => (TR() ? v.toFixed(1).replace(".", ",") : v.toFixed(1)) },
  ];
  function body({ body: b }) {
    const trace = [];
    if (!b || b.days < 60) return { id: "body", skip: true, reason: `Only ${b ? b.days : 0} days between first and last reading; need 60.` };
    const rows = BODY_METRICS.filter(m => Array.isArray(b[m.key])).map(m => {
      const [a, z] = b[m.key], d = (z - a) * m.better;
      const status = d >= m.min ? "improved" : d <= -m.min ? "worse" : "held";
      trace.push(`${m.key} ${a} → ${z}: ${status}`);
      return { ...m, label: t(m.en, m.tr), from: m.fmt(a), to: m.fmt(z), status };
    });
    const up = rows.filter(r => r.status === "improved"), held = rows.filter(r => r.status === "held");
    if (!up.length) {
      trace.push("rule: nothing improved → hide card by design");
      return { id: "body", skip: true, reason: "No metric improved, so the card stays out of the recap (by design).", trace };
    }
    let persona, headline, score;
    if (up.length === rows.length) {
      persona = t("upgraded", "seviye atladı"); score = 0.85;
      headline = up.some(r => r.key === "rhr") ? t("Your heart is working less for the same life.", "Kalbin aynı hayat için artık daha az çalışıyor.") : t("Every fitness marker moved the right way.", "Tüm fitness göstergelerin doğru yöne gitti.");
      trace.push("rule: all metrics improved → upgraded");
    } else {
      persona = t("on the way up", "yükselişte"); score = 0.6;
      headline = up.length === 1 ? t(...up[0].up) : t(`${up.length} of ${rows.length} fitness markers moved the right way.`, `${rows.length} fitness göstergesinden ${up.length} tanesi doğru yöne gitti.`);
      trace.push(`rule: ${up.length}/${rows.length} improved → on the way up (worse ones hidden)`);
    }
    const shown = [...up, ...held];
    // the before/after rows carry the numbers, so the sentence only frames them
    let text = up.length === rows.length
      ? t(`${rows.length === 2 ? "Both" : `All ${rows.length}`} markers moved the right way in ${b.days} days.`, `${b.days} günde göstergelerinin ${rows.length === 2 ? "ikisi de" : "hepsi"} doğru yöne gitti.`)
      : t(`${up.length} of ${rows.length} markers improved in ${b.days} days.`, `${b.days} günde ${rows.length} göstergeden ${up.length} tanesi iyileşti.`);
    if (held.length) text += t(` ${and(held.map(r => r.label))} held steady.`, ` ${and(held.map(r => r.label))} sabit kaldı.`);
    return { id: "body", skip: false, score, persona, headline, body: text,
      beforeAfter: shown.map(r => ({ label: r.label, from: r.from, to: r.to, unit: r.unit, status: r.status })),
      facts: [["improved", String(up.length)], ["held", String(held.length)], ["period", `${b.days} days`]], trace };
  }

  /* --------------------------------------------------------------- SWEAT */
  const SWEAT = [
    { upTo: 20,       size: 0.5,  name: "half-litre bottles",       say: r => t(`About ${num(r)} half-litre water bottles.`, `Yaklaşık ${num(r)} yarım litrelik su şişesi.`) },
    { upTo: 150,      size: 19,   name: "office water-cooler jugs", say: r => t(`About ${count(r)} office water-cooler jugs.`, `Yaklaşık ${count(r)} damacana.`) },
    { upTo: 600,      size: 150,  name: "bathtubs",                 say: r => t(`Enough to fill ${count(r)} bathtubs.`, `${count(r)} küveti doldurmaya yeter.`) },
    { upTo: Infinity, size: 1500, name: "hot tubs",                 say: r => t(`Enough to fill ${count(r)} hot tubs.`, `${count(r)} jakuziyi doldurmaya yeter.`) },
  ];
  // sweatLiters: sum of Garmin's per-activity sweat-loss estimates
  function sweat({ sweatLiters: L, units }) {
    const trace = [];
    if (!L || L < 2) return { id: "sweat", skip: true, reason: "Fewer than 2 litres of estimated sweat loss." };
    const r = rung(SWEAT, L);
    trace.push(`${L.toFixed(1)} L → ${r.name} (${(L / r.size).toFixed(2)}×)`);
    const score = clamp01(0.45 + Math.log10(L) / 6);
    trace.push(`rule: fun-fact card, score grows with log(litres) → ${score.toFixed(2)}`);
    return { id: "sweat", skip: false, score, persona: t("fun fact", "ilginç bilgi"), headline: t(`You sweated about ${volumeLong(L, units)}.`, `Yaklaşık ${volumeLong(L, units)} ter döktün.`),
      body: `${r.say(L / r.size)} ${t("Garmin estimates this from each workout's heart rate, duration and temperature.", "Garmin bunu her antrenmanın nabzından, süresinden ve sıcaklığından tahmin ediyor.")}`,
      hero: [volumeShort(L, units), t("of sweat, estimated", "ter, tahmini")],
      facts: [[units === "imperial" ? "gallons" : "litres", volumeShort(L, units)], ["≈", r.name], ["per workout", "estimated"]], trace };
  }

  /* --------------------------------------------------------------- CLIMB */
  // A ladder of famous heights; the card shows the last rung passed and the next one up.
  // trAcc: the Turkish object form ("… geride bıraktın"), tr: the plain name.
  const LADDER = [
    { name: "the Statue of Liberty", short: "Statue of Liberty", tr: "Özgürlük Anıtı", trAcc: "Özgürlük Anıtı'nı", h: 93 },
    { name: "the Eiffel Tower", short: "Eiffel Tower", tr: "Eyfel Kulesi", trAcc: "Eyfel Kulesi'ni", h: 330 },
    { name: "the Empire State Building", short: "Empire State", tr: "Empire State", trAcc: "Empire State'i", h: 443 },
    { name: "the Burj Khalifa", short: "Burj Khalifa", tr: "Burç Halife", trAcc: "Burç Halife'yi", h: 828 },
    { name: "Mont Blanc", short: "Mont Blanc", tr: "Mont Blanc", trAcc: "Mont Blanc'ı", h: 4807 },          // French survey, Oct 2026
    { name: "Kilimanjaro", short: "Kilimanjaro", tr: "Kilimanjaro", trAcc: "Kilimanjaro'yu", h: 5895 },
    { name: "Aconcagua", short: "Aconcagua", tr: "Aconcagua", trAcc: "Aconcagua'yı", h: 6961 },
    { name: "Mount Everest", short: "Everest", tr: "Everest", trAcc: "Everest'i", h: 8849 },
    { name: "a plane's cruising altitude", short: "Cruising altitude", tr: "Uçak seyir irtifası", trAcc: "uçakların seyir irtifasını", h: 11000 },
    { name: "the edge of space", short: "Edge of space", tr: "Uzayın sınırı", trAcc: "uzayın sınırını", h: 100000 },  // Kármán line
  ];
  // climbMeters: total floors climbed, in metres (Garmin's floorsAscendedInMeters)
  // climbSource "workouts" (CSV quick path) means elevation gained during activities, not floors
  function climb({ climbMeters: m, climbSource, units }) {
    const trace = [];
    if (!m || m < 100) return { id: "climb", skip: true, reason: "Less than 100 m climbed." };
    const passed = LADDER.filter(r => r.h <= m), last = passed.at(-1), next = LADDER[passed.length] || null;
    trace.push(`${Math.round(m)} m → passed ${last ? last.short : "nothing yet"}, next ${next ? next.short : "none"}`);
    const score = clamp01(0.45 + Math.log10(m) / 10);
    trace.push(`rule: ladder card, score grows with log(metres) → ${score.toFixed(2)}`);
    const workouts = climbSource === "workouts";
    const headline = last ? t(`You climbed higher than ${last.name}.`, `${last.trAcc.replace(/^./, c => c.toLocaleUpperCase("tr"))} geride bıraktın.`)
      : t(`You climbed ${heightLong(m, units)} ${workouts ? "on your workouts" : "of stairs and slopes"}.`, `${workouts ? "Antrenmanlarında" : "Merdiven ve yokuşlarda"} toplam ${heightLong(m, units)} tırmandın.`);
    let text = last ? t(`${heightLong(m, units)} ${workouts ? "on your workouts" : "of stairs and slopes"}. `, `${workouts ? "Antrenmanlarında" : "Merdiven ve yokuşlarda"} toplam ${heightLong(m, units)} tırmandın. `) : "";
    if (next && next.h === 100000) text += t(`Next stop: the edge of space, ${Math.round(m / 1000)}% of the way there.`, `Sıradaki durak: uzayın sınırı. Yolun ${P(Math.round(m / 1000))} tamam.`);
    else if (next) text += t(`Next stop: ${next.name}, ${heightShort(next.h - m, units)} to go.`, `Sıradaki durak: ${next.tr}, ${heightShort(next.h - m, units)} kaldı.`);
    else text += t("That's past the edge of space. Truly out of this world.", "Uzayın sınırını bile aştın. Gerçekten bu dünyanın dışındasın.");
    // rungs to draw: up to two below, the one passed, and the next
    const i = passed.length;
    const rungs = LADDER.slice(Math.max(0, i - 3), Math.min(LADDER.length, i + 1)).map(r => ({ name: t(r.short, r.tr), h: r.h, label: heightShort(r.h, units), done: r.h <= m }));
    const persona = m >= 8849 ? t("summit chaser", "zirve avcısı") : m >= 4807 ? t("mountaineer", "dağcı") : m >= 828 ? t("skyscraper climber", "gökdelen tırmanıcısı") : t("step by step", "adım adım");
    return { id: "climb", skip: false, score, persona, headline, body: text.trim(),
      ladder: { value: m, label: heightShort(m, units), you: t("You", "Sen"), rungs },
      facts: [["climbed", heightShort(m, units)], ["passed", last ? last.short : "—"], ["next", next ? next.short : "—"]], trace };
  }

  /* --------------------------------------------------------------- SWIM */
  const SWIMS = [
    { upTo: 10,       size: 2.4,  name: "Alcatraz → San Francisco", say: r => t(`That's ${of(r, "the swim from Alcatraz to San Francisco")}.`, `Bu, ${of(r, "", "Alcatraz'dan San Francisco'ya yüzmenin", "Alcatraz'dan San Francisco'ya yüzmek")}.`) },
    { upTo: 25,       size: 16,   name: "Strait of Gibraltar",      say: r => t(`That's ${of(r, "a swim across the Strait of Gibraltar")}.`, `Bu, ${of(r, "", "Cebelitarık Boğazı'nı yüzerek geçmenin", "Cebelitarık Boğazı'nı yüzerek geçmek")}.`) },
    { upTo: Infinity, size: 33.8, name: "English Channel",          say: r => t(`That's ${of(r, "a swim across the English Channel")}.`, `Bu, ${of(r, "", "Manş Denizi'ni yüzerek geçmenin", "Manş Denizi'ni yüzerek geçmek")}.`) },
  ];
  // swim: { swims, strokes, km, openKm }
  function swim({ swim: w, units }) {
    if (!w || w.strokes < 1000) return { id: "swim", skip: true, reason: "Fewer than 1,000 strokes recorded." };
    const r = rung(SWIMS, w.km), open = w.openKm / (w.km || 1);
    const persona = open >= 0.5 ? t("open-water swimmer", "açık su yüzücüsü") : open >= 0.2 ? t("pool-and-sea swimmer", "havuz ve deniz yüzücüsü") : t("lane regular", "kulvar müdavimi");
    return { id: "swim", skip: false, score: clamp01(0.5 + Math.log10(w.strokes) / 20), persona,
      headline: t(`Your arms pulled ${num(w.strokes)} strokes through the water.`, `Kollarınla suda ${num(w.strokes)} kulaç attın.`),
      body: t(`${distance(w.km, units)} over ${w.swims} swims. ${r.say(w.km / r.size)}`, `${w.swims} yüzmede toplam ${distance(w.km, units)}. ${r.say(w.km / r.size)}`),
      hero: [num(w.strokes), t("strokes", "kulaç")],
      facts: [["strokes", num(w.strokes)], ["distance", distance(w.km, units)], ["≈", r.name]],
      trace: [`${w.strokes} strokes, ${w.km.toFixed(1)} km (${Math.round(open * 100)}% open water) → ${r.name}`] };
  }

  /* ------------------------------------------------------------ STRENGTH */
  // Garmin's exercise names are English codes; they stay English in both languages.
  const moveName = s => { const x = String(s || "").toLowerCase().replace(/_/g, " ").replace(/\btrx\b/, "TRX").replace(/\bbulgarian\b/, "Bulgarian").replace(/\brussian\b/, "Russian").replace(/\bromanian\b/, "Romanian"); return x.charAt(0).toUpperCase() + x.slice(1); };
  const AREA_TR = { "legs & glutes": "bacak ve kalça", core: "core", chest: "göğüs", back: "sırt", shoulders: "omuzlar", arms: "kollar", "full body": "tüm vücut" };
  const area = a => (TR() ? AREA_TR[a] || a : a);
  // strength: { sessions, minutes, moves, sets, favourite, favouriteSets, areas: { area → sets } }
  function strength({ strength: g }) {
    if (!g) return { id: "strength", skip: true, reason: "Fewer than 5 strength sessions with logged sets." };
    const areas = Object.entries(g.areas).sort((a, b) => b[1] - a[1]);
    const [top, topSets] = areas[0], share = topSets / g.sets;
    const upper = ["chest", "back", "shoulders", "arms"].reduce((s, k) => s + (g.areas[k] || 0), 0) / g.sets;
    const persona = upper >= 0.5 ? t("upper-body builder", "üst vücut inşacısı") : top === "legs & glutes" && share >= 0.35 ? t("leg-day loyalist", "bacak günü sadığı")
      : top === "core" && share >= 0.35 ? t("core crusher", "core canavarı") : t("all-round lifter", "çok yönlü sporcu");
    const time = g.minutes >= 120 ? t(`${dec1(g.minutes / 60)} hours`, `${dec1(g.minutes / 60)} saat`) : t(`${num(g.minutes)} minutes`, `${num(g.minutes)} dakika`);
    return { id: "strength", skip: false, score: 0.55, persona,
      headline: g.favourite ? t(`Your go-to move: ${moveName(g.favourite).replace(/^./, c => c.toLowerCase())}.`, `Favori hareketin: ${moveName(g.favourite)}.`) : t(`${g.sessions} strength sessions.`, `${g.sessions} kuvvet seansı.`),
      // Garmin counts every exercise in a circuit as a "set", and reps are estimates, so the card talks in sessions, time and moves
      body: t(`${g.sessions} sessions, ${time} and ${g.moves} different moves. Most of the work went to your ${top}.`, `${g.sessions} seans, ${time} ve ${g.moves} farklı hareket. En çok çalışan bölge: ${area(top)}.`),
      rows: areas.slice(0, 4).map(([a, n]) => [area(a), P(Math.round(n / g.sets * 100), null), n / topSets]),
      facts: [["sessions", String(g.sessions)], ["moves", String(g.moves)], ["favourite", moveName(g.favourite)]],
      trace: [`${g.sessions} sessions, ${g.sets} sets; top area ${top} ${Math.round(share * 100)}%, upper body ${Math.round(upper * 100)}%`] };
  }

  /* ---------------------------------------------------------------- MIND */
  const KIND_TR = { yoga: "yoga", breathwork: "nefes egzersizi", meditation: "meditasyon" };
  // mind: { sessions, minutes, kinds: { yoga, breathwork, meditation }, slowestBreath, stressChange }
  function mind({ mind: m }) {
    if (!m) return { id: "mind", skip: true, reason: "Fewer than 3 yoga, breathwork or meditation sessions (30 min)." };
    const kinds = Object.entries(m.kinds).sort((a, b) => b[1] - a[1]);
    const persona = { yoga: t("yogi", "yogi"), breathwork: t("breath master", "nefes ustası"), meditation: t("calm seeker", "huzur arayan") }[kinds[0][0]];
    const slow = m.slowestBreath && m.slowestBreath <= 9 ? Math.round(m.slowestBreath) : null;
    const headline = slow ? t(`You slowed your breathing to ${slow} breaths a minute.`, `Nefesini dakikada ${slow} nefese kadar yavaşlattın.`)
      : t(`${num(m.minutes)} minutes just for your mind.`, `Zihnin için tam ${num(m.minutes)} dakika ayırdın.`);
    const names = kinds.map(([k]) => (TR() ? KIND_TR[k] : k));
    let text = t(`${m.sessions} sessions of ${and(names)}, ${num(m.minutes)} minutes in all.`, `${and(names).replace(/^./, c => c.toLocaleUpperCase("tr"))}: ${m.sessions} seans, toplam ${num(m.minutes)} dakika.`);
    if (slow) text += t(" A typical resting rate is 12 to 20.", " Dinlenirken olağan nefes hızı dakikada 12 ile 20 arasıdır.");
    if (m.stressChange != null && m.stressChange <= -2) text += t(` On average your stress dropped ${Math.round(-m.stressChange)} points by the end of a session.`, ` Seans sonunda stresin ortalama ${Math.round(-m.stressChange)} puan düştü.`);
    return { id: "mind", skip: false, score: slow ? 0.6 : 0.5, persona, headline, body: text,
      hero: [num(m.minutes), t("minutes of calm", "dakika huzur")],
      facts: [["sessions", String(m.sessions)], ["minutes", num(m.minutes)], ["slowest breath", slow ? `${slow}/min` : "—"]],
      trace: [`${m.sessions} sessions, ${Math.round(m.minutes)} min, slowest ${m.slowestBreath}, stress Δ ${m.stressChange}`] };
  }

  /* --------------------------------------------------------------- SHOES */
  // shoes: { list: [{ name, km, maxKm }] } — active pairs, lifetime distance
  function shoes({ shoes: sh, units }) {
    if (!sh) return { id: "shoes", skip: true, reason: "No shoes with 50 km or more in Garmin Connect gear." };
    const [a] = sh.list, share = a.maxKm ? a.km / a.maxKm : null;
    let text;
    if (share == null) text = t("Garmin adds every activity you log in them. Set a target distance in Gear and we'll tell you when they're due.", "Garmin onlarla kaydettiğin her aktiviteyi ekliyor. Gear bölümünden bir hedef mesafe belirlersen ne zaman değişmeleri gerektiğini söyleriz.");
    else if (share >= 0.85) text = t(`That's ${P(Math.round(share * 100))} of the ${distance(a.maxKm, units)} you set. Time to start looking for the next pair.`, `Belirlediğin ${distance(a.maxKm, units)} sınırının ${P(Math.round(share * 100))} doldu. Yeni bir çifte bakmaya başlama vakti.`);
    else text = t(`${distance(a.maxKm - a.km, units)} to go before the ${distance(a.maxKm, units)} you set.`, `Belirlediğin ${distance(a.maxKm, units)} sınırına ${distance(a.maxKm - a.km, units)} kaldı.`);
    const total = distance(sh.list.reduce((s, x) => s + x.km, 0), units);
    return { id: "shoes", skip: false, score: 0.5, persona: share != null && share >= 0.85 ? t("ready to retire", "emekliliğe hazır") : t("going strong", "hâlâ taş gibi"),
      headline: sh.list.length > 1 ? t(`Your shoes have ${total} in them.`, `Ayakkabılarınla ${total} yol yaptın.`) : t(`Your ${a.name} have ${distance(a.km, units)} in them.`, `${a.name} ayakkabınla ${distance(a.km, units)} yol yaptın.`),
      body: text, rows: sh.list.slice(0, 4).map(x => [x.name, x.maxKm ? `${distance(x.km, units)} / ${distance(x.maxKm, units)}` : distance(x.km, units), x.maxKm ? Math.min(1, x.km / x.maxKm) : 1]),
      facts: [["pair", a.name], ["distance", distance(a.km, units)], ["of limit", share == null ? "—" : `${Math.round(share * 100)}%`]],
      trace: [`${sh.list.length} pairs; top ${a.name} ${Math.round(a.km)} km of ${a.maxKm || "no limit"}`] };
  }

  /* ------------------------------------------------------------- WEATHER */
  const temp = (c, u) => (u === "imperial" ? `${Math.round(c * 9 / 5 + 32)} °F` : `${Math.round(c)} °C`);
  // weather: { workouts, hot: { c, date (ISO), sport }, cold: { c, date, sport } }
  function weather({ weather: w, units }) {
    if (!w || w.hot.c - w.cold.c < 8) return { id: "weather", skip: true, reason: "Fewer than 10 workouts with temperature, or under 8 °C between them." };
    const persona = w.hot.c >= 30 ? t("heat seeker", "sıcak sever") : w.cold.c <= 0 ? t("cold-proof", "soğuk geçirmez") : t("all-weather", "her havada");
    const hot = temp(w.hot.c, units), cold = temp(w.cold.c, units);
    const headline = w.hot.c >= 30 ? t(`You trained through ${hot} heat.`, `${hot} sıcakta antrenman yaptın.`) : w.cold.c <= 0 ? t(`You trained at ${cold}.`, `${cold} soğukta antrenman yaptın.`) : t(`From ${cold} to ${hot}, you kept going.`, `${cold} ile ${hot} arası: pes etmedin.`);
    return { id: "weather", skip: false, score: 0.4 + Math.min(0.25, (w.hot.c - w.cold.c) / 120), persona, headline,
      body: t(`Hottest: ${family(w.hot.sport)}, ${date(w.hot.date)}. Coldest: ${family(w.cold.sport)}, ${date(w.cold.date)}. Your watch measures this on your wrist, so it reads a little warm.`,
              `En sıcak: ${family(w.hot.sport)}, ${date(w.hot.date)}. En soğuk: ${family(w.cold.sport)}, ${date(w.cold.date)}. Saatin bunu bileğinden ölçtüğü için biraz sıcak gösterebilir.`),
      tiles: [[hot, `${t("hottest", "en sıcak")} · ${date(w.hot.date)}`], [cold, `${t("coldest", "en soğuk")} · ${date(w.cold.date)}`]],
      facts: [["hottest", hot], ["coldest", cold], ["workouts", String(w.workouts)]],
      trace: [`${w.workouts} workouts with temperature, ${w.cold.c}–${w.hot.c} °C`] };
  }

  /* ------------------------------------------------------------- RECORDS */
  const clockTime = sec => { const s = Math.round(sec), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}` : `${m}:${String(x).padStart(2, "0")}`; };
  function recordValue({ type, value }, units) {
    if (/^Best /.test(type)) return clockTime(value);
    if (/Pool Swim/.test(type)) return `${num(value)} m`;
    if (/Farthest|Longest/.test(type)) return distance(value / 1000, units);
    if (/Elevation/.test(type)) return heightShort(value, units);
    if (/Steps/.test(type)) return `${num(value)} ${t("steps", "adım")}`;
    return num(value);
  }
  const RECORD_TR = { "Farthest Run": "en uzun koşu", "Farthest Cycle": "en uzun sürüş", "Farthest Ride": "en uzun sürüş", "Longest Pool Swim": "en uzun havuz yüzmesi",
    "Max Elevation Gain": "en çok tırmanış", "Most Steps in a Day": "bir günde en çok adım", "Most Steps in a Week": "bir haftada en çok adım", "Most Steps in a Month": "bir ayda en çok adım" };
  const recordLabel = type => {
    const best = /^Best (\S+) (Run|Pool Swim|Ride|Cycle)$/.exec(type);
    if (best) {
      const d = best[1].replace(/^(\d+)(km|m)$/, "$1 $2").replace(/^1mile$/, t("1 mile", "1 mil"));
      return TR() ? `${d} ${best[2] === "Pool Swim" ? "yüzme" : best[2] === "Run" ? "koşu" : "sürüş"}` : `${best[1]} ${best[2] === "Pool Swim" ? "swim" : best[2] === "Run" ? "run" : "ride"}`;
    }
    if (TR()) return RECORD_TR[type] || type.toLowerCase();
    return type.replace(/^Most Steps in a /, "steps in a ").replace(/^Farthest /, "farthest ").replace(/^Longest /, "longest ").replace(/^Max /, "max ").toLowerCase();
  };
  // records: [{ type, value, date (ISO), current }] — set during the period, still standing. Private: left out of shares unless chosen.
  function records({ records: rs, units }) {
    if (!rs || !rs.length) return { id: "records", skip: true, reason: "No personal records set in this period." };
    const order = x => (/^Best/.test(x) ? 0 : /Farthest|Longest/.test(x) ? 1 : 2);
    const list = [...rs].sort((a, b) => order(a.type) - order(b.type));
    const newest = [...rs].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    return { id: "records", skip: false, private: true, score: clamp01(0.5 + rs.length / 40), persona: rs.length >= 5 ? t("record breaker", "rekor avcısı") : t("new bests", "yeni rekorlar"),
      headline: rs.length === 1 ? t("You set a new personal record.", "Yeni bir kişisel rekor kırdın.") : t(`You set ${rs.length} personal records that still stand.`, `${rs.length} kişisel rekor kırdın, hepsi hâlâ ayakta.`),
      body: t(`Your newest: ${recordLabel(newest.type)}, on ${date(newest.date)}.`, `En yenisi: ${recordLabel(newest.type)}, ${date(newest.date)}.`),
      tiles: list.slice(0, 4).map(r => [recordValue(r, units), recordLabel(r.type)]),
      facts: [["records", String(rs.length)]], trace: [rs.map(r => `${r.type}=${r.value}@${r.date}`).join(", ")] };
  }

  /* -------------------------------------------------------------- PLACES */
  let regionNames = {};
  const country = (cc, fallback) => {
    if (!cc) return fallback || "";
    try { regionNames[LANG] ||= new Intl.DisplayNames([LANG], { type: "region" }); return regionNames[LANG].of(cc) || fallback || cc; } catch { return fallback || cc; }
  };
  // places: { list: [{ name, cc?, country?, count }], countries } — cities from start coordinates
  // (countries is null when only Garmin's place names were available). Private: left out of shares unless chosen.
  function places({ places: pl }) {
    if (!pl || pl.list.length < 2) return { id: "places", skip: true, reason: "Workouts started in fewer than 2 cities." };
    const total = pl.list.reduce((s, x) => s + x.count, 0), [top] = pl.list, share = top.count / total;
    const others = pl.list.slice(1, 4).map(x => x.name), nc = pl.countries || 0, cities = pl.countries != null;
    const n = pl.list.length;
    return { id: "places", skip: false, private: true, score: 0.4 + Math.min(0.25, n / 40 + nc / 20),
      persona: nc >= 3 || n >= 5 ? t("explorer", "kâşif") : share >= 0.8 ? t("home turf", "kendi sahası") : t("on the move", "yollarda"),
      headline: nc >= 2 ? t(`You trained in ${n} cities across ${nc} countries.`, `${nc} ülkede ${n} şehirde antrenman yaptın.`)
        : t(`You trained in ${n} ${cities ? "cities" : "places"}.`, `${n} ${cities ? "şehirde" : "farklı yerde"} antrenman yaptın.`),
      body: t(`${P(Math.round(share * 100))} of your workouts with GPS started in ${top.name}, with stops in ${and(others)}.`,
              `GPS'li antrenmanlarının ${P(Math.round(share * 100))} ${top.name}${sufW(top.name, "loc")} başladı. Diğer duraklar: ${and(others)}.`),
      rows: pl.list.slice(0, 4).map(x => [nc >= 2 && (x.cc || x.country) ? `${x.name}, ${country(x.cc, x.country)}` : x.name, `${x.count}×`, x.count / top.count]),
      facts: [["places", String(n)], ["countries", nc ? String(nc) : "—"], ["home", top.name]], trace: [pl.list.map(x => `${x.name} ${x.cc || ""} ${x.count}`).join(", ")] };
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
    if (spm >= 178) persona = t("quick feet", "hızlı adımlar");
    else if (spm >= 168) persona = t("smooth strider", "akıcı adımlar");
    else if (spm >= 158) persona = t("steady strider", "istikrarlı adımlar");
    else persona = t("long strider", "uzun adımlar");
    trace.push(`rule: ${spm} spm → ${persona}`);
    let text = diff <= 2
      ? t(`You run at ${spm} steps a minute and ${song.artist}'s track plays at ${song.bpm} BPM, so every step lands on the beat.`,
          `Dakikada ${spm} adım atıyorsun; ${song.artist} şarkısı da ${song.bpm} BPM. Her adımın tam ritme oturuyor.`)
      : t(`You run at ${spm} steps a minute and ${song.artist}'s track plays at ${song.bpm} BPM. Queue it up and you'll run in step.`,
          `Dakikada ${spm} adım atıyorsun; ${song.artist} şarkısı ${song.bpm} BPM. Listene ekle, adımların müzikle senkron olsun.`);
    const gain = Math.round(c.last - c.first);
    if (gain >= 3) { text += t(` You're ${gain} steps a minute quicker than in your first runs.`, ` İlk koşularına göre dakikada ${gain} adım daha hızlısın.`); score += 0.1; trace.push(`rule: +${gain} spm since first runs → mention, +0.1`); }
    return { id: "cadence", skip: false, score, persona,
      headline: diff <= 2 ? t(`"${song.title}" is your perfect running song.`, `"${song.title}" senin için mükemmel koşu şarkısı.`) : t(`"${song.title}" is right in your stride.`, `"${song.title}" tam senin adım ritminde.`),
      body: text, hero: [String(spm), t("steps per minute", "adım / dakika")], song,
      facts: [["cadence", `${spm} spm`], ["song", `${song.title} · ${song.bpm} BPM`], ["runs", String(c.runs)]], trace };
  }

  /* --------------------------------------------------------------- POWER */
  // Work done = average watts × seconds. 1 kWh = 3,600 kJ.
  const ENERGY = [
    { upTo: 1.5,      size: 0.015, name: "phone charges", say: r => t(`That's enough to fully charge a phone about ${count(r)} times.`, `Bu, bir telefonu yaklaşık ${count(r)} kez tam şarj etmeye yeter.`) },
    { upTo: 20,       size: 0.15,  name: "kettles",       say: r => t(`That's enough to boil about ${count(r)} full kettles.`, `Bu, yaklaşık ${count(r)} dolu su ısıtıcısını kaynatmaya yeter.`) },
    { upTo: Infinity, size: 0.16,  name: "EV km",         say: (r, u) => t(`That's enough to drive an electric car about ${distance(r, u)}.`, `Bu enerjiyle elektrikli bir otomobil yaklaşık ${distance(r, u)} gider.`) },
  ];
  // power: { sport: "cycling" | "running", sessions, kJ, avgW, bestNP, maxW, rpm }
  function power({ power: p, units }) {
    const trace = [];
    if (!p) return { id: "power", skip: true, reason: "No power data (needs 3 rides or 5 runs with a power meter)." };
    const kWh = p.kJ / 3600, r = rung(ENERGY, kWh), bike = p.sport === "cycling";
    trace.push(`${p.sport}: ${p.sessions} sessions, ${Math.round(p.kJ)} kJ (${kWh.toFixed(2)} kWh) → ${r.name}; avg ${Math.round(p.avgW)} W, best NP ${p.bestNP}, peak ${p.maxW}`);
    let persona, score;
    if (!bike) { persona = t("power runner", "güçlü koşucu"); score = 0.45; }
    else if (p.avgW >= 220) { persona = t("watt machine", "watt makinesi"); score = 0.65; }
    else if (p.avgW >= 160) { persona = t("diesel engine", "dizel motor"); score = 0.6; }
    else { persona = t("power builder", "güç inşacısı"); score = 0.55; }
    trace.push(`rule: ${p.sport}, avg ${Math.round(p.avgW)} W → ${persona}`);
    const text = r.say(kWh / r.size, units) + (bike ? t(" On a bike, every kilojoule of work burns about one calorie.", " Bisiklette harcanan her kilojoule yaklaşık bir kalori yakar.")
      : t(" Garmin measures this from your running power, run by run.", " Garmin bunu her koşudaki güç verinden ölçüyor."));
    const tiles = [[`${num(p.avgW)} W`, bike ? t("average per ride", "sürüş başına ortalama") : t("average per run", "koşu başına ortalama")]];
    if (p.bestNP) tiles.push([`${num(p.bestNP)} W`, t("best normalized power", "en iyi normalize güç")]);
    if (p.maxW) tiles.push([`${num(p.maxW)} W`, t("peak", "zirve")]);
    if (bike && p.rpm) tiles.push([`${num(p.rpm)} rpm`, t("pedal cadence", "pedal kadansı")]);
    else tiles.push([num(p.sessions), bike ? t("rides with power", "güç ölçerli sürüş") : t("runs with power", "güç verili koşu")]);
    return { id: "power", skip: false, score, persona,
      headline: bike ? t(`You put ${num(p.kJ)} kJ into the pedals.`, `Pedallara ${num(p.kJ)} kJ güç aktardın.`) : t(`You put ${num(p.kJ)} kJ of power into your runs.`, `Koşularına ${num(p.kJ)} kJ güç aktardın.`),
      body: text, tiles, facts: [["work", `${Math.round(p.kJ)} kJ`], ["average", `${Math.round(p.avgW)} W`], ["≈", r.name]], trace };
  }

  /* --------------------------------------------------------------- DECK */
  const CARDS = { when, zones, stressDay, cadence, power, swim, strength, mind, steps, sleep, body, sweat, climb, shoes, weather, records, places };
  const L = Object.fromEntries(Object.entries(CARDS).map(([k, f]) => [k, inLang(f)]));
  const deck = inLang(stats => {
    const cards = Object.values(CARDS).map(f => f(stats));
    return {
      shown: cards.filter(c => !c.skip).sort((a, b) => b.score - a.score),
      skipped: cards.filter(c => c.skip),
    };
  });
  // Turkish suffix helper for the app ("2026" → "'dan", "Antalya" → "'da")
  const suffix = (x, kind) => (typeof x === "number" ? sufN(x, kind) : sufW(x, kind));

  const api = { ...L, deck, LADDER, DAYS, SONGS, songsFor, suffix,
    distance: (km, u, lang) => inLang(() => distance(km, u))({ lang }),
    heightShort: (m, u, lang) => inLang(() => heightShort(m, u))({ lang }),
    number: (n, lang) => inLang(() => num(n))({ lang }),
    date: (iso, lang) => inLang(() => date(iso))({ lang }),
    family: (f, lang) => inLang(() => family(f))({ lang }) };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Insights = api;
})(typeof window !== "undefined" ? window : globalThis);
