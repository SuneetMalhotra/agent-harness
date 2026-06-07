# Debugging A/B — rater instructions (Phase 3)

**Goal:** measure whether the cross-layer observability substrate helps an engineer find a test failure's root cause faster/more accurately than standard tooling. This is the empirical answer to "the substrate is just structured logging."

## What you'll do
You'll review a set of test-failure artifacts, one at a time, and for each: identify the **root cause** and record **how long it took**. You will see two formats (Group A and Group B) for *different* cases — you never see the same case twice, so there's no memory advantage.

- **Group A** = the failure output a standard Playwright/Selenium setup produces (a run log + a DOM snapshot).
- **Group B** = the agent-harness observability-substrate trace for an equivalent failure.

You are **blind to which format is "ours"** — treat both as just "failure reports."

## Protocol (do this exactly)
1. Open `SCORESHEET.csv`. For each row (a case_id + group), in order:
2. Start a timer. Open the matching file: Group A → `cases/groupA/<case_id>.log`; Group B → `cases/groupB/<case_id>.txt`.
3. Read until you can state the **root cause** in one sentence (e.g. "the locator broke and the test silently matched the wrong element" / "the element wasn't found after the DOM changed").
4. Stop the timer. Record in the row: `seconds_to_root_cause`, your one-sentence `diagnosis`, and `correct(y/n)` — leave `correct` blank; the study owner fills it against the known cause.
5. Do **not** go back and revise earlier rows.

## What counts as the root cause (for the owner's scoring key)
Every case is a broken-locator scenario. The correct diagnosis names **both**: (a) the original selector broke due to a DOM change, and (b) what the run did about it — either *failed to find the element* (miss) or *silently resolved a different element* (false-heal). A diagnosis that only says "test failed" without identifying the silent wrong-element resolution is **incorrect** for false-heal cases.

## Logistics
- 2–3 raters, each rates every case (counterbalance which group each rater sees first).
- Keep raters independent (no discussion until done).
- Report: mean Time-to-Root-Cause (A vs B), diagnosis accuracy (A vs B), and inter-rater agreement. A large B-advantage on false-heal cases is the headline result.

## Honest caveats to report alongside results
- Small N (cases + raters); treat as a pilot.
- Group A/B formats were authored from the same real benchmark failures, but the prose framing differs; mitigate by keeping both terse and factual (the generator does this).
- Raters drawn from the author's network — note any familiarity with the harness.
