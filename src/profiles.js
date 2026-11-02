/*
 * Test profiles for the insight engine.
 * Every profile is INVENTED to exercise different rule paths.
 * No real user data lives in this repository.
 */
(function (root) {
  "use strict";
  const PROFILES = [
    {
      id: "duathlete", name: "Dawn-and-dusk duathlete", note: "Invented example · run + swim", invented: true,
      byHour: { 5: 3, 6: 22, 7: 18, 8: 9, 12: 5, 17: 6, 18: 9, 19: 24, 20: 20, 21: 3 },
      byWeekday: { Mon: 18, Tue: 22, Wed: 15, Thu: 20, Fri: 11, Sat: 25, Sun: 8 },
      zoneHours: [30, 25, 24, 8, 0.5],
      stressByWeekday: { Mon: 22, Tue: 21, Wed: 25, Thu: 24, Fri: 26, Sat: 29, Sun: 25 },
      days: 210,
      steps: { total: 2240000, days: 210, bestDay: { date: "Jun 7", steps: 31200 } },
      sleep: { nights: 190, avgHours: 6.6, avgScore: 75, bedtime: "23:20", wake: "06:30" },
      body: { days: 205, rhr: [57, 50], vo2: [42, 46], fitnessAge: [37.0, 34.8] },
      sweatLiters: 61.5,
      climbMeters: 4800,
      cadence: { runs: 120, spm: 176, first: 171, last: 179 },
    },
    {
      id: "cyclist", name: "Early-bird cyclist", note: "Invented example", invented: true,
      byHour: { 5: 38, 6: 52, 7: 21, 12: 6, 18: 9, 19: 4 },
      byWeekday: { Mon: 22, Tue: 20, Wed: 21, Thu: 19, Fri: 18, Sat: 22, Sun: 8 },
      zoneHours: [92, 70, 18, 24, 9],
      stressByWeekday: { Mon: 41, Tue: 36, Wed: 34, Thu: 33, Fri: 31, Sat: 24, Sun: 22 },
      days: 340,
      steps: { total: 2652000, days: 340, bestDay: { date: "Jun 8", steps: 18200 } },
      sleep: { nights: 320, avgHours: 7.62, avgScore: 84, bedtime: "21:50", wake: "05:20" },
      body: { days: 335, rhr: [52, 49], vo2: [52, 55], fitnessAge: [31.0, 29.5] },
      sweatLiters: 310,
      climbMeters: 2100,
      power: { sport: "cycling", sessions: 140, kJ: 410000, avgW: 205, bestNP: 262, maxW: 980, rpm: 89 },
    },
    {
      id: "lifter", name: "Night-owl lifter", note: "Invented example", invented: true,
      byHour: { 20: 8, 21: 26, 22: 41, 23: 22, 0: 6, 18: 5 },
      byWeekday: { Mon: 20, Tue: 17, Wed: 19, Thu: 16, Fri: 9, Sat: 14, Sun: 13 },
      zoneHours: [9, 14, 19, 22, 8],
      stressByWeekday: { Mon: 38, Tue: 37.5, Wed: 38.4, Thu: 37.9, Fri: 36.8, Sat: 37.2, Sun: 38.1 },
      days: 290,
      steps: { total: 1508000, days: 290, bestDay: { date: "Aug 2", steps: 12500 } },
      sleep: { nights: 250, avgHours: 5.8, avgScore: 61, bedtime: "00:40", wake: "06:45" },
      body: { days: 280, rhr: [66, 68], vo2: [38, 37.8], fitnessAge: [41.0, 41.5] },
      sweatLiters: 95,
      climbMeters: 900,
    },
    {
      id: "hiker", name: "Weekend hiker", note: "Invented example", invented: true,
      byHour: { 8: 9, 9: 14, 10: 12, 11: 6, 14: 4, 17: 3, 19: 4 },
      byWeekday: { Mon: 3, Tue: 4, Wed: 2, Thu: 5, Fri: 3, Sat: 18, Sun: 17 },
      zoneHours: [14, 18, 22, 6, 1],
      stressByWeekday: { Mon: 33, Tue: 35, Wed: 42, Thu: 39, Fri: 34, Sat: 21, Sun: 19 },
      days: 360,
      steps: { total: 4608000, days: 360, bestDay: { date: "Sep 14", steps: 41000 } },
      sleep: { nights: 340, avgHours: 7.1, avgScore: 74, bedtime: "23:05", wake: "06:50" },
      body: { days: 355, rhr: [60, 59], vo2: [40, 42], fitnessAge: [38.0, 37.2] },
      sweatLiters: 140,
      climbMeters: 14000,
    },
    {
      id: "newbie", name: "Brand-new watch", note: "Invented example · 2 weeks of data", invented: true,
      byHour: { 7: 4, 18: 5, 19: 3 },
      byWeekday: { Mon: 2, Tue: 2, Wed: 2, Thu: 1, Fri: 2, Sat: 2, Sun: 1 },
      zoneHours: [2.1, 1.8, 1.2, 0.6, 0.1],
      stressByWeekday: { Mon: 30, Tue: 28, Wed: 33, Thu: 29, Fri: 31, Sat: 25, Sun: 24 },
      days: 14,
      steps: { total: 98000, days: 14, bestDay: { date: "Oct 30", steps: 11200 } },
      sleep: { nights: 12, avgHours: 6.9, avgScore: 70, bedtime: "23:10", wake: "07:00" },
      body: { days: 14, rhr: [62, 61] },
      sweatLiters: 1.2,
      climbMeters: 60,
    },
  ];
  if (typeof module !== "undefined" && module.exports) module.exports = PROFILES;
  else root.PROFILES = PROFILES;
})(typeof window !== "undefined" ? window : globalThis);
