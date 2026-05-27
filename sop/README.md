<!--
SOURCE INSPIRATION: MetaGPT (https://github.com/geekan/MetaGPT)
Specifically: metagpt/roles/role.py (Role base class) and metagpt/roles/
product_manager.py / architect.py / engineer.py / qa_engineer.py.

MetaGPT's central thesis is "Code = SOP(Team)": each role is encoded with
an explicit profile, goal, constraints, list of watched actions, and a
state machine (Role.rc.state + Role.actions + react_mode in {REACT,
BY_ORDER, PLAN_AND_ACT}).

The reference implementation in this repo already encodes role prompts in
agents/*.md and orchestrates them in pipeline.ts. The sop/ directory does
NOT replace any of that; it adds a parallel, human-readable Standard
Operating Procedure document per role, mirroring the MetaGPT pattern of
declarative role specs. Each SOP file is a single-page contract a reader
(or a downstream model) can use to reason about what the role does,
without having to read TypeScript.
-->

# Role SOPs (Standard Operating Procedures)

These documents are an additive overlay on the role prompts in
`agents/*.md`. The prompts in `agents/*.md` are what the model sees; the
SOP files here describe the *operating procedure* a role follows — its
preconditions, its decision points, its exit criteria, and the
observability events it must emit.

The pattern is borrowed from MetaGPT's "Code = SOP(Team)" formulation:
each role's behaviour is encoded as a state machine over a small set of
actions, with explicit watch / produce edges to other roles. The
reference implementation in `pipeline.ts` is the executable form of
the SOPs in this directory.

## Files

| File | Maps to existing artifact |
| ---- | ------------------------- |
| `product-manager.sop.md` | `agents/product-manager-agent.md`, `PM_SYSTEM` in `pipeline.ts` |
| `qa-engineer.sop.md` | `agents/qa-engineer-agent.md`, `QA_SYSTEM` in `pipeline.ts` |
| `automation-engineer.sop.md` | `agents/automation-engineer-agent.md`, `AUTOMATION_SYSTEM` in `pipeline.ts` |
| `pr-reviewer.sop.md` | `agents/pr-reviewer-agent.md`, `PR_REVIEWER_SYSTEM` in `pipeline.ts` |
| `healer.sop.md` | `intelligence.ts` (`Intelligence.find` cascade) |
| `aggregator.sop.md` | `harness.ts` (results.json writer) |

## What a SOP file contains

Every SOP file in this directory has six sections, modelled on the
implicit contract that MetaGPT's `Role` base class enforces:

1. **Profile** — one-sentence identity ("I am the X agent").
2. **Watched events** — what entries in the observability substrate
   trigger this role (the analogue of MetaGPT's `_observe`).
3. **State machine** — the ordered actions the role takes once
   triggered (the analogue of MetaGPT's `_think` + `_act`).
4. **Produced artifact** — the typed output the role emits.
5. **Handoff** — the downstream role and the `AgentHandoff` event
   emitted to the substrate.
6. **Failure modes & retry** — what counts as a soft failure (retry
   in-role) versus a hard failure (escalate).

## Why SOPs as documents and not just code

The five-agent pipeline in `pipeline.ts` is already executable; the
SOP files here add three things the code does not:

- **Reviewability**: a reader can audit role behaviour without reading
  TypeScript and without running the pipeline.
- **Drift detection**: when a prompt in `agents/*.md` changes, the
  corresponding SOP is a check on whether the change is in-scope for
  the role or a scope expansion.
- **Onboarding**: a new contributor reads the SOPs first, the prompts
  second, the orchestration third.
