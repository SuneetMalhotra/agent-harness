# Adversarial locator-healing benchmark — results (identity oracle)

Target: **Supabase Studio** (local, complex React admin UI). 65 labeled perturbations, 5 difficulty bands (11–12 each); 56 resolved on the scoring load (9 dropped to live-app drift). **Oracle: identity marker** — the true target is tagged with a persistent `data-truth` attribute before mutation; success = the resolved element IS that node (immune to text collisions, icon-only elements, layout shifts). The 3 Playwright resolvers share the identical per-case DOM; Healenium runs its own Selenium sessions on the same set.

| Resolver | Recovery | False-heal | Miss | Median heal |
|---|---:|---:|---:|---:|
| brittle-only (broken selector) | 0% (0/56) | 0.54 | 0.46 | — |
| Healenium 3.5.1 / proxy 2.2.1 (self-healing Selenium) | 21% (12/57) | 0.79 | 0.00 | 315 ms |
| text-role heuristic (vision-free) | 34% (19/56) | 0.57 | 0.09 | 2 ms |
| **LLM DOM-healer (`claude-sonnet-4-6` via `claude -p`)** | **63% (35/56)** | 0.27 | 0.11 | ~4.8 s |

By band — LLM healer 55–73% across all bands; text-role collapses to 0/11 on DOM restructuring:
- LLM healer: b1 7/11, b2 6/11, b3 6/11, b4 8/12, b5 8/11
- text-role: b1 4/11, b2 4/11, b3 **0/11**, b4 6/12, b5 5/11

Healenium by selector type: **`#id` invoked, 12/27 (44%) success**; **utility-class 0/30, all false-heal (proxy never invoked — broken class matches a sibling, no `NoSuchElement`)**. Highest false-heal (0.79) overall.

Caveats: one app, one model family, 56 perturbations, DOM-healer-only proxy; Supabase Studio may be partly in pre-training data. 27% false-heal → promising but not unsupervised-CI-safe.
