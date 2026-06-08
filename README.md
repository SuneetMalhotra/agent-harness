# agent-harness

Reference implementation for the Agent Harness coupling pattern.

Companion code for a *Journal of Systems and Software* (JSS) submission:

> Malhotra, S. "Cross-Layer Observability for LLM-Assisted Test Automation: A Reference Architecture and Web Feasibility Study." Submitted to the *Journal of Systems and Software* (Elsevier), 2026.

---

## What this is

This repository is the reference implementation and reproducibility package for a small empirical study, not a production test platform. The work is based on a common automation-architecture problem: framework code, agent handoffs, locator recovery, visual assertion, and execution-tier routing often leave separate logs. When those logs are disconnected, it is hard to explain why a generated test passed, failed, recovered, or reached a given execution tier.

The implementation keeps the layers separate and connects them through one typed event substrate:

- **Authoring layer:** a framework whose source is agent-authored under a human review checkpoint.
- **Operating layer:** a five-agent SDLC pipeline (PM, QA, Automation Engineer, Developer, PR Reviewer) whose handoffs flow through external artifact systems over the Model Context Protocol.
- **Execution layer:** three orchestrated hardware tiers (physical device bench, commercial cloud real-device farm, ephemeral virtual hardware) mediated by an intelligence layer for locator healing and visual assertion.

The substrate is an append-only log per layer with a canonical schema and a thin query API. Each layer remains testable in isolation; the shared event trail is what lets the package reconcile agent handoffs, recovery events, visual verdicts, and routing decisions after a run.

This repository contains the runnable reference implementation plus the empirical harness used in §6.1 of the article.

---

## What's inside

```
agent-harness/
├── types.ts                    # Public types: TestCase, HealingEvent, AssertionEvent, AgentHandoff, etc.
├── observability.ts            # The shared substrate: append-only log + thin query API
├── intelligence.ts             # Locator resolver (cache → DOM healer → vision fallback) + visual assertion
├── tier-router.ts              # Routes test cases to Tier 1 / 2 / 3 stubs based on @tier tag
├── pipeline.ts                 # Multi-agent pipeline runner: PM → QA → Auto Eng → PR Reviewer
├── harness.ts                  # End-to-end entry point — produces results.json
├── agents/
│   ├── product-manager-agent.md
│   ├── qa-engineer-agent.md
│   ├── automation-engineer-agent.md
│   ├── developer-agent.md
│   └── pr-reviewer-agent.md
├── providers/
│   ├── types.ts                # ModelProvider interface
│   ├── stub.ts                 # Deterministic stub for offline reproduction
│   └── anthropic.ts            # Real provider: shells to `claude -p` (OAuth, no API key)
└── examples/
    └── run-example.ts          # Minimal end-to-end demo using the stub
```

---

## Quickstart

```bash
npm install
npm run example                 # offline demo with the stub provider
npm run harness:stub            # full harness run with stub (deterministic; same numbers every time)
npm run harness:anthropic       # full harness run using `claude -p` (requires Claude OAuth)
npx tsx harness.ts --provider ollama   # full harness run against local Ollama (no API key, open weights)
npx tsx harness.ts --provider openai   # requires OPENAI_API_KEY
npx tsx harness.ts --provider gemini   # requires GOOGLE_API_KEY
```

The `anthropic` runs require [Claude Code](https://docs.claude.com/en/docs/claude-code) installed at `~/.local/bin/claude` and an authenticated OAuth session. No API key is read or required.

### Running against open-weights models via Ollama

The `providers/ollama.ts` adapter routes the operating-layer agents (PM, QA, Automation Engineer, Developer, PR Reviewer) through a local [Ollama](https://ollama.com) server, so the multi-agent pipeline can be exercised against open-weights Llama-family models (and any other Ollama-compatible model: Mistral, Qwen, CodeLlama, or a locally fine-tuned variant). This is the open-weights complement to the hosted-model paths above and follows the open-weights LLM-testing pattern demonstrated in [Rehan et al. 2025](https://github.com/Shaheer-Rehan/Llama-2-for-Software-Testing).

```bash
# one-time setup
brew install ollama          # or download from https://ollama.com/download
ollama serve &               # start the local API on http://localhost:11434
ollama pull llama3.2         # ~2 GB; substitute any Ollama-served model

# run the harness against the local model
npx tsx harness.ts --provider ollama

# pick a different model or endpoint
OLLAMA_MODEL=codellama:13b npx tsx harness.ts --provider ollama
OLLAMA_HOST=http://remote-gpu:11434 OLLAMA_MODEL=llama3.1:70b \
  npx tsx harness.ts --provider ollama
```

The committed §6.1 artifact (`results.json`) comes from the live Claude Sonnet 4.6 run described in the manuscript. The stub, Ollama, OpenAI, and Gemini paths are included so reviewers can inspect the same wiring without requiring that exact hosted-model session.

Results are written to `results.json` at the end of every harness run. **Note:** `npm run harness:stub`, `npm run harness:anthropic`, and `npm run example` overwrite `results.json` — but the committed `results.json` is the live §6.1 artifact from the manuscript. To inspect the article's numbers, run `npm run reproduce:paper` (which does **not** overwrite it), or restore the committed file afterward with `git checkout results.json`.

---

## Mobile module (additional scaffolding — not part of the evaluated study)

A small public mobile feasibility study (`mobile/`) exercises the same observability substrate against a public Android reference application — the [Sauce Labs My Demo App](https://github.com/saucelabs/sample-app-mobile) (MIT-licensed). The study records the same event schema and tier-routing model used in §6.1 on the mobile modality. It is not a production-scale mobile evaluation and does not claim production-scale mobile generality.

The mobile feasibility study reports:
- 13 mobile test cases against a public Android reference app
- One `HealingEvent` emitted per test case onto the shared substrate
- 12 of 13 cases resolved; 1 unrecovered failure reported (not swallowed)
- Same schema reused across the web evaluation and this mobile scaffolding; zero schema drift
- Hardware-in-the-loop not evaluated — architectural extension only

### Deterministic replay command (no Appium, no emulator required)

```bash
npm run example:mobile          # writes results-mobile.json
npm run test:mobile             # validates schema + counts; exits 0 on pass
```

The replay completes in <5 seconds, requires no Android toolchain, no LLM API key, and is byte-stable across runs. This module is repository scaffolding for the target-agnostic design; it is **not** part of the article's evaluated study, which is web-only (the calibration study in §6.1).

### Optional live-Appium mode

A future live-Appium mode is sketched in [`mobile/README-LIVE-APPIUM.md`](mobile/README-LIVE-APPIUM.md). It is not required to reproduce the manuscript numbers.

### Full paper-reproduction command

```bash
npm run reproduce:paper         # web example + mobile example + schema tests
```

### Claim boundaries

- Schema and substrate reuse are demonstrated across the web and mobile artifacts.
- Mobile evidence is deterministic dispatch and event capture on one public mobile target.
- Unrecovered failures are reported in the event stream instead of being swallowed.
- This is not a production-scale mobile testing accuracy claim.
- The LLM-as-judge κ measurement is web-only at the §6.1 scale.
- Hardware-in-the-loop is architectural only in this package; it is not evaluated.

---

## Reproducing the article's numbers

The article reports the following headline figures from the committed §6.1 live web artifact (`results.json`) and the §6.2 deterministic mobile artifact (`results-mobile.json`):

| Metric | Value |
|---|---:|
| Web test cases | 30 |
| Web recovered | 29/30 |
| Pipeline runtime (live run) | 1665.695 s (~27.8 min) |
| Cache hit rate | 0.000 |
| DOM healer success rate | 1.000 |
| Vision-fallback success rate | 1.000 |
| Combined recovery rate | 0.967 |
| Visual assertion corpus | 24 images |
| Visual assertion Cohen's kappa vs seeded key | 0.667 |
| Visual assertion precision | 1.000 |
| Visual assertion recall | 0.667 |
| Pixel-comparison precision | 1.000 |
| Pixel-comparison recall | 0.500 |
| Mobile test cases | 13 |
| Mobile recovered | 12/13 |
| Hardware-in-the-loop evaluated | false |

`results.json` also records `authoringVelocity.speedup` (≈3.2× over N=5 agent-assisted vs N=3 hand-authored modules). The manuscript reports this as a *practitioner observation, not an empirical result* (§6 — "carries no inferential weight"), so it is excluded from the headline figures above.

To reproduce:

```bash
git clone https://github.com/SuneetMalhotra/agent-harness
cd agent-harness
npm install
npm run reproduce:paper
cat results.json | jq '{
  metadata,
  authoringVelocity,
  pipelineReview,
  pipelineRuntime,
  tierRouting,
  healing: .healing | {cacheHitRate, domHealerSuccessRate, visionFallbackSuccessRate, combinedRecoveryRate},
  assertion: .visualAssertion | {precision, recall, pixelComparisonPrecision, pixelComparisonRecall},
}'
cat results-mobile.json | jq '{metadata, testCases, healingEvents, recovered, unrecovered, firstDispatchCorrect, sameSchemaReused, comparison}'
```

`npm run reproduce:paper` runs the offline web example, the deterministic mobile replay, and the mobile schema checks. The committed live web artifact is `results.json`; rerunning `npm run harness:anthropic` requires Claude OAuth and may not be byte-stable across hosted model changes.

---

## Methodology notes

- **Same-model evaluation.** The intelligence layer's healing verdicts and the visual assertion service's pass/fail verdicts come from the same model family used elsewhere in the run. The article discloses this and ships a human spot-audit protocol for the 24-image visual corpus; human ratings would strengthen the seeded-key validation reported in §6.1.
- **Three-tier stubs.** The reference implementation stubs Tier 1 (physical bench), Tier 2 (cloud farm), and Tier 3 (virtual hardware). Production deployments swap in real adapters (ADB-driven WebDriverIO sessions, Appium-compatible cloud-farm clients, CDK-provisioned ephemeral peripheral emulators).
- **MCP stubbing.** The five-agent pipeline runs against a stubbed MCP layer. Production deployments host MCP servers internally for issue tracking, test management, version control, and design tooling; the agents access them over standard HTTP transport. The pipeline contract is the same in either case.
- **Temperature 0.** All generation and grading runs use deterministic decoding.

---

## Citing this work

```bibtex
@article{Malhotra2026CrossLayerObservability,
  author  = {Malhotra, Suneet},
  title   = {Cross-Layer Observability for {LLM}-Assisted Test Automation:
             A Reference Architecture with Web and Mobile Feasibility Studies},
  journal = {Journal of Systems and Software (submitted)},
  year    = {2026},
  note    = {Companion code: https://github.com/SuneetMalhotra/agent-harness
             (release tag v1.4.0-jss-ready)}
}
```

---

## Disclosure

The author is Senior Manager, Test Engineering at Motorola Solutions. This work, the article, and this repository reflect the author's independent professional thinking and do not describe any specific employer's systems, products, code, data, screenshots, or operational metrics. All examples are illustrative and constructed from public sources (a React Native TodoMVC-style demo design encoded in `harness.ts`).

## License

Released under the MIT License (see `LICENSE`). © 2026 Suneet Malhotra. The companion article text itself is not covered by this license.
