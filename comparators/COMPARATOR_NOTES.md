<!--
Comparator notes for the agent-harness reference implementation. This
file maps the harness's design choices against four published
predecessors and is the companion to /Users/suneetmalhotra/Desktop/
EB-1A_Petition/eb-1/COMPARATOR_REPO_ANALYSIS.md.
-->

# Comparator notes

This document maps the agent-harness's design choices against four
published predecessors. It is a reading aid for reviewers; it makes
no normative claim about which design is best.

## 1. MetaGPT (geekan/MetaGPT)

| Pattern | MetaGPT | Agent-harness |
| --- | --- | --- |
| Role definition | `metagpt/roles/*.py`, `Role` base class with profile/goal/constraints | `agents/*.md` + `sop/*.sop.md` + `*_SYSTEM` constants in `pipeline.ts` |
| Action sequencing | `_observe → _think → _act`, `react_mode` ∈ {REACT, BY_ORDER, PLAN_AND_ACT} | `pipeline.ts` is `BY_ORDER` only |
| Shared memory | `Environment.memory` (in-process message bus) | `observability.ts` (typed event substrate) |
| Output style | Multi-file project | Single-test-case-per-artifact |

We borrowed the *declarative SOP* shape — every role has a one-page
contract — into `sop/*.sop.md`. We did not borrow the
`PLAN_AND_ACT` mode or the dynamic `_think` step; the harness's
pipeline is fully deterministic in its step ordering, by design, so
the substrate is auditable without re-deriving control flow.

## 2. ChatDev (OpenBMB/ChatDev)

| Pattern | ChatDev | Agent-harness |
| --- | --- | --- |
| Phase orchestration | `CompanyConfig/Default/ChatChainConfig.json` (chatdev1.0) | `pipeline.ts` |
| Role pairing | Every phase has `assistant_role` + `user_role` (e.g. Programmer ↔ Code Reviewer) | One sender per handoff; ChatDev-style pairing available via `dialogue/communicative-handoff.ts` |
| Cyclic refinement | `CodeReview` runs 3 cycles of comment + modification | Single review per artifact by default; cyclic mode documented in `sop/pr-reviewer.sop.md` §6 |
| Reflection | Per-phase `need_reflect: true` flag | `reflect: true` option in `runCommunicativeHandoff` |

We borrowed the *dialogue handoff* shape into `dialogue/`. We did
not adopt the per-phase JSON config format (`ChatChainConfig.json` +
`PhaseConfig.json` + `RoleConfig.json`); the harness uses TypeScript
constants because the harness's phase count (4) is too small to
justify a config-driven runtime and the typed substrate gives stronger
guarantees than JSON role descriptors.

## 3. AutoDroid (MobileLLM/AutoDroid)

| Pattern | AutoDroid | Agent-harness |
| --- | --- | --- |
| Screen representation | `utg.yaml` per app (UI Transition Graph) | `VISUAL_CORPUS` (24 independent snapshots) |
| State-level memory | `memory/app_state_summary.json` (state-hash → function), `memory/ex_mem.json` (state-hash → task path) | Locator cache keyed by semantic name (not state) |
| Exploration | DroidBot random walk + LLM task plan | None; tests are authored top-down from the PRD |

We did not borrow the screen-graph or per-state memory into runtime
code. The reason is documented in `extensions/screen-graph.md`: the
graph only becomes useful after the harness has run against a real
app for many hours, which the public reference implementation does
not do. The design note in `extensions/screen-graph.md` is the
planned landing spot when that paired emulator harness exists.

## 4. Llama-2 for Software Testing (Shaheer-Rehan/Llama-2-for-Software-Testing)

| Pattern | Rehan et al. | Agent-harness |
| --- | --- | --- |
| Test generation | Fine-tuned Llama-2-7b-chat-hf on Microsoft methods2test (FM_FC, 25 K records, 12 epochs, QLoRA) | Zero-shot via `providers/` model interface |
| Granularity | Java unit tests (one focal method → one test method) | TypeScript test cases (one TestCase → one WebDriverIO test file) |
| Evaluation | Compare generated tests to baseline tests on unseen focal methods | Functional metrics (cache hit rate, healing recovery rate, visual assertion precision/recall) on a sketch app |
| Hardware | A100 GPU (Colab) | Provider-agnostic (stub, Anthropic, OpenAI, Gemini, Ollama) |

We did not borrow fine-tuning into the harness. The harness's
Automation Engineer agent is prompt-driven, not fine-tuned, because
the test-code shape changes whenever the intelligence layer's API
changes (`smart.find`, `visual.assert`); a fine-tuned model would
require a retraining pass per API revision. Their dataset format
(focal-method → unit-test) is also a different granularity than the
harness operates at (test-case spec → integration test). The natural
landing spot for fine-tuning in *this* harness would be the DOM /
vision healers in `intelligence.ts` — both have a fixed I/O contract
and a high call volume, so a small fine-tuned model could replace
the generic provider call. The companion repo for Article 1 carries
the fine-tuning recipe outline; see
`/Users/suneetmalhotra/work/specification-enrichment/recipes/llama-finetune-template.md`.

## Crosscut: what every comparator shares with this harness

- All four treat a *substrate* (file system, message bus, observability
  log) as the unit of integration between agents. The harness's
  substrate is the typed observability log in `observability.ts`.
- All four privilege *declarative* role / phase definitions over
  imperative orchestration. The harness's declarative surface is the
  combination of `agents/*.md`, `sop/*.sop.md`, and the typed
  artifacts in `types.ts`.
- None of the four exposes the multi-tier hardware orchestration the
  harness has in `tier-router.ts`. That is original to this work; no
  comparator pattern was borrowed for the execution layer.
