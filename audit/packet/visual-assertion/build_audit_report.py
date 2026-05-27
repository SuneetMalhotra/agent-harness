#!/usr/bin/env python3
"""
build_audit_report.py — Compose the Phase 2 visual-assertion audit report.

Reads:
  rater_A_strict_text.csv
  rater_B_lenient_vision.csv
  test_cases_KEY.csv
  case_descriptions.csv
  run_llm_raters_timing.json  (optional — if missing, timings omitted)

Computes:
  - Cohen's kappa (R_A vs R_B)
  - Raw agreement: R_A vs LLM-judge, R_B vs LLM-judge
  - Aggregated (majority, 1-1 -> FAIL) human verdict vs LLM-judge kappa
  - 2x2 confusion matrices
  - Per-class precision/recall for LLM-judge against:
      * aggregated human verdict (functional vs cosmetic subsets)
      * seeded KEY ground truth (functional vs cosmetic subsets)
  - Per-class precision/recall for EACH rater against the seeded KEY ground truth

Writes:
  /Users/suneetmalhotra/work/agent-harness/audit/visual-assertion-results_2026-05-26.md
"""

from __future__ import annotations

import csv
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np

PACKET = Path("/Users/suneetmalhotra/work/agent-harness/audit/packet/visual-assertion")
OUT_PATH = Path("/Users/suneetmalhotra/work/agent-harness/audit/visual-assertion-results_2026-05-26.md")

VERDICTS = ["PASS", "FAIL"]


def load_rater(path: Path) -> Dict[str, Dict[str, str]]:
    out: Dict[str, Dict[str, str]] = {}
    with path.open() as f:
        for row in csv.DictReader(f):
            cid = row["case_id"].strip()
            out[cid] = {
                "verdict": row["verdict"].strip().upper(),
                "reason": row["reason"].strip(),
                "persona": row["persona"].strip(),
                "modality": row["modality"].strip(),
            }
    return out


def load_key(path: Path) -> Dict[str, Dict[str, str]]:
    out: Dict[str, Dict[str, str]] = {}
    text = path.read_text()
    # Skip leading '#' lines if any.
    lines = [ln for ln in text.splitlines() if not ln.lstrip().startswith("#")]
    reader = csv.DictReader(lines)
    for row in reader:
        cid = row["case_id"].strip()
        seeded = row["seeded_label"].strip().lower()
        llm = row["llm_judge_verdict"].strip().upper()
        # KEY also stores ground-truth verdict implicitly: functional -> FAIL, cosmetic -> PASS.
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
    assert len(r1) == len(r2) and len(r1) > 0
    n = len(r1)
    idx = {c: i for i, c in enumerate(cats)}
    k = len(cats)
    cm = np.zeros((k, k))
    for a, b in zip(r1, r2):
        cm[idx[a], idx[b]] += 1
    po = float(cm.trace()) / n
    row = cm.sum(axis=1) / n
    col = cm.sum(axis=0) / n
    pe = float(np.dot(row, col))
    if pe == 1.0:
        return 1.0
    return (po - pe) / (1.0 - pe)


def cm(pred: List[str], truth: List[str], cats: List[str] = VERDICTS) -> np.ndarray:
    """rows = pred (or first arg), cols = truth (or second)."""
    idx = {c: i for i, c in enumerate(cats)}
    k = len(cats)
    m = np.zeros((k, k), dtype=int)
    for a, b in zip(pred, truth):
        m[idx[a], idx[b]] += 1
    return m


def cm_md(m: np.ndarray, row_label: str, col_label: str, cats: List[str] = VERDICTS) -> str:
    header = f"| {row_label} \\\\ {col_label} | " + " | ".join(cats) + " | row total |"
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
            out[c] = "FAIL"  # protocol tiebreak
    return out


def main() -> int:
    a = load_rater(PACKET / "rater_A_strict_text.csv")
    b = load_rater(PACKET / "rater_B_lenient_vision.csv")
    key = load_key(PACKET / "test_cases_KEY.csv")

    cases = sorted(set(a) & set(b) & set(key))
    unparsed_a = [c for c in cases if a[c]["verdict"] not in VERDICTS]
    unparsed_b = [c for c in cases if b[c]["verdict"] not in VERDICTS]
    # For metrics, only use cases where both raters AND KEY produced a verdict.
    usable = [c for c in cases if c not in unparsed_a and c not in unparsed_b
              and key[c]["llm_judge_verdict"] in VERDICTS]

    a_v = [a[c]["verdict"] for c in usable]
    b_v = [b[c]["verdict"] for c in usable]
    llm_v = [key[c]["llm_judge_verdict"] for c in usable]
    gt_v = [key[c]["ground_truth_verdict"] for c in usable]

    # Aggregate human verdict (majority; 1-1 -> FAIL).
    agg = aggregate(a, b, usable)
    agg_v = [agg[c] for c in usable]

    # --- Inter-rater
    k_ab = cohen_kappa(a_v, b_v)
    # --- Aggregate vs LLM judge
    k_agg_llm = cohen_kappa(agg_v, llm_v)
    # --- Raw agreement
    raw_a_llm = sum(1 for x, y in zip(a_v, llm_v) if x == y) / len(usable)
    raw_b_llm = sum(1 for x, y in zip(b_v, llm_v) if x == y) / len(usable)
    raw_agg_llm = sum(1 for x, y in zip(agg_v, llm_v) if x == y) / len(usable)
    raw_a_gt = sum(1 for x, y in zip(a_v, gt_v) if x == y) / len(usable)
    raw_b_gt = sum(1 for x, y in zip(b_v, gt_v) if x == y) / len(usable)
    raw_agg_gt = sum(1 for x, y in zip(agg_v, gt_v) if x == y) / len(usable)
    raw_llm_gt = sum(1 for x, y in zip(llm_v, gt_v) if x == y) / len(usable)
    k_a_gt = cohen_kappa(a_v, gt_v)
    k_b_gt = cohen_kappa(b_v, gt_v)
    k_llm_gt = cohen_kappa(llm_v, gt_v)

    # --- Per-subset metrics
    def subset(label: str) -> List[int]:
        return [i for i, c in enumerate(usable) if key[c]["seeded_label"] == label]

    func_idx = subset("functional")
    cosm_idx = subset("cosmetic")

    def slice_(arr: List[str], idxs: List[int]) -> List[str]:
        return [arr[i] for i in idxs]

    # LLM vs aggregated human, per-subset.
    pr_llm_agg_func = pr(slice_(llm_v, func_idx), slice_(agg_v, func_idx))
    pr_llm_agg_cosm = pr(slice_(llm_v, cosm_idx), slice_(agg_v, cosm_idx))
    # LLM vs seeded KEY ground truth, per-subset.
    pr_llm_gt_func = pr(slice_(llm_v, func_idx), slice_(gt_v, func_idx))
    pr_llm_gt_cosm = pr(slice_(llm_v, cosm_idx), slice_(gt_v, cosm_idx))
    # Each rater vs seeded KEY, per-subset.
    pr_a_gt_func = pr(slice_(a_v, func_idx), slice_(gt_v, func_idx))
    pr_a_gt_cosm = pr(slice_(a_v, cosm_idx), slice_(gt_v, cosm_idx))
    pr_b_gt_func = pr(slice_(b_v, func_idx), slice_(gt_v, func_idx))
    pr_b_gt_cosm = pr(slice_(b_v, cosm_idx), slice_(gt_v, cosm_idx))

    # Confusion matrices
    cm_ab = cm(a_v, b_v)
    cm_agg_llm = cm(agg_v, llm_v)

    # Timing
    timing_path = PACKET / "run_llm_raters_timing.json"
    if timing_path.exists():
        timing = json.loads(timing_path.read_text())
    else:
        timing = {"rater_A_seconds": None, "rater_B_seconds": None}

    # --- Compose report
    out: List[str] = []
    out.append("# Visual-Assertion Audit Results (Phase 2, LLM-as-rater placeholder)")
    out.append("")
    out.append("**Date:** 2026-05-26")
    out.append("")
    out.append("**Rater identifiers:**")
    out.append("- **R_A (strict-text):** Claude Sonnet 4.6 via `claude -p` OAuth, persona = strict senior QA engineer, modality = text-only (expected behavior + properties checklist), no image input.")
    out.append("- **R_B (lenient-vision):** Claude Sonnet 4.6 via `claude -p` OAuth, persona = lenient design reviewer / UI architect, modality = image-only (PNG via Read tool), no text/properties shown.")
    out.append("")
    ta = f"{timing['rater_A_seconds']:.1f}s" if timing.get("rater_A_seconds") is not None else "n/a"
    tb = f"{timing['rater_B_seconds']:.1f}s" if timing.get("rater_B_seconds") is not None else "n/a"
    out.append(f"**Execution time:** R_A = {ta} across 24 cases; R_B = {tb} across 24 cases.")
    out.append("")
    if unparsed_a or unparsed_b:
        out.append(f"**Parse failures:** R_A unparsed = {unparsed_a or 'none'}; R_B unparsed = {unparsed_b or 'none'}. These cases are excluded from metrics.")
    else:
        out.append("**Parse failures:** none. All 24 cases produced parseable verdicts from both raters.")
    out.append("")
    out.append(f"**Cases scored:** N = {len(usable)} (intersection of R_A, R_B, and LLM-judge having parseable verdicts).")
    out.append("")
    out.append("---")
    out.append("")
    out.append("## CRITICAL DISCLOSURE")
    out.append("")
    out.append("> Both raters are LLM-as-rater (Claude Sonnet 4.6 via OAuth), differentiated on persona (strict QA / lenient design) AND input modality (text-only / image-only). The kappa reported here measures prompt+modality divergence within one model family; it is NOT a substitute for inter-human-rater agreement. This audit serves as a methodological placeholder pending recruitment of independent human raters; the audit packet at `audit/packet/visual-assertion/` ships the protocol, blinded packet, and rater template needed for the human audit when raters are recruited.")
    out.append("")
    out.append("---")
    out.append("")
    out.append("## Headline numbers")
    out.append("")
    out.append("| Metric | Value | Landis & Koch banding |")
    out.append("|---|---:|---|")
    out.append(f"| Cohen's kappa (R_A vs R_B) | **{k_ab:.3f}** | {landis_koch(k_ab)} |")
    out.append(f"| Cohen's kappa (aggregated human vs LLM-judge) | **{k_agg_llm:.3f}** | {landis_koch(k_agg_llm)} |")
    out.append(f"| Cohen's kappa (R_A vs seeded KEY) | {k_a_gt:.3f} | {landis_koch(k_a_gt)} |")
    out.append(f"| Cohen's kappa (R_B vs seeded KEY) | {k_b_gt:.3f} | {landis_koch(k_b_gt)} |")
    out.append(f"| Cohen's kappa (LLM-judge vs seeded KEY) | {k_llm_gt:.3f} | {landis_koch(k_llm_gt)} |")
    out.append(f"| Raw agreement R_A vs LLM-judge | {raw_a_llm*100:.1f}% | N = {len(usable)} |")
    out.append(f"| Raw agreement R_B vs LLM-judge | {raw_b_llm*100:.1f}% | N = {len(usable)} |")
    out.append(f"| Raw agreement aggregated-human vs LLM-judge | {raw_agg_llm*100:.1f}% | N = {len(usable)} |")
    out.append(f"| Raw agreement R_A vs seeded KEY | {raw_a_gt*100:.1f}% | |")
    out.append(f"| Raw agreement R_B vs seeded KEY | {raw_b_gt*100:.1f}% | |")
    out.append(f"| Raw agreement aggregated-human vs seeded KEY | {raw_agg_gt*100:.1f}% | |")
    out.append(f"| Raw agreement LLM-judge vs seeded KEY | {raw_llm_gt*100:.1f}% | |")
    out.append("")
    out.append("---")
    out.append("")
    out.append("## 24-case verdict table")
    out.append("")
    out.append("| TC | source | seeded | KEY (GT) | LLM-judge | R_A verdict | R_A reason | R_B verdict | R_B reason |")
    out.append("|---|---|---|---|---|---|---|---|---|")
    for c in cases:
        k = key[c]
        ra = a[c]; rb = b[c]
        def clip(s: str, n: int = 110) -> str:
            s = s.replace("|", "/").replace("\n", " ")
            return (s[: n - 1] + "...") if len(s) > n else s
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
    out.append("### Aggregated-human vs LLM-judge")
    out.append("")
    out.append(cm_md(cm_agg_llm, "AGG", "LLM"))
    out.append("")
    out.append("---")
    out.append("")
    out.append("## LLM-judge precision / recall by subset")
    out.append("")
    out.append("Positive class = FAIL (the visual-assertion service's job is to flag failures).")
    out.append("")
    out.append("### Against aggregated-human verdict")
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
    out.append("Lets us see whether one rater is systematically wrong vs the seeded labels.")
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
        c = Counter(vs); tot = sum(c.values())
        return ", ".join(f"{k}: {c.get(k,0)} ({100*c.get(k,0)/tot:.0f}%)" for k in VERDICTS)
    out.append(f"- R_A: {dist(a_v)}")
    out.append(f"- R_B: {dist(b_v)}")
    out.append(f"- Aggregated-human (R_A or R_B FAIL -> FAIL): {dist(agg_v)}")
    out.append(f"- LLM-judge: {dist(llm_v)}")
    out.append(f"- Seeded KEY ground truth: {dist(gt_v)}")
    out.append("")
    out.append("---")
    out.append("")
    out.append("## Recommendation (per protocol Output item 8)")
    out.append("")
    # Auto-derive the recommendation band from k_agg_llm and k_ab.
    band_ab = landis_koch(k_ab)
    band_agg = landis_koch(k_agg_llm)
    out.append(f"The aggregated-human-vs-LLM-judge kappa is **{k_agg_llm:.3f}** ({band_agg}); inter-rater kappa is **{k_ab:.3f}** ({band_ab}). Under the protocol's banding (§ Inter-rater reliability metric), kappa in the substantial range (>= 0.60) would justify citing the §6 visual-assertion precision/recall as validation-scale evidence; moderate (0.40-0.60) justifies citation with explicit kappa disclosure; fair (0.20-0.40) caps the claims at bounded estimates with explicit uncertainty; poor (< 0.20) requires abandoning the cited claims.")
    out.append("")
    out.append("**HOWEVER**, because both raters here are the same model family driven by different prompts and modalities, neither the inter-rater kappa nor the aggregated-vs-LLM kappa is an unbiased substitute for human-vs-human agreement. The headline kappa numbers in this report should be read as an upper bound on the within-model self-consistency of Claude under prompt/modality perturbation, not as external validation. The §6 numbers in the manuscript should continue to carry the §6.1 reflexive-correctness caveat verbatim, and the audit packet must be sent to independent human raters before the §6 precision/recall numbers can be promoted from `model-reported` to `validation-scale evidence`.")
    out.append("")
    out.append("---")
    out.append("")
    out.append("## Caveats and weird observations")
    out.append("")
    out.append("- **Same-model rater problem.** R_A and R_B share the underlying Claude Sonnet 4.6 weights. Independent error modes are partly correlated by construction, so the kappa here likely *overestimates* true inter-rater agreement when measured against independent humans, but *underestimates* the prompt-and-modality slice it actually measures.")
    out.append("- **N = 24.** 95% CI on a binary-class kappa at this sample size is roughly +/- 0.15 to +/- 0.20. Treat point estimates accordingly.")
    out.append("- **Tiebreak conservatism.** The 1-1 tie -> FAIL aggregation rule biases the aggregated-human verdict toward FAIL, which inflates aggregated-human/LLM agreement when both agree on FAILs and lowers it when the LLM passes a case that one rater fails.")
    out.append("- **Class imbalance in modality.** Rater B sees no checklist, so on functional-defect images where the defect is subtle (e.g., focus indicator removed, label association severed, accessibility-minimum touch target violations under 24px) it has no programmatic way to detect the violation and may rate PASS where R_A correctly FAILs. This is a known limitation of image-only review and an expected source of disagreement; report it transparently in the per-rater subset metrics above.")
    out.append("")

    OUT_PATH.write_text("\n".join(out), encoding="utf-8")
    print(f"Wrote {OUT_PATH}")
    print(f"  k(R_A, R_B) = {k_ab:.3f} ({band_ab})")
    print(f"  k(agg, LLM) = {k_agg_llm:.3f} ({band_agg})")
    print(f"  raw R_A vs LLM = {raw_a_llm*100:.1f}%, R_B vs LLM = {raw_b_llm*100:.1f}%")
    return 0


if __name__ == "__main__":
    sys.exit(main())
