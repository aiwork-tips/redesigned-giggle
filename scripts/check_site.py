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
for tag in ("<script>", "</script>", "<body", "</body>", "<main", "</main>", "</html>"):
    if html.count(tag) != 1:
        raise SystemExit(f"Expected exactly one {tag}, saw {html.count(tag)}")

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

with tempfile.TemporaryDirectory() as folder:
    js_file = Path(folder) / "export-scout.js"
    js_file.write_text(js, encoding="utf-8")
    subprocess.run(["node", "--check", str(js_file)], check=True)
print(f"Frontend structural and JavaScript syntax checks passed: {len(ids)} IDs, {len(references)} references")
