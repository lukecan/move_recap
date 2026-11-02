# Garmin export notes

How to request it: **garmin.com/account/datamanagement → Export Your Data → Request Data Export** (desktop browser only). The ZIP arrives by email, usually within 24–48 hours, sometimes much later. The download link expires.

## What we use

Only `DI_CONNECT/` matters. The export contains 40+ other top-level folders (aviation, golf, inReach, orders, consent history, …) that are empty or irrelevant for a recap.

| Path | Contents | Used for |
|---|---|---|
| `DI-Connect-Fitness/*summarizedActivities.json` | One summary per activity | Totals, sports, time of day, months, streaks |
| `DI-Connect-Fitness/*personalRecord.json` | Current and past PRs | Records card |
| `DI-Connect-Fitness/*gear.json` | Shoes, bikes and linked activities | (optional) gear card |
| `DI-Connect-Aggregator/UDSFile_*.json` | Daily summary: steps, resting HR, stress, Body Battery, SpO2 | Steps, body card |
| `DI-Connect-Wellness/*sleepData.json` | Nightly sleep stages and scores, naps | Sleep card |
| `DI-Connect-Wellness/*fitnessAgeData.json` | Fitness age, VO2 Max | Body card |
| `DI-Connect-Metrics/RunRacePredictions_*.json` | Predicted 5K / 10K / half / marathon times | Pace card |
| `DI-Connect-Metrics/TrainingReadinessDTO_*.json` | Daily readiness score, HRV weekly average | (optional) |
| `DI-Connect-Uploaded-Files/*.zip` | Raw FIT files (GPS tracks) | (future) route map |

## Gotchas

- **Files are split by date range** (`UDSFile_2026-04-17_2026-07-26.json`, …). Load every match and merge.
- **Raw units:** activity `distance` in centimetres, `duration` in milliseconds, activity `calories` in kJ (divide by 4.184 for kcal). Daily summaries use metres and kcal.
- **File names contain the user's email address.** Match on suffix, never on the full name.
- **Folder layout differs between accounts** (forum reports). Search for files by pattern instead of fixed paths.
- `startTimeLocal` is already local time as epoch ms. Read it as UTC to get local wall-clock time.
- Sleep timestamps are GMT; convert with the user's offset.
- TrainingReadiness has several entries per day; some have no `score`. Keep the last one with a score.

## Data-quality filters

- Drop sleep records under 3 hours (partial or broken nights; one export had "nights" of 19 minutes).
- Sanity-check swim PRs: a 100 m pool "record" of 30.8 s is almost certainly a lap-count error. Skip PRs that beat realistic thresholds.
- Activities without distance (strength, breathwork, meditation) count toward totals but not toward km.
