#!/usr/bin/env python3
"""Summarize an unzipped Garmin Connect data export into recap stats (JSON).

Usage:
    python3 scripts/summarize_export.py path/to/unzipped_export > recap.json

Only DI_CONNECT/ is read. All other folders in the export are ignored.
Raw units in the export: distance = cm, duration = ms, activity calories = kJ.
"""
import collections
import datetime as dt
import glob
import json
import os
import statistics as st
import sys


def load_all(pattern):
    rows = []
    for f in sorted(glob.glob(pattern)):
        data = json.load(open(f, encoding="utf-8"))
        rows.extend(data if isinstance(data, list) else [data])
    return rows


def local(ms):
    return dt.datetime.fromtimestamp(ms / 1000, dt.timezone.utc).replace(tzinfo=None)


def fmt_secs(s):
    s = int(round(s))
    h, m, sec = s // 3600, s % 3600 // 60, s % 60
    return f"{h}:{m:02d}:{sec:02d}" if h else f"{m}:{sec:02d}"


def activities(base):
    files = glob.glob(os.path.join(base, "DI-Connect-Fitness", "*summarizedActivities.json"))
    acts = []
    for f in files:
        for block in json.load(open(f, encoding="utf-8")):
            acts.extend(block.get("summarizedActivitiesExport", []))
    by_type = collections.defaultdict(lambda: {"count": 0, "km": 0.0, "hours": 0.0, "kcal": 0.0})
    hours, weekdays, months = collections.Counter(), collections.Counter(), collections.Counter()
    for a in acts:
        t = by_type[a.get("activityType", "other")]
        t["count"] += 1
        t["km"] += (a.get("distance") or 0) / 1e5
        t["hours"] += (a.get("duration") or 0) / 3.6e6
        t["kcal"] += (a.get("calories") or 0) / 4.184
        d = local(a["startTimeLocal"])
        hours[d.hour] += 1
        weekdays[d.strftime("%a")] += 1
        months[d.strftime("%Y-%m")] += 1
    days = sorted({local(a["startTimeLocal"]).date() for a in acts})
    best = cur = 1 if days else 0
    for i in range(1, len(days)):
        cur = cur + 1 if (days[i] - days[i - 1]).days == 1 else 1
        best = max(best, cur)
    return {
        "count": len(acts),
        "first": str(days[0]) if days else None,
        "last": str(days[-1]) if days else None,
        "active_days": len(days),
        "longest_streak_days": best,
        "by_type": {k: {kk: round(vv, 1) for kk, vv in v.items()} for k, v in by_type.items()},
        "by_hour": dict(sorted(hours.items())),
        "by_weekday": dict(weekdays.most_common()),
        "by_month": dict(sorted(months.items())),
    }


def daily(base):
    uds = [u for u in load_all(os.path.join(base, "DI-Connect-Aggregator", "UDSFile_*.json")) if u.get("totalSteps")]
    if not uds:
        return {}
    top = max(uds, key=lambda u: u["totalSteps"])
    rhr = [(u["calendarDate"], u["restingHeartRate"]) for u in sorted(uds, key=lambda u: u["calendarDate"]) if u.get("restingHeartRate")]
    steps_by_month = collections.Counter()
    for u in uds:
        steps_by_month[u["calendarDate"][:7]] += u["totalSteps"]
    return {
        "days": len(uds),
        "steps_total": sum(u["totalSteps"] for u in uds),
        "steps_avg": round(st.mean(u["totalSteps"] for u in uds)),
        "steps_best_day": {"date": top["calendarDate"], "steps": top["totalSteps"]},
        "steps_by_month": dict(sorted(steps_by_month.items())),
        "resting_hr_first": rhr[0][1] if rhr else None,
        "resting_hr_last": rhr[-1][1] if rhr else None,
    }


def sleep(base, tz_hours=3, min_hours=3.0):
    nights = [r for r in load_all(os.path.join(base, "DI-Connect-Wellness", "*sleepData.json")) if r.get("sleepScores")]
    rows = []
    for r in nights:
        h = (r.get("deepSleepSeconds", 0) + r.get("lightSleepSeconds", 0) + r.get("remSleepSeconds", 0)) / 3600
        if h >= min_hours:  # drop partial or broken nights
            rows.append((r, h))
    if not rows:
        return {}
    def clock(ts):
        d = dt.datetime.fromisoformat(ts) + dt.timedelta(hours=tz_hours)
        return d.hour * 60 + d.minute
    bed = st.median((clock(r["sleepStartTimestampGMT"]) + 720) % 1440 for r, _ in rows)
    bed = (bed - 720) % 1440
    wake = st.median(clock(r["sleepEndTimestampGMT"]) for r, _ in rows)
    best = max(rows, key=lambda x: x[0]["sleepScores"]["overallScore"])[0]
    return {
        "nights": len(rows),
        "avg_hours": round(st.mean(h for _, h in rows), 2),
        "avg_score": round(st.mean(r["sleepScores"]["overallScore"] for r, _ in rows), 1),
        "median_bedtime": f"{int(bed // 60):02d}:{int(bed % 60):02d}",
        "median_wake": f"{int(wake // 60):02d}:{int(wake % 60):02d}",
        "best_night": {"date": best["calendarDate"], "score": best["sleepScores"]["overallScore"]},
        "naps": sum(len(r.get("napList", [])) for r, _ in rows),
    }


def metrics(base):
    out = {}
    preds = sorted(load_all(os.path.join(base, "DI-Connect-Metrics", "RunRacePredictions_*.json")), key=lambda r: r["calendarDate"])
    if preds:
        out["race_predictions"] = {
            k: {"first": fmt_secs(preds[0][k]), "last": fmt_secs(preds[-1][k])}
            for k in ("raceTime5K", "raceTime10K", "raceTimeHalf", "raceTimeMarathon") if preds[0].get(k)
        }
    fa = sorted((r for r in load_all(os.path.join(base, "DI-Connect-Wellness", "*fitnessAgeData.json")) if r.get("currentBioAge")),
                key=lambda r: r["asOfDateGmt"])
    if fa:
        out["fitness_age"] = {"first": round(fa[0]["currentBioAge"], 1), "last": round(fa[-1]["currentBioAge"], 1)}
    prs = load_all(os.path.join(base, "DI-Connect-Fitness", "*personalRecord.json"))
    out["personal_records"] = [
        {"type": p["personalRecordType"], "value": p["value"], "when": p.get("prStartTimeGMT")}
        for block in prs for p in block.get("personalRecords", []) if p.get("current")
    ]
    return out


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    root = sys.argv[1]
    base = os.path.join(root, "DI_CONNECT")
    if not os.path.isdir(base):
        sys.exit(f"DI_CONNECT folder not found under {root}")
    recap = {"activities": activities(base), "daily": daily(base), "sleep": sleep(base), "metrics": metrics(base)}
    json.dump(recap, sys.stdout, ensure_ascii=False, indent=2)
    print()


if __name__ == "__main__":
    main()
