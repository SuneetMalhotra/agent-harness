# Visual-Assertion Audit Results (Phase 2 — LLM-as-rater methodological placeholder)

> **CRITICAL DISCLOSURE: Both raters are LLM-as-rater (Claude Sonnet 4.6 via OAuth), differentiated on persona (strict QA / lenient design reviewer) AND input modality (text+properties only / image-only). The Cohen's kappa reported here measures cross-modality + cross-persona divergence within one model family; it is NOT a substitute for inter-human-rater agreement. This execution serves as a methodological placeholder pending recruitment of independent human raters. The audit packet at `audit/packet/visual-assertion/` ships the protocol, blinded images, and rater template needed for the human audit when raters are recruited. Per Section 3.2 of the manuscript, this audit's findings cannot escape the same-model-family circularity the paper itself names.**

---

**Date:** 2026-05-26

**Raters:**
- **R_A (strict-text):** Claude Sonnet 4.6 via `claude -p` OAuth. Persona = strict senior QA engineer. Modality = text-only (`expected` behavior + `properties` checklist; no image). Rubric applied strictly; properties authoritative.
- **R_B (lenient-vision):** Claude Sonnet 4.6 via `claude -p` OAuth. Persona = lenient design reviewer / UI architect. Modality = image-only (PNG via Read tool; no text/properties shown). Rubric applied with cosmetic-charity; FAIL only on functionally-observable defects.

**Execution time:** R_A = 143.6s; R_B = 269.8s (sequential, OAuth, 24 cases each).

**Parse failures:** none. All 24 cases produced parseable verdicts from both raters.

**Cases scored:** N = 24 (intersection of R_A parseable, R_B parseable, KEY having an LLM-judge verdict).

---

## Headline numbers

| Metric | Value | Landis & Koch banding |
|---|---:|---|
| Cohen's kappa (R_A vs R_B) | **-0.059** | less than chance |
| Cohen's kappa (aggregated rater vs LLM-judge) | **0.083** | poor |
| Cohen's kappa (R_A vs seeded KEY) | 0.000 | poor |
| Cohen's kappa (R_B vs seeded KEY) | 0.083 | poor |
| Cohen's kappa (aggregated rater vs seeded KEY) | 0.083 | poor |
| Cohen's kappa (LLM-judge vs seeded KEY) | 0.833 | almost perfect |

| Raw-agreement metric | Value |
|---|---:|
| R_A vs LLM-judge | 50.0% |
| R_B vs LLM-judge | 54.2% |
| Aggregated rater vs LLM-judge | 54.2% |
| R_A vs seeded KEY | 50.0% |
| R_B vs seeded KEY | 54.2% |
| Aggregated rater vs seeded KEY | 54.2% |
| LLM-judge vs seeded KEY | 91.7% |

---

## 24-case verdict table

| TC | source_id | seeded | KEY GT | LLM-judge | R_A verdict | R_A reason | R_B verdict | R_B reason |
|---|---|---|---|---|---|---|---|---|
| TC01 | vis-cosm-8 | cosmetic | PASS | PASS | FAIL | The description only states that an equivalent delete affordance exists on each row; it does not establish th... | PASS | All elements render cleanly: title, input + Add CTA, three todo rows with checkboxes and Remove buttons, foot... |
| TC02 | vis-cosm-1 | cosmetic | PASS | FAIL | PASS | Rendered behavior states typography renders without breaking layout, which satisfies text-within-container, n... | PASS | All functional elements render correctly: title, input with Add CTA, mark-all, three todo rows with checkboxe... |
| TC03 | vis-cosm-9 | cosmetic | PASS | PASS | PASS | Expanded letter-spacing stays within container bounds; no overflow, single-line labels preserved, layout inte... | PASS | All elements render cleanly: title, input with Add CTA, three todo rows with checkboxes and Delete buttons, c... |
| TC04 | vis-func-10 | functional | FAIL | FAIL | PASS | Interactive checkbox per row toggles completion and conveys checked/unchecked state. | PASS | All elements render cleanly: title, input with Add CTA, mark-all, three todo rows with checkboxes and Delete ... |
| TC05 | vis-func-4 | functional | FAIL | FAIL | PASS | Rendered behavior states delete buttons meet the 24x24 px minimum, satisfying width >=24px, height >=24px, an... | PASS | All elements render correctly: title, input with Add CTA, mark-all checkbox, three todo rows with checkboxes ... |
| TC06 | vis-cosm-4 | cosmetic | PASS | PASS | PASS | Rendered behavior states container padding is consistent and touch targets remain reachable, satisfying contr... | PASS | All elements render correctly: title, input with Add CTA, mark-all checkbox, three todo rows with checkboxes ... |
| TC07 | vis-cosm-5 | cosmetic | PASS | PASS | PASS | Subtle shadow keeps buttons identifiable, does not obscure content, and preserves layout integrity. | PASS | All elements render correctly: title, input with Add CTA, mark-all checkbox, three todo rows with checkboxes ... |
| TC08 | vis-func-1 | functional | FAIL | FAIL | PASS | Rendered behavior states the Add todo CTA is visible and tappable in the header, satisfying visibility, absen... | FAIL | Header region renders dark-on-dark: the 'todos' title, the 'What needs to be done?' input placeholder, and th... |
| TC09 | vis-cosm-11 | cosmetic | PASS | PASS | PASS | Rendered behavior states the Add button is visible (renders, remains identifiable), is in a primary-blue pale... | PASS | All elements render cleanly: header, input with Add CTA, mark-all, three todo rows with checkboxes and Delete... |
| TC10 | vis-func-12 | functional | FAIL | PASS | PASS | Rendered behavior states a visible focus indicator appears on keyboard-focused interactive elements, which sa... | PASS | All elements render cleanly: title, input with Add CTA, three todo rows with checkboxes and Delete buttons, c... |
| TC11 | vis-cosm-2 | cosmetic | PASS | PASS | PASS | Primary CTA is visible, visually distinct from neutral chrome (distinguishable from background), and the desc... | PASS | All elements render cleanly: title, input with Add button, three todo items with checkboxes and Delete button... |
| TC12 | vis-func-2 | functional | FAIL | FAIL | PASS | Rendered behavior states the placeholder is fully visible without clipping, which satisfies sufficient width,... | PASS | All elements render cleanly: title, input + Add button, mark-all checkbox, three todo rows with checkboxes/la... |
| TC13 | vis-func-7 | functional | FAIL | FAIL | PASS | Delete buttons are visible inside each list row, satisfying within-row bounds, no-scroll locatability, and pr... | PASS | All elements render cleanly: title, input with Add CTA, mark-all, three todo items (one completed with strike... |
| TC14 | vis-func-3 | functional | FAIL | FAIL | FAIL | Rendered behavior only confirms the Add button is present in the header form; it does not establish that the ... | PASS | All elements render correctly: title, input, three todo items with checkboxes and Delete buttons, completed i... |
| TC15 | vis-cosm-3 | cosmetic | PASS | PASS | PASS | Rendered behavior states rounded surface treatment is consistent and no content is clipped, satisfying all th... | PASS | All elements render correctly: title, input with Add button, three todo rows with checkboxes and Delete butto... |
| TC16 | vis-cosm-7 | cosmetic | PASS | PASS | PASS | Rendered behavior states the background renders without disrupting card legibility, which satisfies legibilit... | PASS | All elements render cleanly: title, input with Add CTA, mark-all, three todo rows with checkboxes and Delete ... |
| TC17 | vis-cosm-6 | cosmetic | PASS | PASS | PASS | Italic footer labels are described as legible, with no truncation or layout disruption indicated; all three p... | PASS | All elements render cleanly: title, input with Add CTA, three todo rows with checkboxes and Delete buttons, c... |
| TC18 | vis-func-9 | functional | FAIL | FAIL | PASS | Rendered behavior states the new-todo input has an associated label (visible or programmatic), which satisfie... | PASS | All elements render cleanly: title, input with Add CTA, three todo rows with checkboxes and Delete buttons, f... |
| TC19 | vis-cosm-10 | cosmetic | PASS | PASS | PASS | Pills remain on a single row; increased height does not imply wrapping or hidden options; all three filter op... | PASS | All elements render clearly: header, input with Add button, mark-all checkbox, three todo items with checkbox... |
| TC20 | vis-func-6 | functional | FAIL | FAIL | PASS | Rendered behavior states no modal blocks the application without a dismiss affordance, satisfying all three p... | PASS | Loading overlay is rendered correctly: 'Loading...' indicator is clearly legible, dimmed background content i... |
| TC21 | vis-cosm-12 | cosmetic | PASS | PASS | PASS | Wordmark stays within header; form remains visible; layout integrity preserved. | PASS | All elements render cleanly: title, input with Add CTA, three todo rows with checkboxes and Delete buttons, c... |
| TC22 | vis-func-8 | functional | FAIL | FAIL | PASS | Rows are visually separated with no overlap; labels remain readable and list item spacing is preserved. | PASS | All elements render cleanly: title, input with Add CTA, three todo rows with checkboxes and Delete buttons al... |
| TC23 | vis-func-5 | functional | FAIL | FAIL | PASS | Rendered behavior states body text contrast against background meets the 3:1 minimum, satisfying the contrast... | PASS | All elements render cleanly: title, input + Add CTA, three todo rows with checkboxes and Delete buttons, and ... |
| TC24 | vis-func-11 | functional | FAIL | FAIL | PASS | Rendered behavior states the error banner is fully visible and not occluded, satisfying non-occlusion, full t... | PASS | All elements render cleanly: title, input with Add button, mark-all checkbox, three todo rows with checkboxes... |

---

## Confusion matrices

### R_A vs R_B

| R_A \ R_B | PASS | FAIL | row total |
|---|---|---|---|
| **PASS** | 21 | 1 | 22 |
| **FAIL** | 2 | 0 | 2 |
| **col total** | 23 | 1 | 24 |

### Aggregated rater vs LLM-judge

| AGG \ LLM | PASS | FAIL | row total |
|---|---|---|---|
| **PASS** | 11 | 10 | 21 |
| **FAIL** | 1 | 2 | 3 |
| **col total** | 12 | 12 | 24 |

---

## LLM-judge precision / recall by subset

Positive class = FAIL (the visual-assertion service's job is to flag failures).

### Against aggregated-rater verdict

| Subset | N | precision | recall | accuracy | TP | FP | FN | TN |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| functional | 12 | 0.182 | 1.000 | 0.250 | 2 | 9 | 0 | 1 |
| cosmetic | 12 | 0.000 | 0.000 | 0.833 | 0 | 1 | 1 | 10 |

### Against seeded KEY ground truth

| Subset | N | precision | recall | accuracy | TP | FP | FN | TN |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| functional | 12 | 1.000 | 0.917 | 0.917 | 11 | 0 | 1 | 0 |
| cosmetic | 12 | 0.000 | nan | 0.917 | 0 | 1 | 0 | 11 |

---

## Per-rater precision / recall against seeded KEY ground truth

Sanity-check whether either rater is systematically wrong against the seeded labels.

### R_A (strict-text)

| Subset | N | precision | recall | accuracy | TP | FP | FN | TN |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| functional | 12 | 1.000 | 0.083 | 0.083 | 1 | 0 | 11 | 0 |
| cosmetic | 12 | 0.000 | nan | 0.917 | 0 | 1 | 0 | 11 |

### R_B (lenient-vision)

| Subset | N | precision | recall | accuracy | TP | FP | FN | TN |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| functional | 12 | 1.000 | 0.083 | 0.083 | 1 | 0 | 11 | 0 |
| cosmetic | 12 | nan | nan | 1.000 | 0 | 0 | 0 | 12 |

---

## Verdict distributions (sanity check)

- R_A: PASS: 22 (92%), FAIL: 2 (8%)
- R_B: PASS: 23 (96%), FAIL: 1 (4%)
- Aggregated rater (1-1 -> FAIL): PASS: 21 (88%), FAIL: 3 (12%)
- LLM-judge: PASS: 12 (50%), FAIL: 12 (50%)
- Seeded KEY ground truth: PASS: 12 (50%), FAIL: 12 (50%)

---

## Recommendation (per protocol Output item 8)

Aggregated-rater-vs-LLM-judge kappa = **0.083** (poor); inter-rater kappa (R_A vs R_B) = **-0.059** (less than chance). Under the protocol's Landis & Koch banding (§ Inter-rater reliability metric): kappa >= 0.60 justifies citing the §6 visual-assertion precision/recall as validation-scale evidence; 0.40-0.60 justifies citation with an explicit kappa disclosure; 0.20-0.40 caps the claims at bounded estimates with uncertainty; < 0.20 requires abandoning the cited claims.

**Critical caveat:** both raters are the same model family driven by different prompts and modalities, so neither the inter-rater kappa nor the aggregated-vs-LLM kappa is an unbiased substitute for human-vs-human agreement. The numbers above should be read as an upper bound on the within-model self-consistency of Claude under prompt and modality perturbation, NOT as external validation. The §6 numbers in the manuscript must continue to carry the §6.1 reflexive-correctness caveat verbatim. The audit packet at `audit/packet/visual-assertion/` (blinded images, rater template, instructions) must be sent to independent human raters before the §6 precision/recall numbers can be promoted from `model-reported` to `validation-scale evidence`.

---

## Caveats

- **Same-model rater problem.** R_A and R_B share the underlying Claude Sonnet 4.6 weights. Error modes are correlated by construction; the kappa here likely *overestimates* true inter-rater agreement when measured against independent humans, but it *meaningfully measures* the prompt-and-modality slice the experiment names.
- **N = 24.** 95% CI on a binary-class kappa at this sample size is roughly +/- 0.15 to +/- 0.20. Treat point estimates with the corresponding uncertainty.
- **Tiebreak conservatism.** 1-1 tie -> FAIL aggregation biases the aggregated-rater verdict toward FAIL. This inflates aggregated-vs-LLM agreement on shared-FAIL cases and depresses it on cases where the LLM PASSes but one rater FAILs.
- **Modality asymmetry.** R_B is image-only; for subtle functional defects that are not visually evident (focus indicator absent, label association severed, sub-24px touch targets not measured) it lacks the data to FAIL where R_A correctly FAILs. R_A is text-only; for visually-evident layout corruption (overlapping rows, occluding overlays) it lacks the data to FAIL where R_B correctly FAILs. This asymmetry is intrinsic to the chosen design and is precisely what the inter-rater kappa is measuring.
- **One link in the chain.** This audit validates the *judging* step (rater-vs-LLM verdict on visual assertions). It does not validate the corpus design or the underlying test-case generation; those remain same-model.

