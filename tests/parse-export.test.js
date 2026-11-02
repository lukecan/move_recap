// Run with: node --test tests/*.test.js
// Uses a tiny synthetic export; no real user data lives in this repo.
const test = require("node:test");
const assert = require("node:assert/strict");
const PE = require("../src/parse-export.js");

const DAY = 864e5;
const at = (iso, hour) => Date.parse(`${iso}T${String(hour).padStart(2, "0")}:00:00Z`);
const isoAdd = (iso, n) => new Date(Date.parse(iso) + n * DAY).toISOString().slice(0, 10);

function fixture({ start = "2026-04-20", days = 40, extraOldDay = null } = {}) {
  const acts = [], uds = [], sleep = [];
  for (let i = 0; i < days; i++) {
    const d = isoAdd(start, i);
    acts.push({ activityId: i, activityType: i % 2 ? "lap_swimming" : "running", startTimeLocal: at(d, i % 2 ? 7 : 20),
      duration: 3.6e6, distance: 5e5, waterEstimated: 500, hrTimeInZone_1: 6e5, hrTimeInZone_2: 1.2e6, hrTimeInZone_3: 6e5, hrTimeInZone_4: 0, hrTimeInZone_5: 0,
      vO2MaxValue: 40 + Math.floor(i / 10) });
    uds.push({ calendarDate: d, totalSteps: 10000 + i, totalDistanceMeters: 8000, restingHeartRate: 60 - Math.floor(i / 8), floorsAscendedInMeters: 30,
      wellnessStartTimeLocal: `${d}T00:00:00.0`, wellnessStartTimeGmt: `${isoAdd(d, -1)}T21:00:00.0`,
      allDayStress: { aggregatorList: [{ type: "TOTAL", averageStressLevel: 25 }] } });
    sleep.push({ calendarDate: d, sleepStartTimestampGMT: `${isoAdd(d, -1)}T20:30:00.0`, sleepEndTimestampGMT: `${d}T03:40:00.0`,
      deepSleepSeconds: 7200, lightSleepSeconds: 14400, remSleepSeconds: 3600, sleepScores: { overallScore: 80 } });
  }
  sleep.push({ calendarDate: isoAdd(start, 1), sleepStartTimestampGMT: "x", sleepEndTimestampGMT: "x", deepSleepSeconds: 600, lightSleepSeconds: 600, sleepScores: { overallScore: 10 } });
  if (extraOldDay) uds.push({ calendarDate: extraOldDay, totalSteps: 5000 });
  return new Map([
    ["DI_CONNECT/DI-Connect-Fitness/someone@example.com_0_summarizedActivities.json", [{ summarizedActivitiesExport: acts }]],
    ["DI_CONNECT/DI-Connect-Aggregator/UDSFile_a.json", uds],
    ["DI_CONNECT/DI-Connect-Wellness/1_sleepData.json", sleep],
    ["DI_CONNECT/DI-Connect-Wellness/1_fitnessAgeData.json", [{ asOfDateGmt: `${start}T00:00:00.0`, currentBioAge: 36.2 }, { asOfDateGmt: `${isoAdd(start, days - 1)}T00:00:00.0`, currentBioAge: 35.1 }]],
    ["DI_CONNECT/DI-Connect-User/user_profile.json", { firstName: "Sam" }],
  ]);
}

test("only the files we need are read, wherever they sit in the ZIP", () => {
  assert.ok(PE.isWanted("x/DI_CONNECT/DI-Connect-Fitness/a@b.com_1_summarizedActivities.json"));
  assert.ok(PE.isWanted("other/layout/UDSFile_2026-01-01_2026-04-01.json"));
  assert.ok(!PE.isWanted("DI_CONNECT/DI-Connect-Uploaded-Files/UploadedFiles_0-_Part1.zip"));
  assert.ok(!PE.isWanted("DI_CONNECT/DI-Connect-User/user_contact.json"));
});

test("a watch bought this year gets a 'since' recap", () => {
  const s = PE.computeStats(fixture());
  assert.equal(s.period.mode, "since");
  assert.equal(s.period.label, "Since April 2026");
  assert.equal(s.period.days, 40);
});

test("older data gives a calendar-year recap that ignores last year", () => {
  const s = PE.computeStats(fixture({ extraOldDay: "2025-12-30" }));
  assert.equal(s.period.mode, "year");
  assert.equal(s.period.label, "2026 Recap");
  assert.equal(s.steps.days, 40);
});

test("an early-January export recaps the year that just ended", () => {
  const s = PE.computeStats(fixture({ start: "2026-12-01", days: 36 }));
  assert.equal(s.period.label, "Since December 2026");
  assert.equal(s.period.end, "2026-12-31");
});

test("every file type is read (regression: dangling else skipped fitness age and profile)", () => {
  const s = PE.computeStats(fixture());
  assert.equal(s.name, "Sam");
  assert.deepEqual(s.body.fitnessAge, [36.2, 35.1]);
  assert.deepEqual(s.body.vo2, [40, 43]);
});

test("units, families, sleep filter and timezone are handled", () => {
  const s = PE.computeStats(fixture());
  assert.equal(s.totals.families.running.count, 20);
  assert.equal(Math.round(s.totals.families.running.km), 100);
  assert.equal(s.sweatLiters, 20);
  assert.deepEqual(s.zoneHours.map(h => +h.toFixed(1)), [6.7, 13.3, 6.7, 0, 0]);
  assert.equal(s.sleep.nights, 40);
  assert.equal(s.sleep.bedtime, "23:30");
  assert.equal(s.sleep.wake, "06:40");
  assert.deepEqual(s.byHour, { 20: 20, 7: 20 });
});

test("a file that isn't a Garmin export fails with a clear message", () => {
  assert.throws(() => PE.computeStats(new Map()), /Garmin Connect data export/);
});

test("activity types map to families", () => {
  assert.equal(PE.family("trail_running"), "running");
  assert.equal(PE.family("open_water_swimming"), "swimming");
  assert.equal(PE.family("gravel_cycling"), "cycling");
  assert.equal(PE.family("hiking"), "walking & hiking");
  assert.equal(PE.family("breathwork"), "mind & body");
  assert.equal(PE.family("tennis"), "other");
});

test("steps distance uses Garmin's measured daily distance", () => {
  const s = PE.computeStats(fixture());
  assert.equal(s.steps.distanceKm, 40 * 8);
  const I = require("../src/insights.js");
  assert.match(I.steps(s).body, /about 320 km/);
  assert.ok(I.steps(s).trace.some(x => /measured/.test(x)));
});
