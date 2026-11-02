// Run with: node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const I = require("../src/insights.js");
const PROFILES = require("../src/profiles.js");
const P = Object.fromEntries(PROFILES.map(p => [p.id, p]));
const persona = (id, card) => I.deck(P[id]).shown.find(c => c.id === card)?.persona;

test("each profile lands on its intended persona", () => {
  const expected = {
    duathlete: { when: "double shift", zones: "base builder", stress: "busy weekender" },
    cyclist: { when: "early bird", zones: "polarized", stress: "monday blues" },
    lifter: { when: "night owl", zones: "intensity junkie", stress: "steady" },
    hiker: { when: "weekend warrior", zones: "tempo lover", stress: "midweek pressure" },
  };
  for (const [id, cards] of Object.entries(expected))
    for (const [card, want] of Object.entries(cards))
      assert.equal(persona(id, card), want, `${id}/${card}`);
});

test("cards without enough data are skipped with a reason", () => {
  const d = I.deck(P.newbie);
  for (const c of d.skipped) assert.ok(c.reason.length > 10, c.id);
});

test("deck is ordered by interest score", () => {
  for (const p of PROFILES) {
    const s = I.deck(p).shown.map(c => c.score);
    assert.deepEqual(s, [...s].sort((a, b) => b - a), p.id);
  }
});

test("scores stay between 0 and 1 and every shown card has a trace", () => {
  for (const p of PROFILES)
    for (const c of I.deck(p).shown) {
      assert.ok(c.score >= 0 && c.score <= 1, `${p.id}/${c.id} score ${c.score}`);
      assert.ok(c.trace.some(t => t.startsWith("rule:")), `${p.id}/${c.id} trace`);
    }
});

test("an even training week with no dominant slot becomes 'anytime athlete'", () => {
  // dawn, midday and night each get 25%, so no window dominates and no two stand out
  const byHour = Object.fromEntries([5, 8, 11, 13, 16, 19, 22, 1].map(h => [h, 5]));
  const c = I.when({ byHour, byWeekday: { Mon: 5, Tue: 5, Wed: 5, Thu: 5, Fri: 4, Sat: 3, Sun: 3 } });
  assert.equal(c.persona, "anytime athlete");
});

test("new cards land on their intended personas", () => {
  const expected = {
    duathlete: { steps: "10k club", sleep: "almost there", body: "upgraded" },
    cyclist: { steps: "steady walker", sleep: "sleep champion", body: "upgraded" },
    lifter: { steps: "every step counts", sleep: "short sleeper" },
    hiker: { steps: "step machine", sleep: "well rested", body: "on the way up" },
  };
  for (const [id, cards] of Object.entries(expected))
    for (const [card, want] of Object.entries(cards))
      assert.equal(persona(id, card), want, `${id}/${card}`);
});

test("body card is hidden when nothing improved, and never shows a worse metric", () => {
  const d = I.deck(P.lifter);
  assert.ok(d.skipped.some(c => c.id === "body" && /by design/.test(c.reason)));
  for (const p of PROFILES) {
    const b = I.deck(p).shown.find(c => c.id === "body");
    if (b) assert.ok(b.beforeAfter.every(r => r.status !== "worse"), p.id);
  }
});

test("comparison ladders read naturally", () => {
  assert.match(I.climb({ climbMeters: 5446 }).headline, /higher than Mont Blanc/);
  assert.match(I.climb({ climbMeters: 5446 }).body, /Next stop: Kilimanjaro, 449 m to go/);
  assert.match(I.climb({ climbMeters: 2100 }).headline, /higher than the Burj Khalifa/);
  assert.match(I.climb({ climbMeters: 30000 }).body, /edge of space, 30% of the way there/);
  assert.match(I.climb({ climbMeters: 120000 }).body, /past the edge of space/);
  assert.match(I.climb({ climbMeters: 60 }).reason, /100 m/);
  assert.match(I.steps({ steps: { total: 1508000, days: 290, bestDay: { date: "x", steps: 1 } } }).body, /94% of the length of Italy/);
  assert.match(I.sweat({ sweatLiters: 56.8 }).body, /About 3 office water-cooler jugs/);
  assert.match(I.sweat({ sweatLiters: 310 }).body, /2\.1 bathtubs/);
});

test("brand-new watch only gets the cards it has data for", () => {
  const d = I.deck(P.newbie);
  assert.deepEqual(d.shown.map(c => c.id), ["steps"]);
  assert.equal(d.skipped.length, 16);   // every other card waits for its data
});

/* ---- cadence + power ---- */
{
  const I2 = require("../src/insights.js");
  const test2 = require("node:test"), assert2 = require("node:assert");
  test2("cadence picks one of the three nearest songs, deterministically with a seeded random", () => {
    const c = { runs: 20, spm: 171.4, first: 165, last: 174 };
    const near = I2.songsFor(171).map(s => s.title);
    for (const r of [0, 0.5, 0.99]) {
      const card = I2.cadence({ cadence: c, random: () => r });
      assert2.ok(near.includes(card.song.title));
      assert2.match(card.body, /171 steps a minute/); assert2.ok(card.headline.includes(card.song.title));
      assert2.match(card.body, /quicker than in your first runs/);
    }
    assert2.equal(I2.cadence({ cadence: c, random: () => 0 }).song.title, I2.cadence({ cadence: c, random: () => 0 }).song.title);
    assert2.equal(I2.cadence({ cadence: { runs: 3, spm: 170, first: 170, last: 170 } }).skip, true);
  });
  test2("every cadence from 140 to 200 has three songs at exactly that BPM", () => {
    for (let spm = 140; spm <= 200; spm++) for (const s of I2.songsFor(spm)) assert2.equal(s.bpm, spm, `${spm} → ${s.title} ${s.bpm}`);
  });
  test2("power card: bike work, ladders and personas", () => {
    const ride = I2.power({ power: { sport: "cycling", sessions: 40, kJ: 72000, avgW: 230, bestNP: 280, maxW: 900, rpm: 88 }, units: "metric" });
    assert2.equal(ride.persona, "watt machine");
    assert2.match(ride.headline, /72,000 kJ into the pedals/);
    assert2.match(ride.body, /electric car about 125 km/);   // 20 kWh / 0.16
    assert2.equal(ride.tiles.at(-1)[1], "pedal cadence");
    const small = I2.power({ power: { sport: "cycling", sessions: 3, kJ: 1800, avgW: 120, bestNP: null, maxW: null, rpm: null } });
    assert2.match(small.body, /charge a phone about 33 times/);
    const run = I2.power({ power: { sport: "running", sessions: 30, kJ: 30000, avgW: 330, bestNP: 360, maxW: 600, rpm: null } });
    assert2.equal(run.persona, "power runner");
    assert2.match(run.body, /kettles/);
    assert2.equal(I2.power({}).skip, true);
  });
  test2("motion(): cadence from runs, cycling power preferred over running power", () => {
    const { motion } = require("../src/parse-export.js");
    const runs = Array.from({ length: 6 }, (_, i) => ({ fam: "running", secs: 1800, spm: 160 + i, avgW: 300, np: 310, maxW: 450 }));
    const rides = Array.from({ length: 3 }, () => ({ fam: "cycling", secs: 3600, avgW: 200, np: 220, maxW: 700, rpm: 90 }));
    const m = motion([...runs, ...rides]);
    assert2.equal(m.cadence.runs, 6); assert2.equal(Math.round(m.cadence.spm * 10), 1625);
    assert2.equal(m.power.sport, "cycling"); assert2.equal(m.power.kJ, 2160); assert2.equal(m.power.rpm, 90);
    assert2.equal(motion(runs).power.sport, "running");
    assert2.equal(motion(runs.slice(0, 4)).cadence, null);
  });
}

{
  const I3 = require("../src/insights.js"), t3 = require("node:test"), a3 = require("node:assert");
  t3("new cards read naturally and stay private where they should", () => {
    a3.match(I3.swim({ swim: { swims: 10, strokes: 20000, km: 40, openKm: 30 } }).body, /1\.2× a swim across the English Channel/);
    a3.equal(I3.swim({ swim: { swims: 10, strokes: 20000, km: 40, openKm: 30 } }).persona, "open-water swimmer");
    a3.match(I3.swim({ swim: { swims: 4, strokes: 3000, km: 1.2, openKm: 0 } }).body, /50% of the swim from Alcatraz/);
    const st = I3.strength({ strength: { sessions: 6, minutes: 250, moves: 14, sets: 60, reps: 600, favourite: "DUMBBELL_BULGARIAN_SPLIT_SQUAT", favouriteSets: 20, areas: { "legs & glutes": 40, core: 20 } } });
    a3.match(st.headline, /dumbbell Bulgarian split squat/); a3.match(st.body, /6 sessions, 4\.2 hours and 14 different moves/);
    a3.doesNotMatch(st.body, /reps|sets/); a3.deepEqual(st.rows.map(r => r[1]), ["67%", "33%"]);
    const m = I3.mind({ mind: { sessions: 5, minutes: 120, kinds: { breathwork: 4, yoga: 1 }, slowestBreath: 5.8, stressChange: -4 } });
    a3.match(m.headline, /6 breaths a minute/); a3.match(m.body, /dropped 4 points/); a3.equal(m.persona, "breath master");
    a3.match(I3.shoes({ shoes: { list: [{ name: "Pegasus", km: 600, maxKm: 650 }] } }).body, /Time to start looking/);
    a3.match(I3.shoes({ shoes: { list: [{ name: "Pegasus", km: 300, maxKm: null }] } }).body, /Set a target distance/);
    a3.match(I3.weather({ weather: { workouts: 30, hot: { c: 35, date: "Jul 2", sport: "running" }, cold: { c: -4, date: "Jan 9", sport: "cycling" } }, units: "imperial" }).headline, /95 °F/);
    a3.equal(I3.weather({ weather: { workouts: 30, hot: { c: 24, date: "Jul 2", sport: "running" }, cold: { c: 20, date: "Jan 9", sport: "cycling" } } }).skip, true);
    const r = I3.records({ records: [{ type: "Best 5km Run", value: 1642, date: "2026-09-20" }, { type: "Farthest Run", value: 21300, date: "2026-10-04" }] });
    a3.equal(r.private, true); a3.deepEqual(r.tiles, [["27:22", "5km run"], ["21 km", "farthest run"]]); a3.match(r.body, /Oct 4/);
    a3.equal(I3.places({ places: { list: [{ name: "Lisbon", count: 9 }, { name: "Porto", count: 1 }] } }).private, true);
    const pl = I3.places({ places: { countries: 3, list: [{ name: "Antalya", country: "Türkiye", count: 70 }, { name: "Seoul", country: "South Korea", count: 4 }, { name: "Amsterdam", country: "Netherlands", count: 1 }] } });
    a3.match(pl.headline, /3 cities across 3 countries/); a3.equal(pl.rows[1][0], "Seoul, South Korea");
  });
}
