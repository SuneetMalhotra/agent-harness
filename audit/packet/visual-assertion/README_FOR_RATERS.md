# Rater Onboarding — Visual-Assertion Spot-Audit

**Time budget:** 15–25 minutes for 24 images. Plan for one uninterrupted sitting.

## (a) What you are rating

Twenty-four rendered screen images from a generic **TodoMVC-style task-management web application**: a single-page todo list with add / edit / complete / delete / filter / clear-completed functionality. Public reference: <https://todomvc.com>. Each image corresponds to one entry in the harness's `VISUAL_CORPUS` (defined in `harness.ts`) and is paired with:

- a one-sentence `expected` behavior description, and
- a three-bullet `properties` checklist.

Your job is to judge each image *as a QA artifact*: does it PASS (every checklist property holds and the rendered screen matches the expected behavior) or FAIL (a property is violated or the screen does not match the expected behavior)?

## (b) Why

IEEE Software peer review flagged the §6 visual-assertion precision/recall numbers as model-reported, not human-validated: the same LLM that authored the underlying test cases produced the verdicts. Your independent verdicts break that loop and produce a Cohen's κ inter-rater agreement number that the published article will cite (per `audit/visual-assertion-protocol.md`).

## (c) What you do *not* need to know

- **Whether the image is in the "functional" or "cosmetic" seeded bucket.** The 24 cases come from two seeded buckets (12 each); the mapping is sealed in the audit coordinator's KEY file and will not be revealed to you until after both raters' verdicts are returned. **Do not try to infer it.** The question is whether each image passes the rubric, not which bucket it came from.
- **The LLM-judge's verdict on each image.** Also sealed.
- **Anything about the article's hypothesis.** Treat this as a blind QA review on an unknown vendor's visual-assertion deliverable.

## (d) Rubric (verbatim from `audit/visual-assertion-protocol.md`)

The rubric is binary and intentionally close to what the LLM-judge does internally so the verdicts are directly comparable.

| Verdict | Definition |
|---|---|
| **PASS** | All checklist properties hold and the rendered screen matches the expected-behavior description. Cosmetic differences (font, kerning, spacing, anti-aliasing, palette drift, exact pixel positions) that do not violate a checklist property are **not** grounds for FAIL. |
| **FAIL** | At least one checklist property is violated (e.g., CTA obscured, content clipped, illegible text, accessibility minimum not met), **or** the rendered screen does not match the expected-behavior description in a functionally observable way. |

Plain-English guidance, in priority order:

1. **Properties before prose.** The checklist is authoritative. If every property holds, the verdict is PASS even when the prose description is loosely worded.
2. **Functional over cosmetic.** Ignore font, kerning, anti-aliasing, palette drift, exact pixel positions. Flag obscured controls, clipped content, illegible text, missing affordances.
3. **No charity for design intent.** A property violation is a FAIL even if the violation looks intentional.
4. **Borderline cases default to FAIL.** The audit is designed to detect false-PASS verdicts; when in doubt, mark FAIL and explain in the `reason` column.

## (e) How to record a verdict

1. Open `rater_template.csv` (provided alongside this README) in Excel, Numbers, or Google Sheets.
2. For each of the 24 rows (TC01–TC24), fill in:
   - `verdict` — exactly one of `PASS`, `FAIL` (uppercase, as shown).
   - `reason` — one sentence pointing at the specific checklist property (for FAIL) or confirming the checklist holds (for PASS). Example: *"CTA partially obscured by overlay; checklist property 'no obscuring overlay' violated."*
   - `time_spent_seconds` — integer estimate; rough is fine.
   - `notes` — anything else worth flagging (render errors, suspected duplicates, ambiguity in the checklist).
3. Save the file as `rater_<your-initials>.csv` (e.g., `rater_AB.csv`).
4. Email it back to the audit coordinator. Do not CC the other rater.

## (f) Estimated time

15–25 minutes total for 24 images (~40–60 seconds per image). The images are short to evaluate. If you find yourself spending more than 2 minutes on a single image, default to FAIL with a note in `reason` and move on — the rubric distinguishes "ships" from "does not ship", not "perfect" from "great".

## (g) What NOT to do

- **Do not** consult the manuscript, the GitHub repository, or any explanation of which images are "supposed to" PASS or FAIL. The whole point of the audit is to get independent human judgment; injecting that signal re-introduces the circularity the audit is designed to break.
- **Do not** discuss your verdicts with the other rater until both CSVs are returned. Inter-rater agreement is meaningful only if the verdicts are independent.
- **Do not** skip ahead, revisit earlier ratings to "calibrate", or change a verdict after seeing a later case. Rate in order, in one pass.
- **Do not** try to identify which images came from the functional or cosmetic seeded bucket. Even a correct guess invalidates the blind.

## Questions

If anything in the rubric is ambiguous *before* you start, email the audit coordinator. If anything is ambiguous *during* the rating pass, write the verdict you would assign with the rubric as written and flag the ambiguity in `notes` — that is itself useful data.

Thank you. Your initials and ratings will be acknowledged in the published article if you wish; tell the audit coordinator when you return the file.
