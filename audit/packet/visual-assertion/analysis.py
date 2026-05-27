#!/usr/bin/env python3
"""
analysis.py — Score the visual-assertion human spot-audit returns against the
LLM-judge verdicts and the seeded ground-truth labels.

Usage:
    python3 analysis.py \\
        --rater1 rater_AB.csv \\
        --rater2 rater_CD.csv \\
        --key    test_cases_KEY.csv \\
        --out    visual_assertion_analysis.md

Inputs:
    --rater1, --rater2  CSV files matching rater_template.csv
                        (case_id, verdict, reason, time_spent_seconds, notes).
                        verdict is PASS or FAIL (uppercase).
    --key               test_cases_KEY.csv (audit coordinator only). Schema:
                            case_id,source_id,seeded_label,llm_judge_verdict
                        seeded_label is 'functional' or 'cosmetic' (from the
                        VISUAL_CORPUS seed). llm_judge_verdict is PASS or FAIL
                        (read from results.json: visualAssertion.events[].passed
                        binarized as PASS=true, FAIL=false). The first three
                        '#' comment lines are skipped automatically.

Outputs:
    visual_assertion_analysis.md — headline metrics, confusion matrices,
                                   per-subset precision/recall, caveats.

Dependencies:
    Python 3.8+, numpy.
"""

from __future__ import annotations

import argparse
import csv
import io
import sys
from collections import Counter
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np

VERDICTS = ["PASS", "FAIL"]
NA_MARKERS = {"", "na", "n/a"}


# ---------------------------------------------------------------------------
# IO
# ---------------------------------------------------------------------------

def _strip_comment_header(path: Path) -> io.StringIO:
    """Return a StringIO of the file with leading '#'-prefixed lines removed."""
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines(keepends=True)
    data_lines = [ln for ln in lines if not ln.lstrip().startswith("#")]
    return io.StringIO("".join(data_lines))


def _normalize_verdict(v: str) -> Optional[str]:
    s = v.strip().upper()
    if s in {"PASS", "P", "TRUE", "1"}:
        return "PASS"
    if s in {"FAIL", "F", "FALSE", "0"}:
        return "FAIL"
    return None


def load_rater(path: Path) -> Dict[str, str]:
    """case_id -> verdict (PASS or FAIL)."""
    out: Dict[str, str] = {}
    with path.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            cid = row["case_id"].strip()
            if not cid:
                continue
            v = _normalize_verdict(row.get("verdict", ""))
            if v is None:
                print(f"WARNING [{path.name}] {cid}: verdict "
                      f"{row.get('verdict','')!r} unrecognized; skipping row.",
                      file=sys.stderr)
                continue
            out[cid] = v
    return out


def load_key(path: Path) -> Dict[str, Dict[str, str]]:
    """case_id -> dict of source_id / seeded_label / llm_judge_verdict."""
    out: Dict[str, Dict[str, str]] = {}
    buf = _strip_comment_header(path)
    reader = csv.DictReader(buf)
    for row in reader:
        cid = row["case_id"].strip()
        llm_raw = row.get("llm_judge_verdict", "").strip()
        llm = _normalize_verdict(llm_raw) if llm_raw.lower() not in NA_MARKERS else None
        out[cid] = {
            "source_id": row.get("source_id", "").strip(),
            "seeded_label": row.get("seeded_label", "").strip().lower(),
            "llm_judge_verdict": llm or "",
        }
    return out


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------

def cohen_kappa(r1: List[str], r2: List[str], categories: List[str]) -> float:
    """Cohen's kappa over a fixed category list (nominal)."""
    assert len(r1) == len(r2) and len(r1) > 0
    n = len(r1)
    idx = {c: i for i, c in enumerate(categories)}
    k = len(categories)
    cm = np.zeros((k, k), dtype=float)
    for a, b in zip(r1, r2):
        cm[idx[a], idx[b]] += 1
    po = float(np.trace(cm)) / n
    row = cm.sum(axis=1) / n
    col = cm.sum(axis=0) / n
    pe = float(np.dot(row, col))
    if pe == 1.0:
        return 1.0
    return (po - pe) / (1.0 - pe)


def confusion_matrix(a: List[str], b: List[str], categories: List[str]) -> np.ndarray:
    """rows = a, cols = b."""
    idx = {c: i for i, c in enumerate(categories)}
    k = len(categories)
    cm = np.zeros((k, k), dtype=int)
    for x, y in zip(a, b):
        cm[idx[x], idx[y]] += 1
    return cm


def cm_to_md(cm: np.ndarray, categories: List[str], row_label: str, col_label: str) -> str:
    header = f"| {row_label} \\ {col_label} | " + " | ".join(categories) + " | row total |"
    sep = "|" + "|".join(["---"] * (len(categories) + 2)) + "|"
    lines = [header, sep]
    for i, rc in enumerate(categories):
        cells = [str(int(cm[i, j])) for j in range(len(categories))]
        lines.append(f"| **{rc}** | " + " | ".join(cells) + f" | {int(cm[i].sum())} |")
    col_totals = [str(int(cm[:, j].sum())) for j in range(len(categories))]
    lines.append("| **col total** | " + " | ".join(col_totals) + f" | {int(cm.sum())} |")
    return "\n".join(lines)


def aggregate_human(r1: Dict[str, str], r2: Dict[str, str], cases: List[str]) -> Dict[str, str]:
    """
    Majority vote across the two raters. With N=2, every case is unanimous
    (both PASS or both FAIL) or split 1-1. On a 1-1 split, defer to FAIL
    (more conservative — the audit is designed to detect false-PASS verdicts).
    """
    out: Dict[str, str] = {}
    for c in cases:
        v1 = r1.get(c)
        v2 = r2.get(c)
        if v1 is None or v2 is None:
            continue
        if v1 == v2:
            out[c] = v1
        else:
            out[c] = "FAIL"
    return out


def precision_recall_binary(pred: List[str], truth: List[str], positive: str = "FAIL") -> Tuple[float, float, int, int, int, int]:
    """
    Treat `positive` as the positive class (default: FAIL — the visual-assertion
    service's job is to *detect* failures, so precision/recall are computed on
    its ability to flag FAILs).
    Returns (precision, recall, tp, fp, fn, tn).
    """
    tp = fp = fn = tn = 0
    for p, t in zip(pred, truth):
        p_pos = (p == positive)
        t_pos = (t == positive)
        if p_pos and t_pos:
            tp += 1
        elif p_pos and not t_pos:
            fp += 1
        elif not p_pos and t_pos:
            fn += 1
        else:
            tn += 1
    precision = tp / (tp + fp) if (tp + fp) > 0 else float("nan")
    recall = tp / (tp + fn) if (tp + fn) > 0 else float("nan")
    return precision, recall, tp, fp, fn, tn


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------

def build_report(r1_path: Path, r2_path: Path, key_path: Path,
                 r1: Dict[str, str], r2: Dict[str, str],
                 key: Dict[str, Dict[str, str]]) -> str:
    case_ids = sorted(set(r1) & set(r2) & set(key))
    missing_in_r1 = sorted(set(key) - set(r1))
    missing_in_r2 = sorted(set(key) - set(r2))

    r1_aligned = [r1[c] for c in case_ids]
    r2_aligned = [r2[c] for c in case_ids]

    # --- Inter-rater
    kappa_r1_r2 = cohen_kappa(r1_aligned, r2_aligned, VERDICTS)

    # --- Human-aggregate
    human = aggregate_human(r1, r2, case_ids)
    human_aligned = [human[c] for c in case_ids]

    # --- LLM-judge
    have_llm = [c for c in case_ids if key[c]["llm_judge_verdict"] in VERDICTS]
    llm_aligned = [key[c]["llm_judge_verdict"] for c in have_llm]
    r1_for_llm = [r1[c] for c in have_llm]
    r2_for_llm = [r2[c] for c in have_llm]
    human_for_llm = [human[c] for c in have_llm]

    if have_llm:
        r1_vs_llm_agree = sum(1 for a, b in zip(r1_for_llm, llm_aligned) if a == b) / len(have_llm)
        r2_vs_llm_agree = sum(1 for a, b in zip(r2_for_llm, llm_aligned) if a == b) / len(have_llm)
        kappa_h_llm = cohen_kappa(human_for_llm, llm_aligned, VERDICTS)
    else:
        r1_vs_llm_agree = r2_vs_llm_agree = float("nan")
        kappa_h_llm = float("nan")

    # --- Confusion matrices
    cm_r1_r2 = confusion_matrix(r1_aligned, r2_aligned, VERDICTS)
    cm_h_llm = (confusion_matrix(human_for_llm, llm_aligned, VERDICTS)
                if have_llm else None)

    # --- Per-subset LLM precision/recall against human-aggregate, by seeded subset
    by_subset: Dict[str, Tuple[List[str], List[str]]] = {"functional": ([], []),
                                                         "cosmetic": ([], [])}
    for c in have_llm:
        label = key[c]["seeded_label"]
        if label in by_subset:
            by_subset[label][0].append(key[c]["llm_judge_verdict"])
            by_subset[label][1].append(human[c])

    subset_metrics: Dict[str, Dict[str, float]] = {}
    for label, (preds, truths) in by_subset.items():
        if not preds:
            subset_metrics[label] = {"precision": float("nan"), "recall": float("nan"),
                                     "tp": 0, "fp": 0, "fn": 0, "tn": 0, "n": 0}
            continue
        precision, recall, tp, fp, fn, tn = precision_recall_binary(preds, truths, positive="FAIL")
        subset_metrics[label] = {"precision": precision, "recall": recall,
                                 "tp": tp, "fp": fp, "fn": fn, "tn": tn, "n": len(preds)}

    # --- Landis & Koch
    def landis_koch(k: float) -> str:
        if np.isnan(k):
            return "n/a"
        if k < 0.20:
            return "poor"
        if k < 0.40:
            return "fair"
        if k < 0.60:
            return "moderate"
        if k < 0.80:
            return "substantial"
        return "almost perfect"

    # --- Build markdown
    out: List[str] = []
    out.append("# Visual-Assertion Audit Analysis Results\n")
    out.append(f"- Rater 1 file: `{r1_path.name}` ({len(r1)} verdicts)\n"
               f"- Rater 2 file: `{r2_path.name}` ({len(r2)} verdicts)\n"
               f"- Key file: `{key_path.name}` ({len(key)} cases)\n"
               f"- Cases scored (intersection of all three): **{len(case_ids)}**\n")
    if missing_in_r1 or missing_in_r2:
        out.append(f"- Missing from rater 1: {missing_in_r1 or 'none'}")
        out.append(f"- Missing from rater 2: {missing_in_r2 or 'none'}\n")

    out.append("## Headline numbers\n")
    out.append("| Metric | Value | Interpretation (Landis & Koch 1977) |")
    out.append("|---|---:|---|")
    out.append(f"| Cohen's kappa (R1 vs R2) | **{kappa_r1_r2:.3f}** | {landis_koch(kappa_r1_r2)} |")
    if have_llm:
        out.append(f"| R1 vs LLM judge agreement (raw) | {r1_vs_llm_agree*100:.1f}% | N = {len(have_llm)} |")
        out.append(f"| R2 vs LLM judge agreement (raw) | {r2_vs_llm_agree*100:.1f}% | N = {len(have_llm)} |")
        out.append(f"| Cohen's kappa (human-aggregate vs LLM) | {kappa_h_llm:.3f} | {landis_koch(kappa_h_llm)} |")
    else:
        out.append("| Human vs LLM judge | n/a | LLM judge verdicts unavailable in KEY |")
    out.append("")

    out.append("## Confusion matrix: Rater 1 vs Rater 2\n")
    out.append(cm_to_md(cm_r1_r2, VERDICTS, "R1", "R2"))
    out.append("")

    if cm_h_llm is not None:
        out.append("## Confusion matrix: human-aggregate vs LLM judge\n")
        out.append(cm_to_md(cm_h_llm, VERDICTS, "HUMAN", "LLM"))
        out.append("")

    # --- Per-subset LLM precision/recall
    out.append("## LLM-judge precision / recall against human-aggregate, by seeded subset\n")
    out.append("Positive class = FAIL (the visual-assertion service's job is to flag failures).\n")
    out.append("| Subset | N | LLM precision | LLM recall | TP | FP | FN | TN |")
    out.append("|---|---:|---:|---:|---:|---:|---:|---:|")
    for label in ["functional", "cosmetic"]:
        m = subset_metrics[label]
        prec = f"{m['precision']:.3f}" if not np.isnan(m["precision"]) else "n/a"
        rec = f"{m['recall']:.3f}" if not np.isnan(m["recall"]) else "n/a"
        out.append(f"| {label} | {m['n']} | {prec} | {rec} | {m['tp']} | {m['fp']} | {m['fn']} | {m['tn']} |")
    out.append("")

    # --- Verdict distribution sanity check
    out.append("## Verdict distributions (sanity check)\n")
    def dist(verdicts: List[str]) -> str:
        c = Counter(verdicts)
        total = sum(c.values())
        return ", ".join(f"{k}: {c.get(k,0)} ({100*c.get(k,0)/total:.0f}%)" for k in VERDICTS)
    out.append(f"- R1: {dist(r1_aligned)}")
    out.append(f"- R2: {dist(r2_aligned)}")
    out.append(f"- Human-aggregate: {dist(human_aligned)}")
    if have_llm:
        out.append(f"- LLM: {dist(llm_aligned)}")
    out.append("")

    out.append("## Caveats\n")
    out.append("- **Sample size.** N = 24 is the full visual-assertion corpus. "
               "Sufficient to detect substantial-or-better agreement (kappa >= 0.6) "
               "with one-sided alpha = 0.05 when the underlying population kappa is "
               "moderate-or-better, but the 95% CI on a binary-class kappa at N=24 "
               "is wide (rule of thumb: +/- 0.15 to +/- 0.20). Treat point estimates "
               "accordingly.")
    out.append("- **Class imbalance.** The corpus is balanced by construction "
               "(12 functional + 12 cosmetic). The human-aggregated verdict "
               "distribution may still skew if raters lean conservative on the "
               "cosmetic subset; the 1-1 tiebreak rule (defer to FAIL) is the "
               "conservative direction by design.")
    out.append("- **LLM-judge comparison.** Only cases for which the KEY carries a "
               "real (non-NA) llm_judge_verdict are included in the human-vs-LLM panel. "
               "If results.json was built from a stub provider for which the visual-"
               "assertion service did not emit a per-event verdict, that panel will be "
               "'n/a' and the audit only validates inter-rater reliability, not the "
               "human-vs-LLM circularity link.")
    out.append("- **One link in the chain.** This audit validates the *judging* step "
               "(rater-vs-LLM verdict on visual assertions). It does not validate the "
               "corpus design or the underlying test-case generation; those remain "
               "same-model.")

    return "\n".join(out) + "\n"


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--rater1", required=True, type=Path)
    p.add_argument("--rater2", required=True, type=Path)
    p.add_argument("--key", required=True, type=Path)
    p.add_argument("--out", required=True, type=Path,
                   help="Output markdown path (e.g. visual_assertion_analysis.md)")
    args = p.parse_args()

    r1 = load_rater(args.rater1)
    r2 = load_rater(args.rater2)
    key = load_key(args.key)

    md = build_report(args.rater1, args.rater2, args.key, r1, r2, key)
    args.out.write_text(md, encoding="utf-8")
    print(f"Wrote {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
