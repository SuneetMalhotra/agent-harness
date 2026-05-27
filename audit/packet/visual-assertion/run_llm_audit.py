#!/usr/bin/env python3
"""
run_llm_audit.py — Phase 2 visual-assertion audit orchestrator.

End-to-end:
  1. Drives 48 `claude -p` invocations (2 raters x 24 cases). Sequential, OAuth.
  2. Writes per-rater CSVs INCREMENTALLY (one row per case as soon as that case
     returns) so a crash mid-run preserves partial work.
  3. Computes Cohen's kappa (R_A vs R_B; aggregated vs LLM-judge; each vs KEY).
  4. Computes raw agreement, 2x2 confusion matrices, per-class
     precision/recall (functional vs cosmetic, against aggregated-rater AND
     against KEY ground truth, plus per-rater precision/recall vs KEY).
  5. Generates the audit markdown report with the CRITICAL DISCLOSURE para
     at the very top.

NEVER reads ANTHROPIC_API_KEY. Uses `claude -p` (Claude Max OAuth) only.

Implements Cohen's kappa inline so we do not require sklearn/pandas.
Requires only Python 3 standard library + numpy.

Usage:
    python3 run_llm_audit.py            # full run
    python3 run_llm_audit.py --skip-raters   # rebuild report from existing CSVs
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import subprocess
import sys
import time
from collections import Counter
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np

# ----------------------------- paths ---------------------------------------

PACKET = Path("/Users/suneetmalhotra/work/agent-harness/audit/packet/visual-assertion")
CASE_CSV = PACKET / "case_descriptions.csv"
KEY_CSV = PACKET / "test_cases_KEY.csv"
IMAGES_DIR = PACKET / "images"
RATER_A_OUT = PACKET / "rater_A_strict_text.csv"
RATER_B_OUT = PACKET / "rater_B_lenient_vision.csv"
LOG_PATH = PACKET / "run_llm_audit.log"
TIMING_PATH = PACKET / "run_llm_audit_timing.json"
REPORT_PATH = Path("/Users/suneetmalhotra/work/agent-harness/audit/visual-assertion-results_2026-05-26.md")

# ----------------------------- constants -----------------------------------

VERDICTS = ["PASS", "FAIL"]

RATER_A_SYSTEM = (
    "You are a strict senior QA engineer with 10 years of UI test-review experience. "
    "Apply the rubric strictly: the properties list is authoritative; if every "
    "property holds the verdict is PASS, otherwise FAIL. Be functional over cosmetic. "
    "Do not extend charity to design intent. Output exactly one JSON object on a "
    "single line: {\"verdict\":\"PASS\"|\"FAIL\",\"reason\":\"...\"}. No prose, no "
    "code fences, no preamble."
)

RATER_B_SYSTEM = (
    "You are an experienced UI design reviewer and architect. You emphasize "
    "user-perceived layout integrity. Mark FAIL only when the rendered screen "
    "has a functionally-observable problem: obscured CTA, clipped content, "
    "missing element, illegible text, accessibility violation. Mark PASS for "
    "cosmetic-only differences (colour, font, spacing, palette). Output exactly "
    "one JSON object on a single line: "
    "{\"verdict\":\"PASS\"|\"FAIL\",\"reason\":\"...\"}. No prose, no code "
    "fences, no preamble."
)

CSV_COLS = [
    "case_id", "verdict", "reason", "raw_response",
    "parse_status", "persona", "modality", "runtime_seconds",
]

# ----------------------------- IO helpers ----------------------------------

def log(msg: str) -> None:
    print(msg, flush=True)
    with LOG_PATH.open("a", encoding="utf-8") as f:
        f.write(msg + "\n")


def init_csv(path: Path) -> None:
    with path.open("w", encoding="utf-8", newline="") as f:
        csv.DictWriter(f, fieldnames=CSV_COLS).writeheader()


def append_row(path: Path, row: Dict[str, object]) -> None:
    with path.open("a", encoding="utf-8", newline="") as f:
        csv.DictWriter(f, fieldnames=CSV_COLS).writerow(row)


# ----------------------------- claude driver -------------------------------

JSON_RE = re.compile(r"\{[^{}]*\"verdict\"[^{}]*\"reason\"[^{}]*\}", re.DOTALL)
JSON_RE_REV = re.compile(r"\{[^{}]*\"reason\"[^{}]*\"verdict\"[^{}]*\}", re.DOTALL)


def call_claude(system_prompt: str, user_prompt: str) -> Tuple[str, float]:
    cmd = ["claude", "-p", "--append-system-prompt", system_prompt, user_prompt]
    t0 = time.time()
    res = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    elapsed = time.time() - t0
    if res.returncode != 0:
        raise RuntimeError(f"claude -p exit {res.returncode}: stderr={res.stderr[:500]}")
    return res.stdout.strip(), elapsed


def parse_verdict(raw: str) -> Optional[Tuple[str, str]]:
    s = raw.strip()
    if s.startswith("```"):
        s = re.sub(r"^```(?:json)?\s*", "", s)
        s = re.sub(r"\s*```$", "", s).strip()
    for candidate in (s, *JSON_RE.findall(s), *JSON_RE_REV.findall(s)):
        try:
            obj = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        v = obj.get("verdict")
        r = obj.get("reason", "")
        if isinstance(v, str) and v.strip().upper() in VERDICTS:
            return v.strip().upper(), str(r).strip()
    m = re.search(r"\b(PASS|FAIL)\b", s, re.IGNORECASE)
    if m:
        return m.group(1).upper(), s[:200]
    return None


def rate_case(
    rater: str,
    system_prompt: str,
    user_prompt: str,
    case_id: str,
    max_retries: int = 2,
) -> Dict[str, object]:
    last_raw = ""
    total_elapsed = 0.0
    prompt = user_prompt
    parse_status = "PARSE_ERROR"
    verdict = "PARSE_ERROR"
    reason = ""

    for attempt in range(max_retries + 1):
        try:
            raw, elapsed = call_claude(system_prompt, prompt)
        except Exception as e:
            log(f"[{rater}/{case_id}] attempt {attempt + 1} call failed: {e}")
            time.sleep(2)
            continue
        total_elapsed += elapsed
        last_raw = raw
        parsed = parse_verdict(raw)
        if parsed is not None:
            verdict, reason = parsed
            parse_status = "OK" if attempt == 0 else f"OK_retry_{attempt}"
            log(f"[{rater}/{case_id}] attempt {attempt + 1} OK ({elapsed:.1f}s): {verdict} :: {reason[:120]}")
            break
        log(f"[{rater}/{case_id}] attempt {attempt + 1} unparseable ({elapsed:.1f}s): {raw[:200]!r}")
        prompt = (
            user_prompt
            + "\n\nIMPORTANT: Respond with NOTHING but a single JSON object on one "
            + "line: {\"verdict\":\"PASS\",\"reason\":\"...\"} or "
            + "{\"verdict\":\"FAIL\",\"reason\":\"...\"}. No prose, no code fences, no preamble."
        )
    else:
        log(f"[{rater}/{case_id}] FAILED after {max_retries + 1} attempts; raw={last_raw[:300]!r}")

    return {
        "verdict": verdict,
        "reason": reason or last_raw[:200],
        "raw_response": last_raw[:1000],
        "parse_status": parse_status,
        "runtime_seconds": round(total_elapsed, 2),
    }


# ----------------------------- rater drivers -------------------------------

def run_raters() -> Dict[str, float]:
    LOG_PATH.write_text("", encoding="utf-8")

    cases: List[Dict[str, str]] = []
    with CASE_CSV.open() as f:
        for row in csv.DictReader(f):
            cases.append(row)
    log(f"Loaded {len(cases)} cases from {CASE_CSV}")

    init_csv(RATER_A_OUT)
    init_csv(RATER_B_OUT)

    a_total = 0.0
    b_total = 0.0
    persona_a = "strict senior QA engineer"
    modality_a = "text-only (expected+properties)"
    persona_b = "lenient design reviewer / UI architect"
    modality_b = "image-only (PNG via Read tool)"

    for row in cases:
        cid = row["case_id"].strip()
        expected = row["expected"].strip()
        properties = row["properties"].strip()
        img_path = (IMAGES_DIR / f"{cid}.png").resolve()

        # ---- Rater A: text-only (no image).
        # Frame it so the rater treats `expected` as the actual rendered behavior
        # and the properties as the PASS criteria. This avoids the "I cannot
        # verify without a screenshot" failure mode the prior run hit.
        a_user = (
            f"Case ID: {cid}\n\n"
            f"Rendered behavior (treat this as the authoritative description of what is on screen):\n"
            f"  {expected}\n\n"
            f"Properties that must all hold for PASS:\n"
            f"  {properties}\n\n"
            "Given the rendered behavior above and the properties checklist, output the verdict. "
            "PASS if the rendered behavior satisfies every property. FAIL if the rendered behavior "
            "violates any property. Do not request additional evidence — judge from the description alone."
        )
        res_a = rate_case("A", RATER_A_SYSTEM, a_user, cid)
        a_total += float(res_a["runtime_seconds"])
        append_row(RATER_A_OUT, {
            "case_id": cid,
            "verdict": res_a["verdict"],
            "reason": res_a["reason"],
            "raw_response": res_a["raw_response"],
            "parse_status": res_a["parse_status"],
            "persona": persona_a,
            "modality": modality_a,
            "runtime_seconds": res_a["runtime_seconds"],
        })

        # ---- Rater B: image-only.
        b_user = (
            f"Read the PNG image at {img_path} using your Read tool. "
            "You are reviewing the rendered screen as a design reviewer. "
            "Apply the rubric: PASS for cosmetic-only differences (colour, font, spacing); "
            "FAIL only on functionally-observable problems (obscured CTA, clipped content, "
            "missing element, illegible text, accessibility violation). "
            "Do not consult any text checklist — judge purely on what you see in the image."
        )
        res_b = rate_case("B", RATER_B_SYSTEM, b_user, cid)
        b_total += float(res_b["runtime_seconds"])
        append_row(RATER_B_OUT, {
            "case_id": cid,
            "verdict": res_b["verdict"],
            "reason": res_b["reason"],
            "raw_response": res_b["raw_response"],
            "parse_status": res_b["parse_status"],
            "persona": persona_b,
            "modality": modality_b,
            "runtime_seconds": res_b["runtime_seconds"],
        })

    log(f"Rater A total time: {a_total:.1f}s")
    log(f"Rater B total time: {b_total:.1f}s")

    TIMING_PATH.write_text(json.dumps({
        "rater_A_seconds": a_total,
        "rater_B_seconds": b_total,
    }, indent=2), encoding="utf-8")
    return {"A": a_total, "B": b_total}


# ----------------------------- analysis ------------------------------------

def load_rater(path: Path) -> Dict[str, Dict[str, str]]:
    out: Dict[str, Dict[str, str]] = {}
    with path.open() as f:
        for row in csv.DictReader(f):
            cid = row["case_id"].strip()
            out[cid] = {
                "verdict": row["verdict"].strip().upper(),
                "reason": row["reason"].strip(),
                "parse_status": row.get("parse_status", "").strip(),
                "persona": row.get("persona", "").strip(),
                "modality": row.get("modality", "").strip(),
            }
    return out


def load_key(path: Path) -> Dict[str, Dict[str, str]]:
    out: Dict[str, Dict[str, str]] = {}
    text = path.read_text()
    lines = [ln for ln in text.splitlines() if not ln.lstrip().startswith("#")]
    reader = csv.DictReader(lines)
    for row in reader:
        cid = row["case_id"].strip()
        seeded = row["seeded_label"].strip().lower()
        llm = row["llm_judge_verdict"].strip().upper()
        gt = "FAIL" if seeded == "functional" else "PASS"
        out[cid] = {
            "source_id": row["source_id"].strip(),
            "seeded_label": seeded,
            "ground_truth_verdict": gt,
            "llm_judge_verdict": llm if llm in VERDICTS else "",
            "description": row.get("description", "").strip(),
        }
    return out


def cohen_kappa(r1: List[str], r2: List[str], cats: List[str] = VERDICTS) -> float:
    if not r1:
        return float("nan")
    assert len(r1) == len(r2)
    n = len(r1)
    idx = {c: i for i, c in enumerate(cats)}
    k = len(cats)
    cm_arr = np.zeros((k, k), dtype=float)
    for a, b in zip(r1, r2):
        cm_arr[idx[a], idx[b]] += 1
    po = float(cm_arr.trace()) / n
    row = cm_arr.sum(axis=1) / n
    col = cm_arr.sum(axis=0) / n
    pe = float(np.dot(row, col))
    if pe == 1.0:
        return 1.0
    return (po - pe) / (1.0 - pe)


def cm(pred: List[str], truth: List[str], cats: List[str] = VERDICTS) -> np.ndarray:
    idx = {c: i for i, c in enumerate(cats)}
    k = len(cats)
    m = np.zeros((k, k), dtype=int)
    for a, b in zip(pred, truth):
        m[idx[a], idx[b]] += 1
    return m


def cm_md(m: np.ndarray, row_label: str, col_label: str, cats: List[str] = VERDICTS) -> str:
    header = f"| {row_label} \\ {col_label} | " + " | ".join(cats) + " | row total |"
    sep = "|" + "|".join(["---"] * (len(cats) + 2)) + "|"
    lines = [header, sep]
    for i, c in enumerate(cats):
        row_vals = [str(int(m[i, j])) for j in range(len(cats))]
        lines.append(f"| **{c}** | " + " | ".join(row_vals) + f" | {int(m[i].sum())} |")
    col_vals = [str(int(m[:, j].sum())) for j in range(len(cats))]
    lines.append("| **col total** | " + " | ".join(col_vals) + f" | {int(m.sum())} |")
    return "\n".join(lines)


def pr(pred: List[str], truth: List[str], pos: str = "FAIL") -> Dict[str, float]:
    tp = fp = fn = tn = 0
    for p, t in zip(pred, truth):
        pp, tt = (p == pos), (t == pos)
        if pp and tt: tp += 1
        elif pp and not tt: fp += 1
        elif not pp and tt: fn += 1
        else: tn += 1
    precision = tp / (tp + fp) if (tp + fp) else float("nan")
    recall = tp / (tp + fn) if (tp + fn) else float("nan")
    accuracy = (tp + tn) / len(pred) if pred else float("nan")
    return {"precision": precision, "recall": recall, "accuracy": accuracy,
            "tp": tp, "fp": fp, "fn": fn, "tn": tn, "n": len(pred)}


def landis_koch(k: float) -> str:
    if np.isnan(k): return "n/a"
    if k < 0.0: return "less than chance"
    if k < 0.20: return "poor"
    if k < 0.40: return "fair"
    if k < 0.60: return "moderate"
    if k < 0.80: return "substantial"
    return "almost perfect"


def aggregate(a: Dict[str, Dict[str, str]], b: Dict[str, Dict[str, str]], cases: List[str]) -> Dict[str, str]:
    out = {}
    for c in cases:
        va = a[c]["verdict"]; vb = b[c]["verdict"]
        if va == vb:
            out[c] = va
        else:
            out[c] = "FAIL"  # protocol tiebreak: 1-1 -> FAIL (conservative)
    return out


# ----------------------------- report --------------------------------------

DISCLOSURE = (
    "> **CRITICAL DISCLOSURE: Both raters are LLM-as-rater (Claude Sonnet 4.6 via "
    "OAuth), differentiated on persona (strict QA / lenient design reviewer) AND "
    "input modality (text+properties only / image-only). The Cohen's kappa reported "
    "here measures cross-modality + cross-persona divergence within one model "
    "family; it is NOT a substitute for inter-human-rater agreement. This execution "
    "serves as a methodological placeholder pending recruitment of independent "
    "human raters. The audit packet at `audit/packet/visual-assertion/` ships the "
    "protocol, blinded images, and rater template needed for the human audit when "
    "raters are recruited. Per Section 3.2 of the manuscript, this audit's findings "
    "cannot escape the same-model-family circularity the paper itself names.**"
)


def build_report() -> Dict[str, float]:
    a = load_rater(RATER_A_OUT)
    b = load_rater(RATER_B_OUT)
    key = load_key(KEY_CSV)

    cases = sorted(set(a) & set(b) & set(key))
    unparsed_a = [c for c in cases if a[c]["verdict"] not in VERDICTS]
    unparsed_b = [c for c in cases if b[c]["verdict"] not in VERDICTS]
    usable = [c for c in cases
              if c not in unparsed_a
              and c not in unparsed_b
              and key[c]["llm_judge_verdict"] in VERDICTS]

    a_v = [a[c]["verdict"] for c in usable]
    b_v = [b[c]["verdict"] for c in usable]
    llm_v = [key[c]["llm_judge_verdict"] for c in usable]
    gt_v = [key[c]["ground_truth_verdict"] for c in usable]

    agg = aggregate(a, b, usable)
    agg_v = [agg[c] for c in usable]

    k_ab = cohen_kappa(a_v, b_v)
    k_agg_llm = cohen_kappa(agg_v, llm_v)
    k_a_gt = cohen_kappa(a_v, gt_v)
    k_b_gt = cohen_kappa(b_v, gt_v)
    k_agg_gt = cohen_kappa(agg_v, gt_v)
    k_llm_gt = cohen_kappa(llm_v, gt_v)

    raw_a_llm = sum(1 for x, y in zip(a_v, llm_v) if x == y) / len(usable) if usable else float("nan")
    raw_b_llm = sum(1 for x, y in zip(b_v, llm_v) if x == y) / len(usable) if usable else float("nan")
    raw_agg_llm = sum(1 for x, y in zip(agg_v, llm_v) if x == y) / len(usable) if usable else float("nan")
    raw_a_gt = sum(1 for x, y in zip(a_v, gt_v) if x == y) / len(usable) if usable else float("nan")
    raw_b_gt = sum(1 for x, y in zip(b_v, gt_v) if x == y) / len(usable) if usable else float("nan")
    raw_agg_gt = sum(1 for x, y in zip(agg_v, gt_v) if x == y) / len(usable) if usable else float("nan")
    raw_llm_gt = sum(1 for x, y in zip(llm_v, gt_v) if x == y) / len(usable) if usable else float("nan")

    func_idx = [i for i, c in enumerate(usable) if key[c]["seeded_label"] == "functional"]
    cosm_idx = [i for i, c in enumerate(usable) if key[c]["seeded_label"] == "cosmetic"]

    def sl(arr, ids): return [arr[i] for i in ids]

    pr_llm_agg_func = pr(sl(llm_v, func_idx), sl(agg_v, func_idx))
    pr_llm_agg_cosm = pr(sl(llm_v, cosm_idx), sl(agg_v, cosm_idx))
    pr_llm_gt_func = pr(sl(llm_v, func_idx), sl(gt_v, func_idx))
    pr_llm_gt_cosm = pr(sl(llm_v, cosm_idx), sl(gt_v, cosm_idx))
    pr_a_gt_func = pr(sl(a_v, func_idx), sl(gt_v, func_idx))
    pr_a_gt_cosm = pr(sl(a_v, cosm_idx), sl(gt_v, cosm_idx))
    pr_b_gt_func = pr(sl(b_v, func_idx), sl(gt_v, func_idx))
    pr_b_gt_cosm = pr(sl(b_v, cosm_idx), sl(gt_v, cosm_idx))

    cm_ab = cm(a_v, b_v)
    cm_agg_llm = cm(agg_v, llm_v)

    timing = {"rater_A_seconds": None, "rater_B_seconds": None}
    if TIMING_PATH.exists():
        timing = json.loads(TIMING_PATH.read_text())

    # ---- compose report ----
    out: List[str] = []
    out.append("# Visual-Assertion Audit Results (Phase 2 — LLM-as-rater methodological placeholder)")
    out.append("")
    out.append(DISCLOSURE)
    out.append("")
    out.append("---")
    out.append("")
    out.append("**Date:** 2026-05-26")
    out.append("")
    out.append("**Raters:**")
    out.append("- **R_A (strict-text):** Claude Sonnet 4.6 via `claude -p` OAuth. Persona = strict senior QA engineer. Modality = text-only (`expected` behavior + `properties` checklist; no image). Rubric applied strictly; properties authoritative.")
    out.append("- **R_B (lenient-vision):** Claude Sonnet 4.6 via `claude -p` OAuth. Persona = lenient design reviewer / UI architect. Modality = image-only (PNG via Read tool; no text/properties shown). Rubric applied with cosmetic-charity; FAIL only on functionally-observable defects.")
    out.append("")
    ta = f"{timing['rater_A_seconds']:.1f}s" if timing.get("rater_A_seconds") is not None else "n/a"
    tb = f"{timing['rater_B_seconds']:.1f}s" if timing.get("rater_B_seconds") is not None else "n/a"
    out.append(f"**Execution time:** R_A = {ta}; R_B = {tb} (sequential, OAuth, 24 cases each).")
    out.append("")
    if unparsed_a or unparsed_b:
        out.append(f"**Parse failures:** R_A unparsed = {unparsed_a or 'none'}; R_B unparsed = {unparsed_b or 'none'}. Excluded from metrics.")
    else:
        out.append("**Parse failures:** none. All 24 cases produced parseable verdicts from both raters.")
    out.append("")
    out.append(f"**Cases scored:** N = {len(usable)} (intersection of R_A parseable, R_B parseable, KEY having an LLM-judge verdict).")
    out.append("")
    out.append("---")
    out.append("")
    out.append("## Headline numbers")
    out.append("")
    out.append("| Metric | Value | Landis & Koch banding |")
    out.append("|---|---:|---|")
    out.append(f"| Cohen's kappa (R_A vs R_B) | **{k_ab:.3f}** | {landis_koch(k_ab)} |")
    out.append(f"| Cohen's kappa (aggregated rater vs LLM-judge) | **{k_agg_llm:.3f}** | {landis_koch(k_agg_llm)} |")
    out.append(f"| Cohen's kappa (R_A vs seeded KEY) | {k_a_gt:.3f} | {landis_koch(k_a_gt)} |")
    out.append(f"| Cohen's kappa (R_B vs seeded KEY) | {k_b_gt:.3f} | {landis_koch(k_b_gt)} |")
    out.append(f"| Cohen's kappa (aggregated rater vs seeded KEY) | {k_agg_gt:.3f} | {landis_koch(k_agg_gt)} |")
    out.append(f"| Cohen's kappa (LLM-judge vs seeded KEY) | {k_llm_gt:.3f} | {landis_koch(k_llm_gt)} |")
    out.append("")
    out.append("| Raw-agreement metric | Value |")
    out.append("|---|---:|")
    out.append(f"| R_A vs LLM-judge | {raw_a_llm * 100:.1f}% |")
    out.append(f"| R_B vs LLM-judge | {raw_b_llm * 100:.1f}% |")
    out.append(f"| Aggregated rater vs LLM-judge | {raw_agg_llm * 100:.1f}% |")
    out.append(f"| R_A vs seeded KEY | {raw_a_gt * 100:.1f}% |")
    out.append(f"| R_B vs seeded KEY | {raw_b_gt * 100:.1f}% |")
    out.append(f"| Aggregated rater vs seeded KEY | {raw_agg_gt * 100:.1f}% |")
    out.append(f"| LLM-judge vs seeded KEY | {raw_llm_gt * 100:.1f}% |")
    out.append("")
    out.append("---")
    out.append("")
    out.append("## 24-case verdict table")
    out.append("")
    out.append("| TC | source_id | seeded | KEY GT | LLM-judge | R_A verdict | R_A reason | R_B verdict | R_B reason |")
    out.append("|---|---|---|---|---|---|---|---|---|")
    def clip(s: str, n: int = 110) -> str:
        s = (s or "").replace("|", "/").replace("\n", " ").strip()
        return (s[: n - 1] + "...") if len(s) > n else s
    for c in cases:
        k = key[c]; ra = a[c]; rb = b[c]
        out.append(
            f"| {c} | {k['source_id']} | {k['seeded_label']} | {k['ground_truth_verdict']} | "
            f"{k['llm_judge_verdict'] or 'n/a'} | {ra['verdict']} | {clip(ra['reason'])} | "
            f"{rb['verdict']} | {clip(rb['reason'])} |"
        )
    out.append("")
    out.append("---")
    out.append("")
    out.append("## Confusion matrices")
    out.append("")
    out.append("### R_A vs R_B")
    out.append("")
    out.append(cm_md(cm_ab, "R_A", "R_B"))
    out.append("")
    out.append("### Aggregated rater vs LLM-judge")
    out.append("")
    out.append(cm_md(cm_agg_llm, "AGG", "LLM"))
    out.append("")
    out.append("---")
    out.append("")
    out.append("## LLM-judge precision / recall by subset")
    out.append("")
    out.append("Positive class = FAIL (the visual-assertion service's job is to flag failures).")
    out.append("")
    out.append("### Against aggregated-rater verdict")
    out.append("")
    out.append("| Subset | N | precision | recall | accuracy | TP | FP | FN | TN |")
    out.append("|---|---:|---:|---:|---:|---:|---:|---:|---:|")
    for label, m in (("functional", pr_llm_agg_func), ("cosmetic", pr_llm_agg_cosm)):
        out.append(f"| {label} | {m['n']} | {m['precision']:.3f} | {m['recall']:.3f} | {m['accuracy']:.3f} | {m['tp']} | {m['fp']} | {m['fn']} | {m['tn']} |")
    out.append("")
    out.append("### Against seeded KEY ground truth")
    out.append("")
    out.append("| Subset | N | precision | recall | accuracy | TP | FP | FN | TN |")
    out.append("|---|---:|---:|---:|---:|---:|---:|---:|---:|")
    for label, m in (("functional", pr_llm_gt_func), ("cosmetic", pr_llm_gt_cosm)):
        out.append(f"| {label} | {m['n']} | {m['precision']:.3f} | {m['recall']:.3f} | {m['accuracy']:.3f} | {m['tp']} | {m['fp']} | {m['fn']} | {m['tn']} |")
    out.append("")
    out.append("---")
    out.append("")
    out.append("## Per-rater precision / recall against seeded KEY ground truth")
    out.append("")
    out.append("Sanity-check whether either rater is systematically wrong against the seeded labels.")
    out.append("")
    out.append("### R_A (strict-text)")
    out.append("")
    out.append("| Subset | N | precision | recall | accuracy | TP | FP | FN | TN |")
    out.append("|---|---:|---:|---:|---:|---:|---:|---:|---:|")
    for label, m in (("functional", pr_a_gt_func), ("cosmetic", pr_a_gt_cosm)):
        out.append(f"| {label} | {m['n']} | {m['precision']:.3f} | {m['recall']:.3f} | {m['accuracy']:.3f} | {m['tp']} | {m['fp']} | {m['fn']} | {m['tn']} |")
    out.append("")
    out.append("### R_B (lenient-vision)")
    out.append("")
    out.append("| Subset | N | precision | recall | accuracy | TP | FP | FN | TN |")
    out.append("|---|---:|---:|---:|---:|---:|---:|---:|---:|")
    for label, m in (("functional", pr_b_gt_func), ("cosmetic", pr_b_gt_cosm)):
        out.append(f"| {label} | {m['n']} | {m['precision']:.3f} | {m['recall']:.3f} | {m['accuracy']:.3f} | {m['tp']} | {m['fp']} | {m['fn']} | {m['tn']} |")
    out.append("")
    out.append("---")
    out.append("")
    out.append("## Verdict distributions (sanity check)")
    out.append("")
    def dist(vs: List[str]) -> str:
        c = Counter(vs); tot = sum(c.values()) or 1
        return ", ".join(f"{k}: {c.get(k, 0)} ({100 * c.get(k, 0) / tot:.0f}%)" for k in VERDICTS)
    out.append(f"- R_A: {dist(a_v)}")
    out.append(f"- R_B: {dist(b_v)}")
    out.append(f"- Aggregated rater (1-1 -> FAIL): {dist(agg_v)}")
    out.append(f"- LLM-judge: {dist(llm_v)}")
    out.append(f"- Seeded KEY ground truth: {dist(gt_v)}")
    out.append("")
    out.append("---")
    out.append("")
    out.append("## Recommendation (per protocol Output item 8)")
    out.append("")
    band_ab = landis_koch(k_ab)
    band_agg = landis_koch(k_agg_llm)
    out.append(
        f"Aggregated-rater-vs-LLM-judge kappa = **{k_agg_llm:.3f}** ({band_agg}); "
        f"inter-rater kappa (R_A vs R_B) = **{k_ab:.3f}** ({band_ab}). "
        "Under the protocol's Landis & Koch banding (§ Inter-rater reliability metric): "
        "kappa >= 0.60 justifies citing the §6 visual-assertion precision/recall as "
        "validation-scale evidence; 0.40-0.60 justifies citation with an explicit kappa "
        "disclosure; 0.20-0.40 caps the claims at bounded estimates with uncertainty; "
        "< 0.20 requires abandoning the cited claims."
    )
    out.append("")
    out.append(
        "**Critical caveat:** both raters are the same model family driven by different "
        "prompts and modalities, so neither the inter-rater kappa nor the aggregated-vs-LLM "
        "kappa is an unbiased substitute for human-vs-human agreement. The numbers above "
        "should be read as an upper bound on the within-model self-consistency of Claude "
        "under prompt and modality perturbation, NOT as external validation. The §6 numbers "
        "in the manuscript must continue to carry the §6.1 reflexive-correctness caveat "
        "verbatim. The audit packet at `audit/packet/visual-assertion/` (blinded images, "
        "rater template, instructions) must be sent to independent human raters before the "
        "§6 precision/recall numbers can be promoted from `model-reported` to "
        "`validation-scale evidence`."
    )
    out.append("")
    out.append("---")
    out.append("")
    out.append("## Caveats")
    out.append("")
    out.append("- **Same-model rater problem.** R_A and R_B share the underlying Claude Sonnet 4.6 weights. Error modes are correlated by construction; the kappa here likely *overestimates* true inter-rater agreement when measured against independent humans, but it *meaningfully measures* the prompt-and-modality slice the experiment names.")
    out.append("- **N = 24.** 95% CI on a binary-class kappa at this sample size is roughly +/- 0.15 to +/- 0.20. Treat point estimates with the corresponding uncertainty.")
    out.append("- **Tiebreak conservatism.** 1-1 tie -> FAIL aggregation biases the aggregated-rater verdict toward FAIL. This inflates aggregated-vs-LLM agreement on shared-FAIL cases and depresses it on cases where the LLM PASSes but one rater FAILs.")
    out.append("- **Modality asymmetry.** R_B is image-only; for subtle functional defects that are not visually evident (focus indicator absent, label association severed, sub-24px touch targets not measured) it lacks the data to FAIL where R_A correctly FAILs. R_A is text-only; for visually-evident layout corruption (overlapping rows, occluding overlays) it lacks the data to FAIL where R_B correctly FAILs. This asymmetry is intrinsic to the chosen design and is precisely what the inter-rater kappa is measuring.")
    out.append("- **One link in the chain.** This audit validates the *judging* step (rater-vs-LLM verdict on visual assertions). It does not validate the corpus design or the underlying test-case generation; those remain same-model.")
    out.append("")

    REPORT_PATH.write_text("\n".join(out) + "\n", encoding="utf-8")
    log(f"Wrote report to {REPORT_PATH}")
    log(f"  k(R_A, R_B) = {k_ab:.3f} ({band_ab})")
    log(f"  k(agg, LLM) = {k_agg_llm:.3f} ({band_agg})")
    log(f"  raw R_A vs LLM = {raw_a_llm * 100:.1f}%, R_B vs LLM = {raw_b_llm * 100:.1f}%")

    return {
        "k_ab": k_ab,
        "k_agg_llm": k_agg_llm,
        "k_a_gt": k_a_gt,
        "k_b_gt": k_b_gt,
        "k_llm_gt": k_llm_gt,
        "raw_a_llm": raw_a_llm,
        "raw_b_llm": raw_b_llm,
        "raw_agg_llm": raw_agg_llm,
        "raw_a_gt": raw_a_gt,
        "raw_b_gt": raw_b_gt,
        "raw_llm_gt": raw_llm_gt,
        "n_usable": float(len(usable)),
        "n_unparsed_a": float(len(unparsed_a)),
        "n_unparsed_b": float(len(unparsed_b)),
        "pr_llm_agg_func_p": pr_llm_agg_func["precision"],
        "pr_llm_agg_func_r": pr_llm_agg_func["recall"],
        "pr_llm_agg_cosm_p": pr_llm_agg_cosm["precision"],
        "pr_llm_agg_cosm_r": pr_llm_agg_cosm["recall"],
        "pr_llm_gt_func_p": pr_llm_gt_func["precision"],
        "pr_llm_gt_func_r": pr_llm_gt_func["recall"],
        "pr_llm_gt_cosm_p": pr_llm_gt_cosm["precision"],
        "pr_llm_gt_cosm_r": pr_llm_gt_cosm["recall"],
        "pr_a_gt_func_p": pr_a_gt_func["precision"],
        "pr_a_gt_func_r": pr_a_gt_func["recall"],
        "pr_a_gt_cosm_p": pr_a_gt_cosm["precision"],
        "pr_a_gt_cosm_r": pr_a_gt_cosm["recall"],
        "pr_b_gt_func_p": pr_b_gt_func["precision"],
        "pr_b_gt_func_r": pr_b_gt_func["recall"],
        "pr_b_gt_cosm_p": pr_b_gt_cosm["precision"],
        "pr_b_gt_cosm_r": pr_b_gt_cosm["recall"],
    }


# ----------------------------- main ----------------------------------------

def main() -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--skip-raters", action="store_true",
                   help="Skip the rating phase; only rebuild the report from existing CSVs.")
    args = p.parse_args()

    if not args.skip_raters:
        run_raters()
    else:
        log("Skipping rater phase (--skip-raters). Using existing CSVs.")

    metrics = build_report()
    # Print a compact final summary to stdout for the orchestrator scraper.
    print("=" * 60)
    print("AUDIT METRICS SUMMARY")
    print("=" * 60)
    for k, v in metrics.items():
        if isinstance(v, float):
            print(f"{k} = {v:.4f}")
        else:
            print(f"{k} = {v}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
