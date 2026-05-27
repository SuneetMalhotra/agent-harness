# Audit Packets

This folder ships the human spot-audit material for the Article 2 (Agent Harness) companion repository.

## What lives here

| Path | Purpose |
|---|---|
| `visual-assertion-protocol.md` | **Primary protocol** for the §6.1 visual-assertion spot-audit cited in the manuscript. Defines rater procedure over the 24-image `VISUAL_CORPUS` in `harness.ts` (12 functional + 12 cosmetic), the pass/fail rubric, and the Cohen's κ computation against an independent rater and against the LLM-judge verdicts emitted into `results.json`. |
| `visual-assertion-rater-instructions.md` | One-page rater onboarding sheet for the visual-assertion audit. |
| `packet/visual-assertion/` | Concrete materials handed to raters: `README_FOR_RATERS.md`, `rater_template.csv` (24 rows, one per image), and `analysis.py` (computes inter-rater Cohen's κ and rater-vs-LLM agreement, prints a summary). |
| `spec-enrichment-reference/` | **Methodological reference only.** The original spec-enrichment audit packet from Article 1's repository, retained here as the methodological model the visual-assertion audit is patterned on (sample-size discipline, blinding, Landis & Koch interpretation, the rater-template + analysis.py shape). Not the audit cited by Article 2's §6.1. |

## Why two packets

Article 1 (Specification Enrichment) used a three-bucket QA-acceptance rubric over LLM-drafted test cases. Article 2 (Agent Harness) uses a binary PASS/FAIL rubric over LLM-judged visual-assertion verdicts on a 24-image corpus. The two audits answer different reflexive-correctness questions on different artifact types and need their own protocols, raters, and analysis. The Article 2 manuscript (§6.1 threats to validity; §6 visual-assertion paragraph) cites `audit/visual-assertion-protocol.md` and `audit/visual-assertion-rater-instructions.md`.

## What the Article 2 audit validates

The §6 visual-assertion service emits `AssertionEvent`s with model-reported PASS/FAIL verdicts for the 24-image `VISUAL_CORPUS` defined in `harness.ts`. Per-image precision/recall against ground truth is *model-reported, not human-validated*: the same model that produced the assertions classifies its own outputs. The audit packet here is what breaks that loop — two independent human raters score the same 24 images blind, and the analysis script reports inter-rater Cohen's κ and rater-vs-LLM agreement. Until those numbers are in hand, the §6 visual-assertion precision/recall figures are not validation-scale evidence.
