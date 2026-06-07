# Chaos perturbation benchmark

Purpose: give the self-healing cascade a **real denominator with ground truth**. The prior numbers ("DOM 1.000 on 11 cases") only meant "the test didn't crash." This benchmark forces dozens–hundreds of locator failures at controlled difficulty and scores healing on whether it resolved the **correct** element.

## 1. Generate the labeled perturbation set
```bash
npm i -D playwright && npx playwright install chromium
# TodoMVC (calibration / contamination baseline)
node chaos/generate-perturbations.mjs --url http://localhost:5173 --out chaos/perturb-todomvc.json --repeat 2
# Real low-contamination target (your own recent React site)
node chaos/generate-perturbations.mjs --url https://suneetmalhotra.com --out chaos/perturb-portfolio.json --repeat 2
# Heavyweight target (start it first: cd ~/agents/vyra/infra/supabase && supabase start)
node chaos/generate-perturbations.mjs --url http://localhost:54323 --out chaos/perturb-supabase.json --repeat 2
```
Each record carries `groundTruth` (tag/role/text/aria/centroid) that does **not** depend on the broken selector.

## 2. Score the healing cascade against ground truth
For each perturbation: apply the mutation to the live page, run the cascade (cache → DOM-healer → vision-healer), and compare the resolved element to `groundTruth`.
- **Healing success** = resolved element matches `groundTruth` (centroid within element box AND text/role match). NOT "test continued."
- Record per case: band, resolvedStrategy, success, **time-to-heal (ms)**, and **false-heal** (resolved a *different* element → would cause a false pass).
- Emit to the §2 substrate as normal `HealingEvent`s + a `groundTruthMatch` field; write `results-healing-bench.json`.

## 3. Report (replaces the hollow conditional rates)
- Healing accuracy by difficulty band (a curve), with real N (e.g. 46/50 = 92%).
- **Baseline comparison** — run the same perturbation set through Healenium and a DOM-only / vision-only ablation. Report success rate, **Mean-Time-To-Heal**, and false-heal rate per system. Honest trade-offs (LLM slower but higher accuracy on hard bands) are a strength.
- Contamination check: compare accuracy on TodoMVC (likely memorized) vs suneetmalhotra.com / obfuscated build (not memorized).

## Notes
- The generator is driver-agnostic (it produces the dataset + ground truth). Wiring step 2 to the repo's WebDriverIO cascade is the integration work.
- Seed-target list is auto-derived (visible interactive elements); curate per app for "deep" flows (see `EXPERIMENT_BUILD_SPECS.md`).
- Run locally; not part of CI / `reproduce:paper`.
