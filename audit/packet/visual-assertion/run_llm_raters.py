#!/usr/bin/env python3
"""
run_llm_raters.py — Phase 2 LLM-as-rater driver for the visual-assertion audit.

For each of the 24 shuffled cases (TC01..TC24), invoke `claude -p` twice:

  Rater A (strict-text): persona = strict QA, modality = text-only
                         (expected + properties), no image.
  Rater B (lenient-vision): persona = lenient design reviewer, modality =
                            image-only (Claude reads the PNG via its Read tool).

Both raters output a single JSON object: {"verdict": "PASS"|"FAIL", "reason": "..."}.

Outputs:
  - rater_A_strict_text.csv
  - rater_B_lenient_vision.csv
    (columns: case_id, verdict, reason, persona, modality)

Constraints:
  - Uses Claude OAuth via `claude -p`. NEVER reads ANTHROPIC_API_KEY.
  - Up to 2 retries per case on JSON parse failure. Logs failures.
"""

from __future__ import annotations

import csv
import json
import re
import subprocess
import sys
import time
from pathlib import Path
from typing import Optional, Tuple

PACKET_DIR = Path("/Users/suneetmalhotra/work/agent-harness/audit/packet/visual-assertion")
CASE_CSV = PACKET_DIR / "case_descriptions.csv"
IMAGES_DIR = PACKET_DIR / "images"
RATER_A_OUT = PACKET_DIR / "rater_A_strict_text.csv"
RATER_B_OUT = PACKET_DIR / "rater_B_lenient_vision.csv"
LOG_PATH = PACKET_DIR / "run_llm_raters.log"

RATER_A_SYSTEM = (
    "You are a strict senior QA engineer with 10 years of UI test review "
    "experience. Apply the rubric strictly: properties before prose, functional "
    "over cosmetic, no charity for design. Output exactly one JSON object: "
    "{\"verdict\": \"PASS\"|\"FAIL\", \"reason\": \"...\"} and nothing else."
)

RATER_B_SYSTEM = (
    "You are an experienced design reviewer and UI architect. You emphasize "
    "user-perceived layout integrity over strict checklist conformance. Mark "
    "FAIL only when the rendered screen has a functionally-observable problem "
    "(obscured CTA, clipped content, missing element, illegible text, "
    "accessibility violation). Mark PASS for cosmetic-only differences "
    "(color, font, spacing). Output exactly one JSON object: "
    "{\"verdict\": \"PASS\"|\"FAIL\", \"reason\": \"...\"} and nothing else."
)

JSON_OBJECT_RE = re.compile(r"\{[^{}]*\"verdict\"[^{}]*\"reason\"[^{}]*\}", re.DOTALL)
JSON_OBJECT_RE_REV = re.compile(r"\{[^{}]*\"reason\"[^{}]*\"verdict\"[^{}]*\}", re.DOTALL)


def log(msg: str) -> None:
    print(msg, flush=True)
    with LOG_PATH.open("a", encoding="utf-8") as f:
        f.write(msg + "\n")


def call_claude(system_prompt: str, user_prompt: str) -> Tuple[str, float]:
    """Invoke `claude -p` with a system prompt and a user prompt. Returns (stdout, elapsed_s)."""
    cmd = [
        "claude", "-p",
        "--append-system-prompt", system_prompt,
        user_prompt,
    ]
    t0 = time.time()
    res = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    elapsed = time.time() - t0
    if res.returncode != 0:
        raise RuntimeError(
            f"claude -p exit {res.returncode}: stderr={res.stderr[:500]}"
        )
    return res.stdout.strip(), elapsed


def parse_json_verdict(raw: str) -> Optional[Tuple[str, str]]:
    """Extract {verdict, reason}. Returns (verdict, reason) or None if unparseable."""
    s = raw.strip()
    # Strip code fences if present.
    if s.startswith("```"):
        s = re.sub(r"^```(?:json)?\s*", "", s)
        s = re.sub(r"\s*```$", "", s)
        s = s.strip()
    # Try direct parse.
    for candidate in (s, *(JSON_OBJECT_RE.findall(s)), *(JSON_OBJECT_RE_REV.findall(s))):
        try:
            obj = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        v = obj.get("verdict")
        r = obj.get("reason", "")
        if isinstance(v, str):
            vv = v.strip().upper()
            if vv in ("PASS", "FAIL"):
                return vv, str(r).strip()
    # Last-ditch: look for the bare token.
    m = re.search(r"\b(PASS|FAIL)\b", s, re.IGNORECASE)
    if m:
        return m.group(1).upper(), s[:200]
    return None


def rate_case(rater: str, system_prompt: str, user_prompt: str, case_id: str, max_retries: int = 2) -> Tuple[Optional[str], str, float]:
    last_raw = ""
    total_elapsed = 0.0
    prompt = user_prompt
    for attempt in range(max_retries + 1):
        try:
            raw, elapsed = call_claude(system_prompt, prompt)
        except Exception as e:
            log(f"[{rater}/{case_id}] attempt {attempt+1} call failed: {e}")
            time.sleep(2)
            continue
        total_elapsed += elapsed
        last_raw = raw
        parsed = parse_json_verdict(raw)
        if parsed is not None:
            verdict, reason = parsed
            log(f"[{rater}/{case_id}] attempt {attempt+1} OK ({elapsed:.1f}s): {verdict} :: {reason[:120]}")
            return verdict, reason, total_elapsed
        log(f"[{rater}/{case_id}] attempt {attempt+1} unparseable ({elapsed:.1f}s): {raw[:200]!r}")
        # Stricter retry prompt.
        prompt = (
            user_prompt
            + "\n\nIMPORTANT: Respond with NOTHING but a single JSON object on one line: "
            + '{"verdict":"PASS","reason":"..."} or {"verdict":"FAIL","reason":"..."}. '
            + "No prose, no code fences, no preamble."
        )
    log(f"[{rater}/{case_id}] FAILED after {max_retries+1} attempts; raw={last_raw[:300]!r}")
    return None, last_raw[:500], total_elapsed


def main() -> int:
    # Reset log.
    LOG_PATH.write_text("", encoding="utf-8")

    cases = []
    with CASE_CSV.open("r", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            cases.append(row)

    log(f"Loaded {len(cases)} cases from {CASE_CSV}")

    a_rows = []
    b_rows = []
    a_total_t = 0.0
    b_total_t = 0.0

    for row in cases:
        cid = row["case_id"].strip()
        expected = row["expected"].strip()
        properties = row["properties"].strip()
        img_path = (IMAGES_DIR / f"{cid}.png").resolve()

        # --- Rater A: strict text-only.
        a_user = (
            f"Case ID: {cid}\n"
            f"Expected behavior: {expected}\n"
            f"Properties (must all hold for PASS): {properties}\n\n"
            "Verdict?"
        )
        v_a, r_a, t_a = rate_case("A", RATER_A_SYSTEM, a_user, cid)
        a_total_t += t_a
        a_rows.append({
            "case_id": cid,
            "verdict": v_a or "UNPARSED",
            "reason": r_a,
            "persona": "strict senior QA engineer",
            "modality": "text-only (expected+properties)",
        })

        # --- Rater B: lenient image-only.
        b_user = (
            f"Read the PNG image at {img_path} using your Read tool. "
            "You are reviewing the rendered screen as a design reviewer. "
            "Apply the rubric: PASS for cosmetic-only differences (color, font, spacing); "
            "FAIL only on functionally-observable problems (obscured CTA, clipped content, "
            "missing element, illegible text, accessibility violation). "
            "Do NOT consult any text checklist — judge purely on what you see. "
            "Output exactly one JSON object: "
            '{"verdict":"PASS"|"FAIL","reason":"..."}'
        )
        v_b, r_b, t_b = rate_case("B", RATER_B_SYSTEM, b_user, cid)
        b_total_t += t_b
        b_rows.append({
            "case_id": cid,
            "verdict": v_b or "UNPARSED",
            "reason": r_b,
            "persona": "lenient design reviewer / UI architect",
            "modality": "image-only (PNG)",
        })

    # Write CSVs.
    cols = ["case_id", "verdict", "reason", "persona", "modality"]
    for path, rows in ((RATER_A_OUT, a_rows), (RATER_B_OUT, b_rows)):
        with path.open("w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=cols)
            w.writeheader()
            for r in rows:
                w.writerow(r)
        log(f"Wrote {path} ({len(rows)} rows)")

    log(f"Rater A total time: {a_total_t:.1f}s")
    log(f"Rater B total time: {b_total_t:.1f}s")

    # Save totals for the report.
    (PACKET_DIR / "run_llm_raters_timing.json").write_text(
        json.dumps({"rater_A_seconds": a_total_t, "rater_B_seconds": b_total_t}, indent=2),
        encoding="utf-8",
    )

    return 0


if __name__ == "__main__":
    sys.exit(main())
