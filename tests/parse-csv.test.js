// Run with: node --test tests/*.test.js
// Synthetic rows in Garmin's real "Export CSV" column layout; no user data.
const test = require("node:test");
const assert = require("node:assert/strict");
const PC = require("../src/parse-csv.js");
const I = require("../src/insights.js");

const HEAD = "Activity Type,Date,Favorite,Title,Distance,Calories,Time,Avg HR,Max HR,Aerobic TE,Total Ascent,Total Descent,Steps,Body Battery Drain";
const row = (type, date, dist, time, ascent) => `${type},${date},false,"A ""quoted"", title","${dist}","1,000","${time}","140","160","3.0","${ascent}","--","7,574","'-13"`;

function csv(n = 24) {
  const lines = [HEAD];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10);
    lines.push(i % 3 === 0 ? row("Pool Swim", `${d} 19:05:00`, "3,300", "01:28:25", "--")
      : row("Running", `${d} 06:30:54`, "6.93", "00:45:32", "20"));
  }
  return "﻿" + lines.join("\r\n") + "\r\n";
}

test("quoted fields, BOM, CRLF, thousands separators and '-negatives parse", () => {
  const [head, first] = PC.parseCsv(csv(1));
  assert.equal(head[0], "Activity Type");
  assert.equal(first[3], 'A "quoted", title');
  assert.equal(first[4], "3,300");
});

test("swim distance in metres becomes km; runs stay km", () => {
  const s = PC.computeStatsFromCsv(csv());
  assert.equal(s.totals.families.swimming.count, 8);
  assert.equal(+s.totals.families.swimming.km.toFixed(2), 26.4);
  assert.equal(+s.totals.families.running.km.toFixed(2), +(16 * 6.93).toFixed(2));
  assert.equal(s.climbMeters, 16 * 20);
});

test("times come from the local Date column", () => {
  const s = PC.computeStatsFromCsv(csv());
  assert.deepEqual(s.byHour, { 6: 16, 19: 8 });
  assert.equal(s.period.range, "Oct 1 → Oct 24, 2026");
  assert.equal(s.totals.longestStreak, 24);
});

test("a CSV of 20 rows or fewer is flagged as probably cut off", () => {
  assert.equal(PC.computeStatsFromCsv(csv(20)).truncated, true);
  assert.equal(PC.computeStatsFromCsv(csv(24)).truncated, false);
});

test("the quick deck only shows activity cards and words climbing as workouts", () => {
  const d = I.deck(PC.computeStatsFromCsv(csv()));
  assert.deepEqual(d.shown.map(c => c.id).sort(), ["climb", "when"]);
  assert.match(d.shown.find(c => c.id === "climb").headline, /on your workouts/);
});

test("other CSVs are rejected with a clear message", () => {
  assert.equal(PC.isGarminCsv("name,amount\nrent,100"), false);
  assert.throws(() => PC.computeStatsFromCsv("name,amount\nrent,100"), /Export CSV/);
});

test("imperial CSVs convert miles, swim yards and feet", () => {
  const s = PC.computeStatsFromCsv(csv(), { units: "imperial" });
  assert.equal(s.units, "imperial");
  assert.equal(+s.totals.families.running.km.toFixed(1), +(16 * 6.93 * 1.609344).toFixed(1));
  assert.equal(+s.totals.families.swimming.km.toFixed(2), +(8 * 3.3 * 0.9144).toFixed(2));
  assert.equal(Math.round(s.climbMeters), Math.round(16 * 20 * 0.3048));
});

test("cards speak the user's units; data stays metric inside", () => {
  const m = PC.computeStatsFromCsv(csv(), { units: "metric" });
  const i = PC.computeStatsFromCsv(csv(), { units: "imperial" });
  assert.match(I.climb(m).headline, /metres/);
  assert.match(I.climb({ ...i, climbMeters: 1000 }).headline, /3,281 feet/);
  assert.match(I.sweat({ sweatLiters: 56.8, units: "imperial" }).headline, /15 gallons/);
  assert.equal(I.distance(1523, "imperial"), "946 mi");
});
