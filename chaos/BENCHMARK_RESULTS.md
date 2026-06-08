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

---
## Generalization (§6.3) + coupling A/B (§6.4) — added

**Two apps × two models** (correct-element recovery, identity oracle):

| Resolver | Supabase Studio | Grafana |
|---|---:|---:|
| brittle-only | 0% (0/56) | 0% (0/80) |
| text-role | 34% (19/56) | 20% (16/80) |
| LLM healer — Claude Sonnet 4.6 | 62% (35/56) | 68% (54/80) |
| LLM healer — Hermes-3 (open-weights, Ollama) | 64% (36/56) | 55% (44/80) |

LLM healing (both models) recovers 55–68% across both apps; far above text-role (20–34%) and brittle (0%). Generalizes beyond one app and one model.

**Coupling A/B** (Supabase, N=57 paired; Variant A = intent only, Variant B = intent + cross-layer substrate digest):
- Variant A recovery 60% (34) · Variant B recovery **68% (39)** · false-heal 0.28 → 0.26
- discordant: B-only 8, A-only 3 → exact McNemar **p ≈ 0.23** (directional, not significant)
- First direct evidence the cross-layer digest helps the healer; larger study needed to confirm.

Artifacts: `chaos/res-coupling-ab.json`, `chaos/res-sb-ollama.json`, `chaos/res-gf-allresolvers.json`, `chaos/res-gf-ollama.json`. Grafana via `docker run -e GF_AUTH_ANONYMOUS_ENABLED=true ... grafana/grafana`.
