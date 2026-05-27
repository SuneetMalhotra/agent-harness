<!--
SOURCE INSPIRATION: MetaGPT, metagpt/roles/role.py — Role.publish_message
and the Environment's memory-as-substrate pattern. The aggregator in this
harness reads the observability substrate at the end of a run, computes
the §6.1 metrics, and emits results.json; it is the closest analogue to
MetaGPT's final emission step.
-->

# Aggregator "Role" — SOP (evaluation aggregator)

Maps to: the tail of `harness.ts` (everything after the pipeline +
execution layers run; the `EvaluationResult` assembly and the
`writeFileSync('results.json', ...)` call).

## 1. Profile
I am the Aggregator. I read the observability substrate at the end of
a harness run, compute the §6.1 metrics, and emit `results.json`.

## 2. Watched events
None at runtime. The aggregator is invoked once, at the end of
`main()` in `harness.ts`, after the pipeline and the execution layer
have appended their final events.

## 3. State machine
1. **Collect** every `HealingEvent` and `AssertionEvent` from the
   substrate.
2. **Compute** cache hit rate, DOM healer success rate, vision
   fallback success rate, combined recovery rate.
3. **Compute** visual assertion precision and recall against the
   seeded-defect ground truth in `VISUAL_CORPUS`.
4. **Compute** tier-routing accuracy from
   `Observability.tierRoutingAccuracy()`.
5. **Assemble** an `EvaluationResult` per `types.ts`.
6. **Write** `results.json` and log a one-line summary per metric to
   stdout.

## 4. Produced artifact
`EvaluationResult` (and its serialised form in `results.json`).

## 5. Handoff
The aggregator is the terminal step. Its output is the input to the
audit packets under `audit/packet/` and to the manuscript's §6.1
figures.

## 6. Failure modes & retry
- **Soft**: zero healing events (empty cascade) — write `results.json`
  with all healing rates set to 0 and log a warning. Do not crash.
- **Soft**: zero assertion events — same pattern; emit precision and
  recall as 0 and log a warning.
- **Hard**: `writeFileSync` fails (disk full, permission denied) —
  abort and surface the error; do not silently drop the artifact.

## Cross-reference to MetaGPT
MetaGPT's terminal step is the Engineer agent writing source files to
disk via `Role.publish_message`. The aggregator here is the equivalent
shape — a final role that consumes the substrate and writes a single
artifact — but the artifact is the evaluation, not the product. The
harness is *the* product; the artifact is the evidence the harness
runs end-to-end and produces the claimed metrics.
