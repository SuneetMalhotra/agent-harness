# Changelog

All notable changes to this project will be documented here.

## [1.3.4] - 2026-06-07

Manuscript presentation pass (no code or result changes): render the three
mermaid figures to images in the PDF build (previously dumped as raw source),
match the Article-1 sans-serif typesetting, and add the author biography photo.
Adds `scripts/build-paper.sh` (reproducible PDF build) and `paper-assets/`.
README headline-figures table no longer lists authoring-velocity speedup as an
empirical result (it is a practitioner observation per the manuscript).


## [1.3.3] - 2026-06-07

JSS submission package, final. Companion code for the article "Cross-Layer Observability for LLM-Assisted Test Automation: A Reference Architecture with Web and Mobile Feasibility Studies" (Malhotra, 2026; prepared for the Journal of Systems and Software, Elsevier). Adds the §6.2 mobile feasibility module, the `ARTIFACTS.md` reproducibility manifest, and Zenodo archival (concept DOI 10.5281/zenodo.20576685). Section references normalized to §6.1 (web) / §6.2 (mobile) / §6.3 (threats). No experiments or result numbers changed.

## [1.0.0] - 2026-05-25

Initial release. Companion code for the article later titled "Cross-Layer Observability for LLM-Assisted Test Automation" (Malhotra, 2026).

### Added
- `types.ts` — public types: `TestCase`, `TestArtifact`, `HealingEvent`, `AssertionEvent`, `AgentHandoff`, `TierName`, `ObservabilityEntry`.
- `observability.ts` — the shared observability substrate: append-only log per layer with a canonical schema and a thin query API. The single coupling primitive of the harness pattern.
- `intelligence.ts` — locator resolver with three-stage cascade (cache → DOM healer → vision fallback) and visual assertion service.
- `tier-router.ts` — routes test cases to Tier 1 / Tier 2 / Tier 3 stubs based on the `@tier` tag in the test specification.
- `pipeline.ts` — multi-agent pipeline runner: orchestrates PM → QA → Automation Engineer → PR Reviewer agents through structured handoffs.
- `harness.ts` — end-to-end entry point that wires the operating layer (pipeline) into the execution layer (tier router + intelligence) and writes results to `results.json`.
- `agents/*.md` — five agent prompt specifications.
- `providers/stub.ts` — deterministic offline stub provider for reproducible demo runs.
- `providers/anthropic.ts` — real provider that shells to `claude -p` (Claude Code OAuth; no API key).
- `examples/run-example.ts` — minimal end-to-end demo with the stub.
- `eval/visual-assertion-corpus/` — placeholder directory; populated by `harness.ts` on first run.

### Notes
- The reference implementation is deliberately a *sketch*: enough code to demonstrate the coupling, not enough to ship a production test suite. The article makes the same point in §7.
- All LLM calls go through `claude -p` (Claude OAuth) when the `anthropic` provider is selected. No `ANTHROPIC_API_KEY` is read or required.
