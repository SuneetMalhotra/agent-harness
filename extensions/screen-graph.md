<!--
SOURCE INSPIRATION: AutoDroid (https://github.com/MobileLLM/AutoDroid).
Specifically: the utg.yaml (UI Transition Graph) artifact captured by
droidbot exploration, the per-app memory under memory/ in the repo
(app_state_summary.json keying state-hash → functional summary,
ex_mem.json keying state-hash → task path), and the screen-graph used
to localise an LLM-issued task on a real device.

This is a DESIGN NOTE only — no code is added. The Article 2 reference
implementation's visual layer is VISUAL_CORPUS in harness.ts (24
snapshots tagged with seeded defects). A screen-graph extension would
augment that corpus with cross-page navigation flows, the way
AutoDroid's UTG augments single-state policies with state-transition
policies.
-->

# Extension proposal — AutoDroid-style screen graph

Status: design note, **not implemented**. The default execution layer
(`intelligence.ts` + `harness.ts`'s `VISUAL_CORPUS`) is unchanged.

## What AutoDroid does

AutoDroid (Wen et al., 2024; arXiv:2308.15272) wraps DroidBot and
adds a per-app *memory* directory whose key files are:

- `memory/app_state_summary.json` — keyed by state-hash, maps each
  unique screen state to a short natural-language functional summary
  (e.g. "func: manage messenger settings and notifications").
- `memory/ex_mem.json` — keyed by state-hash, stores successful task
  paths the agent has previously executed (e.g. a 3-click path through
  the gallery app to enable "remember last video playback position").
- `memory/utgs/` — per-app UI Transition Graph files in YAML. Each
  UTG node is a state-hash; each edge is an input event that takes
  the app from one state to another.

At inference time AutoDroid retrieves the relevant prior path from
`ex_mem.json` by task-similarity, walks the UTG to plan the next
action, and falls back to fresh LLM-driven exploration only when no
matching path exists.

## What the harness has today

The execution layer's visual surface is fixed:
- `VISUAL_CORPUS` in `harness.ts` defines 24 snapshots; the harness
  calls `intel.assert` on each one.
- Each `AssertionEvent` is independent. There is no notion that
  snapshot 7 follows snapshot 6 along a navigation flow.
- The locator cache in `intelligence.ts` is keyed by *semantic name*,
  not by *screen state*. Two different screens that share a "Save"
  button get one cache entry, not two.

This is correct for the §6.1 evaluation (single-screen visual
assertion precision and recall) but it understates what the harness
can do once it has run against a real app for hours.

## Proposed extension

Add a `ScreenGraph` data structure in a new module (e.g.
`intelligence/screen-graph.ts`) with three responsibilities,
mirroring AutoDroid's `memory/` files:

1. **State hashing**. Compute a stable hash per screen — initially
   the SHA-256 of the page-source DOM with text values stripped;
   later, a learned embedding over the screenshot.

2. **Per-state functional summary** (analogue of
   `app_state_summary.json`). The first time a state is reached, emit
   one model call asking for a one-sentence functional description.
   Cache it forever, keyed by the state hash. Use this summary in
   downstream prompts as the "you are on screen X" preamble.

3. **Transition log** (analogue of `utg.yaml`). Every time a test
   advances from state S → action A → state S', append an edge
   `(S, A, S')` to the graph. The graph is the union over all test
   runs in the substrate.

The locator cache in `intelligence.ts` becomes a *function of state
hash*, not a global map: `cache: Map<StateHash, Map<SemanticName,
Strategy>>`. This admits two improvements:

- The Save button on the BLE settings screen and the Save button on
  the profile screen no longer collide.
- After enough runs, the graph carries the test-coverage map — every
  reachable state has at least one path in `ex_mem.json`-style
  storage, and `tier-router.ts` can route new tests by *graph
  position*, not just by tier label.

## What does NOT change

- The five-agent pipeline in `pipeline.ts` is untouched.
- `types.ts` is untouched. `ScreenGraph` is an internal data
  structure of the execution layer, not a public type.
- The §6.1 evaluation continues to produce the same numbers on the
  existing `VISUAL_CORPUS` because the corpus is single-screen.

## Why this is a design note and not an implementation

The graph only becomes valuable after the harness has run against a
real app for hours and accumulated thousands of state hashes. In the
public reference implementation the synthetic VISUAL_CORPUS would
trivially populate the graph with 24 disconnected nodes, which is
worse than no graph at all (it misleads the reader about the
mechanism). The right time to land this code is when the harness has
a paired Android emulator harness that exercises the demo app over
many runs.

## Reading list

- AutoDroid repo: https://github.com/MobileLLM/AutoDroid
- Key files to read first: `droidbot/utg.py` (the graph data
  structure), `memory/app_state_summary.json` (the summary format),
  `memory/ex_mem.json` (the task-path memory format).
- AutoDroid paper: Wen et al., "Empowering LLM to use Smartphone for
  Intelligent Task Automation," arXiv:2308.15272.
