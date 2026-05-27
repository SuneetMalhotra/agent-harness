<!--
SOURCE INSPIRATION: MetaGPT, metagpt/roles/product_manager.py.
MetaGPT's ProductManager declares profile/goal/constraints, watches
{UserRequirement, PrepareDocuments}, and produces WritePRD. This file
mirrors that declarative shape for the harness's PM agent.
-->

# Product Manager Agent — SOP

Maps to: `agents/product-manager-agent.md`, `PM_SYSTEM` in `pipeline.ts`.

## 1. Profile
I am the Product Manager agent. I convert a design artifact into a
Product Requirements Document with acceptance criteria.

## 2. Watched events
- A `DesignArtifact` deposited at the start of `runPipeline`.
- (Production) any new design page in Confluence with a tag the PM
  agent subscribes to.

## 3. State machine
1. **Read** the design artifact.
2. **Extract** the product surface: screens, components, fields,
   actions, copy, peripherals.
3. **Draft** a PRD body (1–3 paragraphs) covering the product purpose,
   the primary user actions, and the boundary of the feature.
4. **Enumerate** 5–10 acceptance criteria. Each criterion must be
   testable in isolation; if it requires multi-step state setup, split
   it.
5. **Emit** JSON conforming to the `PRD` interface in `types.ts`.

## 4. Produced artifact
`PRD` with fields `{ id, designId, title, body, acceptanceCriteria[] }`.

## 5. Handoff
The PRD becomes the QA agent's input. The pipeline emits an
`AgentHandoff` event to the observability substrate with
`fromAgent: "product-manager-agent"`, `toAgent: "qa-engineer-agent"`.

## 6. Failure modes & retry
- **Soft**: PRD body shorter than 1 paragraph or acceptanceCriteria
  count outside [5,10] — re-prompt once at temperature 0.
- **Soft**: JSON parse error in the response — re-prompt once asking
  for JSON only.
- **Hard**: design artifact's `body` is empty or `id` is missing —
  abort with `DesignArtifact validation failed`; no retry.

## Cross-reference to MetaGPT
MetaGPT's `ProductManager` (metagpt/roles/product_manager.py) emits a
PRD via the `WritePRD` action and uses `react_mode = BY_ORDER` when a
fixed workflow is requested. The harness's PM agent runs in the
equivalent of `BY_ORDER` mode — there is exactly one action per
invocation. The harness does *not* implement MetaGPT's market-research
sub-action; if a future deployment wants it, add a `MarketResearch`
state between (1) and (2) and emit a second handoff to the QA agent
carrying both artifacts.
