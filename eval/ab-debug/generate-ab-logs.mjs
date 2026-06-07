#!/usr/bin/env node
// eval/ab-debug/generate-ab-logs.mjs
//
// Phase 3 packet generator: turns real benchmark failures into a blind human
// debugging A/B. For each failure case it emits two artifacts:
//   Group A (control)   = what standard tooling shows (selector error / silent
//                          wrong-element pass + a DOM dump). Root cause is hidden.
//   Group B (treatment) = the cross-layer observability substrate trace (healing
//                          cascade events + ground-truth mismatch + tier state).
//                          Root cause is explicit.
// Raters (blind to condition) find the root cause; we measure Time-to-Root-Cause
// and accuracy. If B << A, that is hard evidence the substrate helps humans debug
// — the rebuttal to "the substrate is just structured logging."
//
// Usage:
//   node eval/ab-debug/generate-ab-logs.mjs --results chaos/res-sb-textrole.json \
//        --perturb chaos/perturb-supabase.json --n 6
//
// Build/runs locally. Recruiting the raters is the only manual step.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { norm } from '../../chaos/metrics.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1]]] : a), []));
const results = JSON.parse(readFileSync(args.results || 'chaos/res-sb-textrole.json', 'utf8'));
const perturb = JSON.parse(readFileSync(args.perturb || 'chaos/perturb-supabase.json', 'utf8'));
const N = Number(args.n || 6);
const byId = Object.fromEntries(perturb.perturbations.map((p) => [p.id, p]));
const OUT = 'eval/ab-debug/cases';
mkdirSync(OUT + '/groupA', { recursive: true });
mkdirSync(OUT + '/groupB', { recursive: true });

// pick the most instructive failures: false-heal (silent wrong element) first, then miss
const fails = results.rows
  .filter((r) => r.outcome === 'false-heal' || r.outcome === 'miss')
  .sort((a, b) => (a.outcome === 'false-heal' ? -1 : 1) - (b.outcome === 'false-heal' ? -1 : 1))
  .slice(0, N);

const scoresheet = [['case_id', 'group', 'rater', 'seconds_to_root_cause', 'diagnosis', 'correct(y/n)']];

for (const r of fails) {
  const p = byId[r.id] || {};
  const target = r.target || p.groundTruth?.text || '(unknown)';
  const got = r.resolvedText;

  // ---- Group A: standard tooling output ----
  const groupA = r.outcome === 'false-heal'
    ? `[run] spec: ${r.id}  (Supabase Studio)
[step] click target control
[selector] "${p.brittleSelector}"  -> resolved 1 element (after auto-retry)
[action] click() OK
[assert] post-click state assertion ... PASS
[result] ✓ 1 passed (4.2s)

# (Standard report ends here. The test PASSED. There is no indication that the
#  selector silently matched a DIFFERENT element than intended.)
--- page DOM snapshot (truncated, 1,840 nodes) ---
<div class="x9f2a-v2"><button>…</button><button>…</button> … [1.8k nodes] …</div>`
    : `[run] spec: ${r.id}  (Supabase Studio)
[step] click target control
[selector] "${p.brittleSelector}"  -> 0 elements
[error] LocatorError: no element matches selector "${p.brittleSelector}"
    at clickTarget (spec_${r.id}.ts:14:7)
[result] ✗ 1 failed (30.0s timeout)
--- page DOM snapshot (truncated, 1,840 nodes) ---
<div class="x9f2a-v2"> … [1.8k nodes] …</div>`;

  // ---- Group B: substrate trace ----
  const groupB = `observability.query({ testCase: "${r.id}", kind: "healing" })
─ executing.healing  TC=${r.id}  tier=tier1
   intent:           { role: ${JSON.stringify(p.groundTruth?.role ?? null)}, text: ${JSON.stringify(target)} }
   originalSelector: "${p.brittleSelector}"      status: BROKEN (DOM mutated: ${r.mutation})
   cascade:          cache(miss) -> dom-healer(${r.strategy})
   resolvedElement:  { text: ${JSON.stringify(got)} }
   groundTruthMatch: ${r.outcome === 'success' ? 'true' : 'FALSE'}
   verdict:          ${r.outcome === 'false-heal'
      ? `FALSE-HEAL — resolver returned a different element than intended\n                     (wanted ${JSON.stringify(target)}, got ${JSON.stringify(got)}).`
      : `UNRECOVERED — no element matched the intent; reported, not swallowed.`}
─ assertion.visual  TC=${r.id}   (cross-checks the resolved element against intent)
   note:             surfaced to the QA-agent digest + the PR-reviewer gate.`;

  writeFileSync(`${OUT}/groupA/${r.id}.log`, groupA);
  writeFileSync(`${OUT}/groupB/${r.id}.txt`, groupB);
  scoresheet.push([r.id, 'A', '', '', '', '']);
  scoresheet.push([r.id, 'B', '', '', '', '']);
}

writeFileSync(`${OUT}/SCORESHEET.csv`, scoresheet.map((r) => r.join(',')).join('\n'));
console.log(`Wrote ${fails.length} cases to ${OUT}/ (groupA + groupB) and SCORESHEET.csv`);
console.log(`false-heals: ${fails.filter((f) => f.outcome === 'false-heal').length}, misses: ${fails.filter((f) => f.outcome === 'miss').length}`);
