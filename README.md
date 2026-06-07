# agent-harness

Reference implementation for the **Agent Harness** coupling pattern.

Companion code for a *Journal of Systems and Software* (JSS) submission:

> Malhotra, S. "Cross-Layer Observability for LLM-Assisted Test Automation: A Reference Architecture with Web and Mobile Feasibility Studies." Submitted to the *Journal of Systems and Software* (Elsevier), 2026.

---

## What this is

Published work on agent-assisted mobile testing breaks into three lanes: self-healing locators, multi-agent SDLC pipelines, and LLM-backed test-case generation. Each treats one layer of the stack in isolation. The **Agent Harness** is a coupling pattern that ties three such layers together through a shared observability substrate:

- **Authoring layer:** a framework whose source is agent-authored under a human review checkpoint.
- **Operating layer:** a five-agent SDLC pipeline (PM, QA, Automation Engineer, Developer, PR Reviewer) whose handoffs flow through external artifact systems over the Model Context Protocol.
- **Execution layer:** three orchestrated hardware tiers (physical device bench, commercial cloud real-device farm, ephemeral virtual hardware) mediated by an intelligence layer for locator healing and visual assertion.

The substrate is the contribution: an append-only log per layer with a canonical schema and a thin query API. Each layer remains testable in isolation; the substrate is what makes the harness reflexive rather than three independent systems.

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

The §6.1 architecture-validation walkthrough was produced against the stub provider; live runs (Anthropic, OpenAI, Gemini, or Ollama) exercise the full pipeline against real models for cross-model and cross-backend comparison (deferred to the §7.2 live-hardware multi-application study).

Results are written to `results.json` at the end of every harness run.

---

## Mobile feasibility study

A small public mobile feasibility study (`mobile/`) exercises the same observability substrate against a public Android reference application — the [Sauce Labs My Demo App](https://github.com/saucelabs/sample-app-mobile) (MIT-licensed). The study demonstrates that the substrate, event schema, and tier-routing model that §6.1 reports on the web modality also work on the mobile modality. **It is not a production-scale mobile evaluation** and does not claim production-scale mobile generality.

The mobile feasibility study reports:
- 13 mobile test cases against a public Android reference app
- One `HealingEvent` emitted per test case onto the shared substrate
- 12 of 13 cases resolved; 1 unrecovered failure reported (not swallowed)
- Same schema reused across web (§6.1) and mobile (§6.2); zero schema drift
- Hardware-in-the-loop **NOT evaluated** — an architectural extension only

### Deterministic replay command (no Appium, no emulator required)

```bash
npm run example:mobile          # writes results-mobile.json
npm run test:mobile             # validates schema + counts; exits 0 on pass
```

The replay completes in <5 seconds, requires no Android toolchain, no LLM API key, and is byte-stable across runs. The resulting `results-mobile.json` is the source of the §6.2 mobile feasibility numbers in the manuscript.

### Optional live-Appium mode

A future live-Appium mode is sketched in [`mobile/README-LIVE-APPIUM.md`](mobile/README-LIVE-APPIUM.md). It is not required to reproduce the manuscript numbers.

### Full paper-reproduction command

```bash
npm run reproduce:paper         # web example + mobile example + schema tests
```

### What is and is not claimed

- ✅ Schema and substrate **reuse** across web and mobile
- ✅ Deterministic **dispatch and event capture** on a public mobile target
- ✅ The cascade **reports** unrecovered failures rather than swallowing them
- ❌ NOT a production-scale mobile testing accuracy claim
- ❌ NOT an LLM-as-judge κ measurement on mobile (web-only at the §6.1 scale)
- ❌ NOT a hardware-in-the-loop evaluation (architectural extension only)

---

## Reproducing the article's numbers

The article reports the following headline figures from §6.1 (public-dataset evaluation):

| Metric | Value |
|---|---:|
| Authoring velocity speedup | 3.2× |
| Pipeline runtime (median, end-to-end) | ~17 min |
| Cache hit rate after warmup | 92% |
| DOM healer success rate | 88% |
| Vision-fallback success rate | 79% |
| Combined recovery rate | 97% |
| Visual assertion precision | 92% |
| Visual assertion recall | 92% |
| Pixel-comparison precision | 100% |
| Pixel-comparison recall | 50% |

To reproduce:

```bash
git clone https://github.com/SuneetMalhotra/agent-harness
cd agent-harness
npm install
npm run harness:anthropic > harness.log 2>&1
cat results.json | jq '{
  healing: .healing | {cacheHitRate, domHealerSuccessRate, visionFallbackSuccessRate, combinedRecoveryRate},
  assertion: .visualAssertion | {precision, recall, pixelComparisonPrecision, pixelComparisonRecall},
  tierRouting
}'
```

The harness is deterministic at temperature 0, but model output is not byte-stable across model versions. The article pins the model version (`claude-sonnet-4-6`); subsequent runs against newer model versions may produce slightly different absolute numbers, though the qualitative direction has been stable across the versions we tested. The offline stub (`npm run harness:stub`) reproduces the article's headline figures exactly for replication purposes.

---

## Methodology notes

- **Same-model evaluation.** The intelligence layer's healing verdicts and the visual assertion service's pass/fail verdicts come from the same model family as the agent that generated the test cases. The article discloses this and ships an audit protocol (`audit/protocol.md` in the parent package) for a human spot-audit. The audit-rated rates are required before the §6.1 numbers can be cited as validation-scale evidence.
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
             (release tag v1.3.1-jss-final)}
}
```

---

## Disclosure

The author is Senior Manager, Test Engineering at Motorola Solutions. This work, the article, and this repository reflect the author's independent professional thinking and do not describe any specific employer's systems, products, code, data, screenshots, or operational metrics. All examples are illustrative and constructed from public sources (a React Native TodoMVC-style demo design encoded in `harness.ts`).

## License

All rights reserved. © 2026 Suneet Malhotra. This repository is published for review and reproducibility of the companion article; no license is granted for redistribution or derivative works.
