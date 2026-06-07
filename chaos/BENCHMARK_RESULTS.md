# Adversarial locator-healing benchmark — results

Target: **Supabase Studio** (local, complex React admin UI). 65 labeled perturbations across 5 difficulty bands. All resolvers scored on the **identical loaded+mutated DOM per case** (live app drifts between runs). Healing success = resolved the **correct** element (ground-truth tag/role/text), false-heal = wrong element (silent pass), miss = nothing.

| Resolver | Recovery (correct element) | False-heal | Miss | Median heal time |
|---|---:|---:|---:|---:|
| brittle-only (broken selector) | 8% (5/65) | 0.38 | 0.54 | 17 ms |
| text-role heuristic (vision-free) | 39% (25/65) | 0.54 | 0.08 | 2 ms |
| Healenium (self-healing Selenium, proxy + record-then-heal) | 25% (16/64) | 0.59 | 0.16 | 336 ms |
| LLM DOM-healer (`claude-sonnet-4-6` via `claude -p`) | **63% (41/65)** | 0.23 | 0.14 | ~5.5 s |

By difficulty band — text-role collapses to 0% on DOM restructuring (band 3); the LLM healer holds:
- text-role: b1 0.46, b2 0.46, b3 **0.00**, b4 0.54, b5 0.46
- LLM healer: b1 0.62, b2 0.62, b3 **0.62**, b4 0.62, b5 0.69

Complementarity: LLM healer recovers 19 cases the heuristic misses; heuristic recovers only 3 the healer misses. Ensemble (union) ≈ 0.68.

Reproduce: `node chaos/generate-perturbations.mjs --url http://localhost:54323 --out chaos/perturb-supabase.json --settle 6000 && node chaos/score-healing.mjs --in chaos/perturb-supabase.json --resolver all --out chaos/res-sb-allresolvers.json`

Caveats: one application, one model family, 65 cases, DOM-healer-only proxy (no cache/vision tiers), Supabase Studio UI may be partly in pre-training data. Healenium structural-similarity baseline + more apps + 2nd model = priority extensions.


## Healenium breakdown (added)
Real Healenium 3.5.1 stack (hlm-backend + proxy 2.2.1 + Selenium grid + Chrome), verified healing (20 heal attempts, 8 selectors stored). By selector type: **`#id` targets 47% recovered (16/34)** — heals on true zero-match via tree similarity; **class targets 0/30, all false-heal** — broken utility-class selector matches a sibling, so no zero-match fires. This is why algorithmic selector-healing degrades on modern utility-class UIs, and why the intent-based LLM healer (63%) wins.
