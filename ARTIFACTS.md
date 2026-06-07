# ARTIFACTS — reproducibility manifest

## Submission

- **Manuscript:** "Cross-Layer Observability for LLM-Assisted Test Automation: A Reference Architecture with Web and Mobile Feasibility Studies"
- **Target venue:** Journal of Systems and Software (Elsevier) — In Practice / Applied Research Report
- **Final release tag:** `v1.3.1-jss-final`
- **Full commit hash:** resolve with `git rev-parse v1.3.1-jss-final^{commit}`
- **Node version:** v25.8.1 (package `engines.node`: `>=20.0.0`)
- **Zenodo DOI:** to be minted from tag `v1.3.1-jss-final` (not yet assigned)
- **Reproduction command:** `npm run reproduce:paper`

This document inventories every artifact the manuscript depends on.
A reviewer should be able to verify each claim in §6.1 and §6.2 by
inspecting the files below and running the documented commands.

## Versioning

```bash
# Pin the exact commit that produced the manuscript figures.
git rev-parse HEAD
```

Recommended Node version: **>=20.0.0** (see `package.json` `engines` field).

## Web feasibility study (§6.1)

| Artifact | Path | What it backs |
|---|---|---|
| Full evaluation result | `results.json` | All §6.1 healing, visual-assertion, pipeline-review, tier-routing numbers |
| Visual corpus | `visual-corpus/images/` | The 24 seeded screenshots used in the §6.1 visual-assertion evaluation |
| Visual-corpus seeding catalog | `visual-corpus/seedings.ts` | Maps each image to its functional/cosmetic ground-truth label |
| Visual-corpus render harness | `visual-corpus/render.ts` | Regenerates the 24 seeded screenshots from the public TodoMVC app |
| Audit packet | `audit/` | Visual-assertion audit protocol + rater instructions + raw rater results |

### Reproduction commands

```bash
npm ci
npm run example:web         # offline stub demo (no API key)
npm run harness:stub        # full §6.1 stub-provider run; writes results.json
npm run harness:anthropic   # live Claude Sonnet 4.6 run (requires Claude OAuth)
```

## Mobile feasibility study (§6.2 — new)

| Artifact | Path | What it backs |
|---|---|---|
| Mobile evaluation result | `results-mobile.json` | All §6.2 mobile dispatch/recovery/event-capture numbers |
| Mobile test catalog | `mobile/mobile-test-cases.ts` | 13 deterministic test cases on the public Sauce Labs sample app |
| Public-app screen catalog | `mobile/sample-app.ts` | Encoded reference to the public Sauce Labs Android demo |
| Mobile harness runner | `mobile/mobile-harness.ts` | Deterministic replay (no Appium, no emulator, no API key) |
| Mobile type extensions | `mobile/types.ts` | TargetModality, MobileLocatorStrategy, MobileStudyResult |
| Schema validation tests | `tests/mobile-schema.test.ts` | 22 reconciliation checks on counts, schema, web-preservation |
| Optional live-Appium notes | `mobile/README-LIVE-APPIUM.md` | TODO sketch for a future live-Appium mode (not required for §6.2 numbers) |

### Reproduction commands

```bash
npm ci
npm run example:mobile      # writes results-mobile.json (<5 seconds, no Appium)
npm run test:mobile         # 22 schema/reconciliation checks; exits 0 on pass
```

### What this study reports

| Metric | Value | Source |
|---|---:|---|
| Mobile test cases | 13 | `results-mobile.json: testCases` |
| Healing events emitted | 13 | `results-mobile.json: healingEvents` |
| Recovered (any strategy) | 12 | `results-mobile.json: recovered` |
| Unrecovered (reported, not swallowed) | 1 | `results-mobile.json: unrecovered` |
| First-dispatch correct | 13/13 | `results-mobile.json: firstDispatchCorrect` |
| Same schema reused (web + mobile) | true | `results-mobile.json: sameSchemaReused` |
| Hardware-in-the-loop evaluated | false | `results-mobile.json: comparison.hardware.evaluated` |

### What this study does NOT claim

- Production-scale mobile accuracy
- LLM-as-judge κ measurement on mobile (web-only at §6.1 scale)
- Hardware-in-the-loop evaluation
- Generalization beyond the 13 deterministic cases on one public app

## Cross-modality comparison

| Modality | Test cases | Recovered | Total | Evaluated? |
|---|---:|---:|---:|---|
| Web (§6.1) | 30 | 29 | 30 | ✅ |
| Mobile (§6.2) | 13 | 12 | 13 | ✅ |
| Hardware-in-the-loop | — | — | — | ❌ architectural extension only |

The `results-mobile.json: comparison` section in the JSON output encodes
the same comparison machine-readably.

## Full paper-reproduction command

```bash
npm run reproduce:paper
```

This runs (in order):
1. The web stub example (`example:web`) — regenerates baseline behavior
2. The mobile deterministic replay (`example:mobile`) — produces `results-mobile.json`
3. The mobile schema tests (`test:mobile`) — 22 reconciliation checks

A clean reviewer machine should produce identical `results-mobile.json`
contents on every run.

## Provenance

- License: code is MIT-licensed (see `LICENSE`).
- No proprietary employer code, screenshots, customer data, or operational
  metrics are used or referenced in this repository.
- The mobile target (Sauce Labs My Demo App) is publicly licensed under
  MIT (see https://github.com/saucelabs/sample-app-mobile).
