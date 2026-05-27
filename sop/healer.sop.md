<!--
SOURCE INSPIRATION: MetaGPT, metagpt/roles/role.py — the BY_ORDER react
mode in particular. The locator-resolver cascade in intelligence.ts is
a fixed-order action sequence with conditional advance, which is
isomorphic to MetaGPT's BY_ORDER state machine over a small action
list. We document it here as its own SOP because the cascade is a
first-class operator in the execution layer, even though it does not
have its own .md file in agents/.
-->

# Healer "Role" — SOP (locator resolver)

Maps to: `intelligence.ts`, `Intelligence.find()`.

The healer is not an LLM agent in the same sense as PM / QA /
Automation Engineer / PR Reviewer; it is a *resolver* that calls the
model only when the cache misses. We document it as a role anyway
because every `smart.find` call is a small state machine and every
state transition emits a `HealingEvent` to the substrate.

## 1. Profile
I am the Healer. Given a semantic name for a UI element, I return a
locator strategy that resolves it on the current screen, drawing on a
cache first, a fallback hint second, a DOM-based model third, and a
vision-based model last.

## 2. Watched events
- A `smart.find(semanticName, options)` call from an Automation Engineer-
  authored test.

## 3. State machine (cascade)
1. **Cache lookup** — if `cache.get(semanticName)` hits, emit
   `HealingEvent{ resolvedStrategy: "cache", success: true }` and
   return the cached strategy.
2. **Fallback hint** — if the caller supplied `options.fallbackHint`,
   cache it, emit `HealingEvent{ resolvedStrategy: "fallback-hint" }`,
   and return.
3. **DOM healer** — prompt the model with the semantic name and the
   page source; accept the top candidate if `confidence ≥ 0.7`; cache
   and emit `HealingEvent{ resolvedStrategy: "dom-healer" }`.
4. **Vision healer** — prompt the model with the semantic name and the
   screenshot; accept the top candidate if `confidence ≥ 0.6`; cache
   and emit `HealingEvent{ resolvedStrategy: "vision-healer" }`.
5. **Failure** — emit `HealingEvent{ resolvedStrategy: "failed",
   success: false }` and return an empty strategy.

## 4. Produced artifact
None persisted; the side effect is a `HealingEvent` per call and a
cache mutation on success.

## 5. Handoff
The healer is internal to the execution layer. Its outputs feed the
test that called `smart.find`; its observability entries feed the
audit packets.

## 6. Failure modes & retry
- **Soft**: model returns a malformed JSON candidate list — fall
  through to the next stage of the cascade; do not retry within stage.
- **Soft**: model returns a candidate below the confidence floor —
  fall through.
- **Hard**: model call throws — fall through to the next stage; emit
  `failed` only if every stage falls through.

## Confidence floors — why these specific values
The 0.7 floor for the DOM healer and 0.6 floor for the vision healer
are calibrated against the §6.1 evaluation. Lowering either floor
admits more false-positive locators (test passes but exercises the
wrong element); raising either floor drops the recovery rate. The
defaults are the Pareto knee.

## Cross-reference to MetaGPT
The cascade is the harness's `react_mode = BY_ORDER` analogue:
actions execute in a fixed sequence; the state advances when an
action's exit condition (confidence floor) is not met. Unlike
MetaGPT's `_think`, the advance condition is deterministic, not
LLM-decided. This is by design — we want the healer's behaviour
auditable from the substrate alone, with no second LLM in the loop.
