#!/usr/bin/env python3
"""Update a public, non-credential USD/JPY reference rate for Export Scout."""
import json
import math
import pathlib
import urllib.request
from datetime import datetime, timezone

URL = "https://open.er-api.com/v6/latest/USD"
target = pathlib.Path("data/fx.json")
request = urllib.request.Request(URL, headers={"User-Agent": "ExportScout-FX-Refresh/1.0"})
with urllib.request.urlopen(request, timeout=20) as response:
    payload = json.load(response)
rate = float(payload["rates"]["JPY"])
if payload.get("result") != "success" or not math.isfinite(rate) or not 50 < rate < 300:
    raise ValueError("Unexpected FX data: refusing to overwrite prior reference rate")
updated = payload.get("time_last_update_utc")
if not updated:
    raise ValueError("Missing source timestamp")
record = {
    "pair": "USDJPY",
    "rate": round(rate, 6),
    "source": URL,
    "source_updated_at": updated,
    "fetched_at": datetime.now(timezone.utc).isoformat(),
    "kind": "reference_rate_not_executable_quote",
}
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("Updated USDJPY reference data", record["source_updated_at"])
