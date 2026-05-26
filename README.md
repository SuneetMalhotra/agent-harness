# agent-harness

Reference implementation for the **Agent Harness** coupling pattern.

Companion code for the IEEE Software Feature article:

> Malhotra, S. "An Agent Harness for Mobile Test Automation: Coupling an Agent-Authored Framework, a Multi-Agent SDLC Pipeline, and a Three-Tier Execution Plane." *IEEE Software*, 2026 (under review). Preprint: arXiv:2606.NNNNN.

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
```

The `anthropic` runs require [Claude Code](https://docs.claude.com/en/docs/claude-code) installed at `~/.local/bin/claude` and an authenticated OAuth session. No API key is read or required. To install Claude Code, see [claude.com/code](https://www.claude.com/code).

Results are written to `results.json` at the end of every harness run.

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
@article{Malhotra2026AgentHarness,
  author  = {Malhotra, Suneet},
  title   = {An Agent Harness for Mobile Test Automation: Coupling an
             Agent-Authored Framework, a Multi-Agent SDLC Pipeline,
             and a Three-Tier Execution Plane},
  journal = {IEEE Software},
  year    = {2026},
  note    = {Under review. Preprint on arXiv:2606.NNNNN. Companion code:
             https://github.com/SuneetMalhotra/agent-harness}
}
```

---

## Disclosure

The author is Senior Manager, Test Engineering at Motorola Solutions. This work, the article, and this repository reflect the author's independent professional thinking and do not describe any specific employer's systems, products, code, or data. All examples are illustrative and constructed from public sources (a React Native TodoMVC-style demo design encoded in `harness.ts`).

## License

All rights reserved. © 2026 Suneet Malhotra. This repository is published for review and reproducibility of the companion article; no license is granted for redistribution or derivative works.
