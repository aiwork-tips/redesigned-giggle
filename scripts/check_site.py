#!/usr/bin/env python3
"""Offline structure, DOM ID and JavaScript syntax checks for index.html."""
from pathlib import Path
import re
import subprocess
import tempfile

html = Path("index.html").read_text(encoding="utf-8")
closing = '<script src="./assets/overseas_news.js"></script></body></html>'
if not html.rstrip().endswith(closing):
    raise SystemExit("Unexpected document ending")
for tag in ("<script>", "<body", "</body>", "<main", "</main>", "</html>"):
    if html.count(tag) != 1:
        raise SystemExit(f"Expected exactly one {tag}, saw {html.count(tag)}")

if html.count("</script>") != 14 or html.count('<script src="./assets/opportunities.js">') != 1 or html.count('<script src="./assets/trends.js">') != 1 or html.count('<script src="./assets/evergreen.js">') != 1 or html.count('<script src="./assets/repeatability.js">') != 1 or html.count('<script src="./assets/sales_ledger.js">') != 1 or html.count('<script src="./assets/sales_rankings.js">') != 1 or html.count('<script src="./assets/migration_backup.js">') != 1 or html.count('<script src="./assets/migration_restore.js">') != 1 or html.count('<script src="./assets/team_preview.js">') != 1 or html.count('<script src="./assets/team_migration_mapper.js">') != 1 or html.count('<script src="./assets/firebase_readiness.js">') != 1 or html.count('<script src="./assets/auto_picks.js">') != 1 or html.count('<script src="./assets/overseas_news.js">') != 1:
    raise SystemExit("Expected one inline script and thirteen independent scripts")
if not Path("assets/opportunities.js").is_file():
    raise SystemExit("Missing separate opportunity viewer code")
if not Path("assets/trends.js").is_file():
    raise SystemExit("Missing separate trends viewer code")
if not Path("assets/evergreen.js").is_file():
    raise SystemExit("Missing repeatable sourcing discovery viewer")
if not Path("assets/repeatability.js").is_file():
    raise SystemExit("Missing SKU-level sourcing evidence journal")
if not Path("assets/sales_ledger.js").is_file():
    raise SystemExit("Missing private actual-sales ledger")
if not Path("assets/sales_rankings.js").is_file():
    raise SystemExit("Missing actual-sales rankings module")
if not Path("assets/migration_backup.js").is_file():
    raise SystemExit("Missing migration backup module")
if not Path("assets/migration_restore.js").is_file():
    raise SystemExit("Missing safe migration restore module")
if not Path("assets/team_preview.js").is_file():
    raise SystemExit("Missing read-only three-person comparison")
for path in ("assets/team_migration_mapper.js", "assets/firebase_readiness.js"):
    if not Path(path).is_file():
        raise SystemExit("Missing offline Firebase migration preparation module: " + path)
if not Path("assets/auto_picks.js").is_file():
    raise SystemExit("Missing report-backed auto-picks renderer")
if not Path("assets/overseas_news.js").is_file():
    raise SystemExit("Missing overseas publisher RSS frontend")

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
subprocess.run(["node", "--check", "assets/trends.js"], check=True)
subprocess.run(["node", "--check", "assets/evergreen.js"], check=True)
subprocess.run(["node", "--check", "assets/repeatability.js"], check=True)
subprocess.run(["node", "--check", "assets/sales_ledger.js"], check=True)
subprocess.run(["node", "--check", "assets/sales_rankings.js"], check=True)
subprocess.run(["node", "--check", "assets/migration_backup.js"], check=True)
subprocess.run(["node", "--check", "assets/migration_restore.js"], check=True)
subprocess.run(["node", "--check", "assets/team_preview.js"], check=True)
subprocess.run(["node", "--check", "assets/team_migration_mapper.js"], check=True)
subprocess.run(["node", "--check", "assets/firebase_readiness.js"], check=True)
subprocess.run(["node", "--check", "firebase/team_repository.mjs"], check=True)
subprocess.run(["node", "--check", "assets/auto_picks.js"], check=True)
subprocess.run(["node", "--check", "assets/overseas_news.js"], check=True)

for field in ("trendDiscovery", "trendSeedList", "trendTerm", "trendAdd", "trendInboxList", "trendInboxCount", "trendExport", "trendMessage"):
    if f'id="{field}"' not in html:
        raise SystemExit("Missing trends discovery element: " + field)
if "export-scout-items-v1" in Path("assets/trends.js").read_text(encoding="utf-8"):
    raise SystemExit("Trend shortlist must not overwrite the main saved price records")

for field in ("trendAutoStatus", "trendAutoList", "trendAutoMore", "trendAutoMoreLabel", "trendSignalStatus", "trendSignalList"):
    if f'id="{field}"' not in html:
        raise SystemExit("Missing source-backed pick or trending signal section: " + field)
if "export-scout-items-v1" in Path("assets/auto_picks.js").read_text(encoding="utf-8"):
    raise SystemExit("Auto-picks must not overwrite manually saved price records")

for field in ("newsSignalStatus", "newsSignalList"):
    if f'id="{field}"' not in html:
        raise SystemExit("Missing overseas publisher RSS panel: " + field)

# Put recently detected signals before the historical cross-border report picks.
news_pos = html.find('id="newsSignalStatus"')
trend_pos = html.find('id="trendSignalStatus"')
report_pos = html.find('id="trendAutoStatus"')
if not (0 < news_pos < trend_pos < report_pos):
    raise SystemExit("Fresh overseas discovery must appear before archival report picks")
if '商品発掘｜定番候補＋海外トレンド' not in html:
    raise SystemExit("Evergreen + trend discovery section missing")
for field in ('evergreenDiscovery', 'evergreenStatus', 'evergreenList', 'evergreenMore', 'evergreenMoreLabel'):
    if f'id="{field}"' not in html:
        raise SystemExit('Evergreen research panel missing: ' + field)
evergreen_pos = html.find('id="evergreenStatus"')
if not (0 < evergreen_pos < news_pos < trend_pos < report_pos):
    raise SystemExit('Evergreen leads must be above news and archival picks')


for field in ("repeatabilityPanel", "repeatEditor", "repeatStatus", "repeatList", "repeatSku", "repeatSoldCount", "repeatUsd", "repeatCost", "repeatFx", "repeatSave", "repeatExport"):
    if f'id="{field}"' not in html:
        raise SystemExit("Missing SKU-level sourcing evidence field: " + field)
if "export-scout-repeatability-v1" not in Path("assets/repeatability.js").read_text(encoding="utf-8"):
    raise SystemExit("Repeatability records must use their own isolated storage key")
if "export-scout-items-v1" in Path("assets/repeatability.js").read_text(encoding="utf-8"):
    raise SystemExit("Repeatability journal must not modify historical saved price records")

for field in ("salesLedgerPanel", "salesLedgerSummary", "salesLedgerStatus", "salesLedgerEditor", "salesLedgerBySku", "salesLedgerMonths", "salesLedgerRecords", "ledgerSku", "ledgerPurchaseDate", "ledgerPurchaseCost", "ledgerState", "ledgerSoldFields", "ledgerSaleDate", "ledgerPayout", "ledgerShipping", "ledgerOther", "ledgerSave", "ledgerExport"):
    if f'id="{field}"' not in html:
        raise SystemExit("Missing actual-sales ledger UI: " + field)
if "export-scout-sales-ledger-v1" not in Path("assets/sales_ledger.js").read_text(encoding="utf-8"):
    raise SystemExit("Actual-sales journal must use a separate local storage key")
if "export-scout-items-v1" in Path("assets/sales_ledger.js").read_text(encoding="utf-8"):
    raise SystemExit("Actual-sales journal must not alter old price candidates")

for field in ("salesRankingPanel", "salesRankingSort", "salesRankingRepeatOnly", "salesRankingStatus", "salesRankingList", "migrationBackupPanel", "migrationBackupStatus", "migrationBackupInventory", "migrationBackupDownload", "migrationBackupRefresh", "migrationBackupMessage"):
    if f'id="{field}"' not in html:
        raise SystemExit("Missing rankings or future migration backup field: " + field)
if "export-scout-sales-ledger-v1" not in Path("assets/sales_rankings.js").read_text(encoding="utf-8"):
    raise SystemExit("Actual rankings must read only the local completed-sales ledger")
if "localStorage.setItem" in Path("assets/sales_rankings.js").read_text(encoding="utf-8"):
    raise SystemExit("Actual sales rankings must not rewrite existing transaction records")
if "localStorage.setItem" in Path("assets/migration_backup.js").read_text(encoding="utf-8"):
    raise SystemExit("Migration backup export must not rewrite existing storage records")

for field in ("migrationRestorePanel", "migrationRestoreFile", "migrationRestoreMessage", "migrationRestorePreview", "migrationRestoreApprove", "migrationRestoreApply"):
    if f'id="{field}"' not in html:
        raise SystemExit("Missing guarded local JSON restoration control: " + field)
restore_source = Path("assets/migration_restore.js").read_text(encoding="utf-8")
for needle in ("invalid_json_keys", "migrationRestoreApprove", "localStorage.getItem", "localStorage.removeItem"):
    if needle not in restore_source:
        raise SystemExit("Safe restore validation/rollback check missing: " + needle)
if "fetch(" in restore_source:
    raise SystemExit("Restore must stay entirely local; no uploads")

for field in ("teamPreviewPanel", "teamFileA", "teamFileB", "teamFileC", "teamCompare", "teamDownload", "teamPreviewStatus", "teamPreviewSummary", "teamPreviewMembers", "teamPreviewRanking"):
    if f'id="{field}"' not in html:
        raise SystemExit("Missing member comparison control: " + field)
team_src = Path("assets/team_preview.js").read_text(encoding="utf-8")
if "localStorage.setItem" in team_src or "fetch(" in team_src:
    raise SystemExit("Offline team comparison must not update local storage or fetch")
rules = Path("firebase/firestore.rules").read_text(encoding="utf-8")
if "allow read, write: if false;" not in rules:
    raise SystemExit("Pre-activation Firestore access must be denied by default")

for field in ("firebaseJump", "firebasePreflightPanel", "firebasePreflightStatus", "firebasePreflightList", "firebasePreflightRefresh"):
    if f'id="{field}"' not in html:
        raise SystemExit("Missing Firebase preflight UI control: " + field)
if "firebasePreflightPanel" not in Path("assets/firebase_readiness.js").read_text(encoding="utf-8"):
    # Module may reference only its status/control DOM IDs; check a unique required reference instead.
    if "firebasePreflightStatus" not in Path("assets/firebase_readiness.js").read_text(encoding="utf-8"):
        raise SystemExit("Readiness UI has no status binding")
rules_prod = Path("firebase/firestore.rules").read_text(encoding="utf-8")
rules_stage = Path("firebase/firestore.candidate.rules").read_text(encoding="utf-8")
if "allow read, write: if false;" not in rules_prod:
    raise SystemExit("Production rules must remain DENY ALL until activation approval")
if "isActiveMember" not in rules_stage or "request.resource.data.revision" not in rules_stage:
    raise SystemExit("Candidate rules must require membership and write revision checking")
if "firebase/firestore.rules" not in Path("firebase.json").read_text(encoding="utf-8"):
    raise SystemExit("Default Firebase CLI configuration must load DENY ALL rules")

with tempfile.TemporaryDirectory() as folder:
    js_file = Path(folder) / "export-scout.js"
    js_file.write_text(js, encoding="utf-8")
    subprocess.run(["node", "--check", str(js_file)], check=True)
print(f"Frontend structural and JavaScript syntax checks passed: {len(ids)} IDs, {len(references)} references")
