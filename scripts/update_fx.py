#!/usr/bin/env python3
"""Fetch and validate a public USD/JPY reference rate; no credentials required."""
import json
import math
import pathlib
import urllib.request
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

URL = "https://open.er-api.com/v6/latest/USD"

def validate(payload, now=None):
    now = now or datetime.now(timezone.utc)
    if payload.get("result") != "success":
        raise ValueError("Upstream result is not success")
    rate = float(payload["rates"]["JPY"])
    if not math.isfinite(rate) or not 50 < rate < 300:
        raise ValueError("Rate outside safety bounds")
    updated = payload.get("time_last_update_utc")
    if not isinstance(updated, str):
        raise ValueError("Missing source timestamp")
    stamp = parsedate_to_datetime(updated)
    if stamp.tzinfo is None:
        raise ValueError("Timestamp missing timezone")
    if stamp > now + timedelta(hours=24) or stamp < now - timedelta(days=7):
        raise ValueError("Source timestamp is stale or in the future")
    return {
        "pair": "USDJPY",
        "rate": round(rate, 6),
        "source": URL,
        "source_updated_at": updated,
        "kind": "reference_rate_not_executable_quote",
    }

def main():
    request = urllib.request.Request(URL, headers={"User-Agent": "ExportScout-FX-Refresh/1.0"})
    with urllib.request.urlopen(request, timeout=20) as response:
        payload = json.load(response)
    record = validate(payload)
    target = pathlib.Path("data/fx.json")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Validated USDJPY reference data", record["source_updated_at"])

if __name__ == "__main__":
    main()
