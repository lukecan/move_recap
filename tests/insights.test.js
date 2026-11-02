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
  assert.match(I.climb({ climbMeters: 5446 }).body, /62% of the way up Mount Everest/);
  assert.match(I.climb({ climbMeters: 2100 }).body, /2\.5× the height of the Burj Khalifa/);
  assert.match(I.steps({ steps: { total: 1508000, days: 290, bestDay: { date: "x", steps: 1 } } }).body, /94% of the length of Italy/);
  assert.match(I.sweat({ sweatLiters: 56.8 }).body, /About 3 office water-cooler jugs/);
  assert.match(I.sweat({ sweatLiters: 310 }).body, /2\.1 bathtubs/);
});

test("brand-new watch only gets the cards it has data for", () => {
  const d = I.deck(P.newbie);
  assert.deepEqual(d.shown.map(c => c.id), ["steps"]);
  assert.equal(d.skipped.length, 9);   // incl. cadence + power
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
  test2("every cadence from 140 to 190 has three songs within 12 BPM", () => {
    for (let spm = 140; spm <= 190; spm++) for (const s of I2.songsFor(spm)) assert2.ok(Math.abs(s.bpm - spm) <= 12, `${spm} → ${s.title} ${s.bpm}`);
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
