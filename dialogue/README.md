<!--
SOURCE INSPIRATION: ChatDev — chat-chain protocol in
CompanyConfig/Default/ChatChainConfig.json (chatdev1.0 branch) and the
phase-level prompts in PhaseConfig.json. ChatDev runs every phase as a
two-turn dialogue between an assistant_role and a user_role, with
optional reflection.
-->

# `dialogue/` — communicative-handoff mode

This directory adds an *optional* alternative to the default
single-shot typed-event handoff used by `pipeline.ts`. The default
remains canonical; nothing in this directory is wired in by default.

## Why add it

The default handoff is one-shot: the upstream agent emits an artifact,
the downstream agent consumes it, and the substrate records an
`AgentHandoff` event. This is the cheapest reliable shape. It breaks
down when the upstream artifact is ambiguous in a way the downstream
agent could resolve with one clarifying question — instead of asking,
the downstream agent has to guess and the guess shows up later as a
malformed test or a `request-changes` review.

ChatDev's chat-chain protocol addresses this by structuring every
inter-role exchange as a dialogue: the user_role requests, the
assistant_role responds, and optional reflection follows. The cost is
2–3× the model calls per handoff; the benefit is fewer downstream
re-prompts and a cleaner audit trail of what was clarified vs.
guessed.

## When to use this module

Use `runCommunicativeHandoff` when:
- the receiving agent's task has irreducible ambiguity the sender
  could trivially resolve;
- you are willing to pay 2–3 extra model calls per handoff in exchange
  for fewer downstream `request-changes` reviews;
- the audit packet must show *what was clarified*, not just *what was
  sent*.

Do NOT use it when:
- the artifact is already fully specified (PRD → testcase is usually
  this case);
- the latency budget is tight (each clarification round adds one
  round-trip);
- the downstream agent's prompt already accepts ambiguity gracefully
  (the PR Reviewer's `block` disposition, for example, is by design
  the agent saying "I can't decide", which is itself a kind of
  out-of-band clarification).

## API

```ts
import { runCommunicativeHandoff } from './dialogue/communicative-handoff.js';

const result = await runCommunicativeHandoff(provider, obs, {
  fromAgent: 'product-manager-agent',
  toAgent: 'qa-engineer-agent',
  artifactSummary: 'PRD-001: TodoMVC mobile',
  receiverSystem: QA_SYSTEM,
  receiverUser: `PRD:\n${JSON.stringify(prd, null, 2)}`,
  reflect: false, // set true for ChatDev-style 3rd-turn reflection
});
// result.finalResponse — what downstream code consumes
// result.dialogue — full transcript for the audit packet
// result.clarified — whether a clarification round fired
```

## What this module does NOT do

- It does not modify the default pipeline. To opt in, a caller has to
  use `runCommunicativeHandoff` explicitly.
- It does not implement ChatDev's full N-cycle phase composition
  (e.g. `CodeCompleteAll = 10x CodeComplete`). The cyclic-refinement
  pattern lives in `sop/pr-reviewer.sop.md` §6 instead.
- It does not change the `AgentHandoff` event schema in `types.ts`.
  The dialogue transcript is serialised into the `promptId` field
  (e.g. `dialogue:turns=4:clarified=true`) so downstream tooling that
  reads the substrate sees a stable shape.

## Reading list

- ChatDev chat-chain config (chatdev1.0 branch):
  `CompanyConfig/Default/ChatChainConfig.json`,
  `CompanyConfig/Default/PhaseConfig.json`,
  `CompanyConfig/Default/RoleConfig.json`.
- The "communicative dehallucination" pattern in the ChatDev paper
  (arXiv:2307.07924) is the closest thing in the literature to the
  clarification round implemented here.
