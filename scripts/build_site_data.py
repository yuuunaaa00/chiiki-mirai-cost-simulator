#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""公開サイト用の軽量データ(docs/data/schools.json)を生成する。
入力: data/schools_cost_data.json, data/meal_provision.json
"""
import json, os
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
schools = json.load(open(os.path.join(BASE, "data", "schools_cost_data.json"), encoding="utf-8"))
meals = json.load(open(os.path.join(BASE, "data", "meal_provision.json"), encoding="utf-8"))

def positive_or_none(v):
    return v if isinstance(v, int) and v > 0 else None

out = []
for s in schools:
    m = meals[s["id"]]
    out.append({
        "id": s["id"],
        "name": s["name"],
        "pref": s["prefecture"],
        "firstYear": positive_or_none(s["first_year_cost"]["total"]),   # None = 未掲載・調整中
        "monthly": positive_or_none(s["monthly_living_cost"]["total"]),  # None = 未掲載・調整中
        "meal": {"status": m["status"], "provided": m["provided_per_month"], "label": m["label"]},
    })
os.makedirs(os.path.join(BASE, "docs", "data"), exist_ok=True)
json.dump(out, open(os.path.join(BASE, "docs", "data", "schools.json"), "w", encoding="utf-8"),
          ensure_ascii=False, separators=(",", ":"))
print("schools:", len(out), "/ firstYear未掲載:", sum(1 for o in out if o["firstYear"] is None),
      "/ monthly未掲載:", sum(1 for o in out if o["monthly"] is None))
