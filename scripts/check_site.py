#!/usr/bin/env python3
"""Offline structure, DOM ID and JavaScript syntax checks for index.html."""
from pathlib import Path
import re
import subprocess
import tempfile

html = Path("index.html").read_text(encoding="utf-8")
closing = "</script></body></html>"
if not html.rstrip().endswith(closing):
    raise SystemExit("Unexpected document ending")
for tag in ("<script>", "<body", "</body>", "<main", "</main>", "</html>"):
    if html.count(tag) != 1:
        raise SystemExit(f"Expected exactly one {tag}, saw {html.count(tag)}")

if html.count("</script>") != 2 or html.count('<script src="./assets/opportunities.js">') != 1:
    raise SystemExit("Expected one inline app script plus one independent opportunities script")
if not Path("assets/opportunities.js").is_file():
    raise SystemExit("Missing separate opportunity viewer code")

start = html.index("<script>") + len("<script>")
end = html.index("</script>", start)
js = html[start:end]
ids = re.findall(r'\bid="([^"]+)"', html[:start])
if len(ids) != len(set(ids)):
    raise SystemExit("Duplicate HTML element IDs")
references = set(re.findall(r"\$\('([^']+)'\)", js))
missing = sorted(references - set(ids))
if missing:
    raise SystemExit("JavaScript references missing DOM IDs: " + ", ".join(missing))

# Keep genre selection consolidated and exchange-rate provenance visible.
if 'id="genres"' in html or html.count('id="discoverGenre"') != 1:
    raise SystemExit("Duplicate or missing genre selection UI")
for field in ("fxMode", "fxSource", "fxUpdated", "fxFetched", "fxNext", "fxAge", "fxStatus"):
    if f'id="{field}"' not in html:
        raise SystemExit("Missing FX provenance field: " + field)
for old, new in (("③ ジャンル別リサーチ候補", "② ジャンル別リサーチ候補"),):
    if old in html or new not in html:
        raise SystemExit("Incorrect genre section numbering")

if "https://www.exchangerate-api.com" not in html:
    raise SystemExit("Missing required free-API attribution")
if "./data/fx.json" in js:
    raise SystemExit("Do not redistribute the free API rates through public GitHub JSON")
if "time_next_update_utc" not in js:
    raise SystemExit("Missing FX provider next-update source field")

if 'id="watchlistStatus"' not in html or "data/research_targets.json" not in js:
    raise SystemExit("Missing editable eBay watchlist status integration")
if "checkWatchlist();" not in js:
    raise SystemExit("Watchlist status is not checked on page load")

for field in ("autoPairsStatus", "autoPairsList"):
    if f'id="{field}"' not in html:
        raise SystemExit("Missing paired-price viewer field: " + field)

subprocess.run(["node", "--check", "assets/opportunities.js"], check=True)

with tempfile.TemporaryDirectory() as folder:
    js_file = Path(folder) / "export-scout.js"
    js_file.write_text(js, encoding="utf-8")
    subprocess.run(["node", "--check", str(js_file)], check=True)
print(f"Frontend structural and JavaScript syntax checks passed: {len(ids)} IDs, {len(references)} references")
