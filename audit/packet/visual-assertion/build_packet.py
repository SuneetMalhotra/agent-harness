#!/usr/bin/env python3
"""Build the visual-assertion rater packet.

Reads the 24 seeded cases from visual-corpus/seedings.ts (parsed by re-
extracting fields with a small TS-aware regex pass) and the 24 rendered PNGs
from visual-corpus/images/. Produces:

    audit/packet/visual-assertion/case_descriptions.csv
        TC01..TC24 rows with the deterministically shuffled (id-free)
        expected text and the property checklist. NO functional/cosmetic
        tag, NO LLM-judge verdict.

    audit/packet/visual-assertion/test_cases_KEY.csv
        TC01..TC24 -> source seeding id, seeded label, and the LLM-judge
        verdict (read from results.json). Schema matches analysis.py:
            case_id,source_id,seeded_label,llm_judge_verdict
        Audit coordinator only; do not share with raters.

    audit/packet/visual-assertion/images/TC01.png .. TC24.png
        Copies of the rendered PNGs, renamed by shuffled TC number.

    audit/packet/visual-assertion/rater_template.csv  (already exists,
        24 rows; left untouched if present.)

Shuffle seed: numpy.random.default_rng(2026). Idempotent: re-running
overwrites outputs with the same values.
"""

from __future__ import annotations

import csv
import json
import re
import shutil
from pathlib import Path

import numpy as np

PKT = Path(__file__).resolve().parent
ROOT = PKT.parents[2]  # repo root
SEEDINGS_TS = ROOT / "visual-corpus" / "seedings.ts"
IMG_SRC = ROOT / "visual-corpus" / "images"
IMG_DST = PKT / "images"
CASES_CSV = PKT / "case_descriptions.csv"
KEY_CSV = PKT / "test_cases_KEY.csv"
RATER_CSV = PKT / "rater_template.csv"
RESULTS_JSON = ROOT / "results.json"

# ---------------------------------------------------------------------------
# Parse seedings.ts
#
# Tolerates the hand-written TS layout. Extracts id, type, expected, and
# the properties array. Description is also captured (KEY-only).
# ---------------------------------------------------------------------------

ENTRY_RE = re.compile(
    r"\{\s*"
    r"id:\s*'(?P<id>[^']+)',\s*"
    r"type:\s*'(?P<type>functional|cosmetic)',\s*"
    r"description:\s*(?P<desc>'[^']*'|\"[^\"]*\"|`[^`]*`),\s*"
    r"expected:\s*(?P<expected>'[^']*'|\"[^\"]*\"|`[^`]*`),\s*"
    r"properties:\s*\[(?P<props>[^\]]*)\]",
    re.DOTALL,
)


def _strip_quotes(s: str) -> str:
    s = s.strip()
    if s and s[0] in "'\"`" and s[-1] == s[0]:
        return s[1:-1]
    return s


def parse_seedings() -> list[dict]:
    src = SEEDINGS_TS.read_text(encoding="utf-8")
    entries = []
    for m in ENTRY_RE.finditer(src):
        sid = m.group("id")
        # Only consume the 24 corpus entries; defensive against future additions
        # outside the SEEDINGS array.
        if not (sid.startswith("vis-func-") or sid.startswith("vis-cosm-")):
            continue
        props_raw = m.group("props")
        props = [
            _strip_quotes(x.strip().rstrip(","))
            for x in re.findall(r"'[^']*'|\"[^\"]*\"|`[^`]*`", props_raw)
        ]
        entries.append({
            "id": sid,
            "type": m.group("type"),
            "description": _strip_quotes(m.group("desc")),
            "expected": _strip_quotes(m.group("expected")),
            "properties": props,
        })
    if len(entries) != 24:
        raise SystemExit(f"Expected 24 entries; parsed {len(entries)}")
    return entries


def load_llm_verdicts() -> dict[str, str]:
    """Return source_id -> 'PASS'|'FAIL' from results.json visualAssertion.events."""
    if not RESULTS_JSON.exists():
        return {}
    data = json.loads(RESULTS_JSON.read_text(encoding="utf-8"))
    events = data.get("visualAssertion", {}).get("events", [])
    out: dict[str, str] = {}
    for ev in events:
        tcid = ev.get("testCaseId", "")
        verdict = ev.get("verdict", "").lower()
        if verdict == "pass":
            out[tcid] = "PASS"
        elif verdict == "fail":
            out[tcid] = "FAIL"
    return out


def main() -> None:
    entries = parse_seedings()
    llm = load_llm_verdicts()

    rng = np.random.default_rng(2026)
    order = rng.permutation(len(entries))

    # Map TC01..TC24 -> source entry
    mapping = []
    for tc_idx, src_idx in enumerate(order):
        tc_id = f"TC{tc_idx + 1:02d}"
        mapping.append((tc_id, entries[int(src_idx)]))

    IMG_DST.mkdir(parents=True, exist_ok=True)
    # Clear stale TC*.png so the packet matches the current shuffle exactly.
    for stale in IMG_DST.glob("TC*.png"):
        stale.unlink()

    # Copy images, write blind case descriptions, write KEY.
    with CASES_CSV.open("w", newline="", encoding="utf-8") as f_cases, \
         KEY_CSV.open("w", newline="", encoding="utf-8") as f_key:
        cases = csv.writer(f_cases)
        key = csv.writer(f_key)
        cases.writerow(["case_id", "image_file", "expected", "properties"])
        # Schema matches analysis.py load_key():
        #   case_id, source_id, seeded_label, llm_judge_verdict
        # plus two extra columns (description, expected) the coordinator
        # finds useful when triaging rater disagreements. analysis.py
        # tolerates extra columns via DictReader.
        key.writerow([
            "case_id",
            "source_id",
            "seeded_label",
            "llm_judge_verdict",
            "description",
            "expected",
        ])

        for tc_id, e in mapping:
            src_png = IMG_SRC / f"{e['id']}.png"
            if not src_png.exists():
                raise SystemExit(f"Missing source image {src_png}")
            shutil.copyfile(src_png, IMG_DST / f"{tc_id}.png")

            cases.writerow([
                tc_id,
                f"images/{tc_id}.png",
                e["expected"],
                " | ".join(e["properties"]),
            ])
            key.writerow([
                tc_id,
                e["id"],
                e["type"],
                llm.get(e["id"], ""),
                e["description"],
                e["expected"],
            ])

    # Refresh rater_template.csv to a known-good 24-row blank.
    with RATER_CSV.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["case_id", "verdict", "reason", "time_spent_seconds", "notes"])
        for tc_id, _ in mapping:
            w.writerow([tc_id, "", "", "", ""])

    print(f"Wrote {CASES_CSV.name}, {KEY_CSV.name}, refreshed {RATER_CSV.name}")
    print(f"Copied {len(mapping)} PNGs into {IMG_DST}")


if __name__ == "__main__":
    main()
