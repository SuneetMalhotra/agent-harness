# Visual-Assertion Audit Results — Live Claude Vision Validation
> **LLM-judge verdicts in this run are from live Claude Sonnet 4.6 via vision (`claude -p` reading PNGs through its Read tool), NOT stub. The kappa values reported below are meaningful measurements, not tautologies. The LLM-rater pair (R_A strict-text, R_B lenient-vision) is unchanged from the 2026-05-26 audit and remains an LLM-as-rater methodological placeholder per Section 3.2 reflexive-correctness concerns; the human-rater packet at `audit/packet/visual-assertion/` ships for the gold-standard audit.**

**Date:** 2026-05-27
**Provider:** anthropic-oauth (Claude Sonnet 4.6 via OAuth)
**N cases:** 24
**Judge verdict distribution:** PASS=16, FAIL=8

---

## Headline numbers

| Metric | Value | Landis & Koch band |
|---|---:|---|
| Cohen's kappa (LIVE LLM-judge vs seeded KEY ground truth) | **0.667** | **substantial** |
| Cohen's kappa (LIVE LLM-judge vs aggregated raters) | 0.222 | fair |
| Cohen's kappa (R_A vs R_B) | -0.059 | poor |
| Cohen's kappa (R_A vs KEY) | 0.000 | poor |
| Cohen's kappa (R_B vs KEY) | 0.083 | poor |
| Cohen's kappa (aggregated rater vs KEY) | 0.083 | poor |

| Raw agreement | Value |
|---|---:|
| LIVE LLM-judge vs seeded KEY | **83.3%** |
| R_A vs LIVE LLM-judge | 66.7% |
| R_B vs LIVE LLM-judge | 70.8% |
| Aggregated rater vs LIVE LLM-judge | 70.8% |

---

## LLM-judge precision / recall (positive class = FAIL)

### Against seeded KEY ground truth (independent of any LLM)

| Subset | N | precision | recall | accuracy | TP | FP | FN | TN |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| functional | 12 | 1.000 | 0.667 | 0.667 | 8 | 0 | 4 | 0 |
| cosmetic | 12 | nan | nan | 1.000 | 0 | 0 | 0 | 12 |
| overall | 24 | 1.000 | 0.667 | 0.833 | 8 | 0 | 4 | 12 |

### Against aggregated rater verdict

| Subset | N | precision | recall | accuracy | TP | FP | FN | TN |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| functional | 12 | 0.250 | 1.000 | 0.500 | 2 | 6 | 0 | 4 |
| cosmetic | 12 | nan | 0.000 | 0.917 | 0 | 0 | 1 | 11 |

---

## 24-case verdict table

| TC | source_id | seeded | KEY GT | LIVE LLM-judge | R_A | R_B | agg |
|---|---|---|---|---|---|---|---|
| TC01 | vis-cosm-8 | cosmetic | PASS | PASS | FAIL | PASS | FAIL |
| TC02 | vis-cosm-1 | cosmetic | PASS | PASS | PASS | PASS | PASS |
| TC03 | vis-cosm-9 | cosmetic | PASS | PASS | PASS | PASS | PASS |
| TC04 | vis-func-10 | functional | FAIL | PASS | PASS | PASS | PASS |
| TC05 | vis-func-4 | functional | FAIL | FAIL | PASS | PASS | PASS |
| TC06 | vis-cosm-4 | cosmetic | PASS | PASS | PASS | PASS | PASS |
| TC07 | vis-cosm-5 | cosmetic | PASS | PASS | PASS | PASS | PASS |
| TC08 | vis-func-1 | functional | FAIL | FAIL | PASS | FAIL | FAIL |
| TC09 | vis-cosm-11 | cosmetic | PASS | PASS | PASS | PASS | PASS |
| TC10 | vis-func-12 | functional | FAIL | FAIL | PASS | PASS | PASS |
| TC11 | vis-cosm-2 | cosmetic | PASS | PASS | PASS | PASS | PASS |
| TC12 | vis-func-2 | functional | FAIL | PASS | PASS | PASS | PASS |
| TC13 | vis-func-7 | functional | FAIL | FAIL | PASS | PASS | PASS |
| TC14 | vis-func-3 | functional | FAIL | FAIL | FAIL | PASS | FAIL |
| TC15 | vis-cosm-3 | cosmetic | PASS | PASS | PASS | PASS | PASS |
| TC16 | vis-cosm-7 | cosmetic | PASS | PASS | PASS | PASS | PASS |
| TC17 | vis-cosm-6 | cosmetic | PASS | PASS | PASS | PASS | PASS |
| TC18 | vis-func-9 | functional | FAIL | FAIL | PASS | PASS | PASS |
| TC19 | vis-cosm-10 | cosmetic | PASS | PASS | PASS | PASS | PASS |
| TC20 | vis-func-6 | functional | FAIL | FAIL | PASS | PASS | PASS |
| TC21 | vis-cosm-12 | cosmetic | PASS | PASS | PASS | PASS | PASS |
| TC22 | vis-func-8 | functional | FAIL | PASS | PASS | PASS | PASS |
| TC23 | vis-func-5 | functional | FAIL | FAIL | PASS | PASS | PASS |
| TC24 | vis-func-11 | functional | FAIL | PASS | PASS | PASS | PASS |

---

## Recommendation

LLM-judge kappa vs seeded KEY = 0.667 (substantial). Per protocol Inter-rater section, this **justifies citing the §6 visual-assertion precision/recall as validation-scale evidence**. Note: the LLM-rater pair audit (kappa = -0.059) remains the LLM-as-rater methodological placeholder; the KEY-anchored validation is the load-bearing measurement here because the seeded labels are determined at corpus-design time independent of any LLM call.

---

## Caveats

- **Same-rater audit limitation unchanged.** The R_A/R_B pair is LLM-as-rater; the headline measurement here is judge-vs-KEY, which is rater-independent.
- **N = 24.** 95% CI on binary-class kappa at this sample size is roughly +/- 0.15 to +/- 0.20.
- **Pipeline runtime (Operating layer).** Pre-visual-assertion the multi-agent pipeline ran for 1666s (27.8 min) generating 30 test cases.
