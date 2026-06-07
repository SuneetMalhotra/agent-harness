// chaos/metrics.mjs — pure scoring + aggregation logic (unit-testable, no browser).

export const norm = (t) => (t || '').replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Classify a heal attempt against ground truth.
 *  - no resolved element                  -> 'miss'
 *  - resolved element matches identity     -> 'success'
 *  - resolved a DIFFERENT element          -> 'false-heal'  (the dangerous false pass)
 * Identity match = exact (normalized) text AND compatible tag/role.
 */
export function classify(got, truth) {
  if (!got) return 'miss';
  const textMatch = norm(got.text) === norm(truth.text) && norm(got.text).length > 0;
  const tagOk = got.tag === truth.tag || (got.role && got.role === truth.role);
  return textMatch && tagOk ? 'success' : 'false-heal';
}

/** Aggregate scored rows into the benchmark report metrics. */
export function aggregate(rows, meta = {}) {
  const scored = rows.filter((r) => ['success', 'false-heal', 'miss'].includes(r.outcome));
  const succ = scored.filter((r) => r.outcome === 'success');
  const byBand = {};
  for (const r of scored) {
    byBand[r.band] ??= { n: 0, success: 0 };
    byBand[r.band].n++;
    if (r.outcome === 'success') byBand[r.band].success++;
  }
  const rate = (n) => (scored.length ? +(n / scored.length).toFixed(3) : null);
  return {
    ...meta,
    scored: scored.length,
    accuracy: rate(succ.length),
    successCount: succ.length,
    falseHealRate: rate(scored.filter((r) => r.outcome === 'false-heal').length),
    missRate: rate(scored.filter((r) => r.outcome === 'miss').length),
    meanTimeToHealMs: succ.length ? Math.round(succ.reduce((a, r) => a + (r.ms || 0), 0) / succ.length) : null,
    accuracyByBand: Object.fromEntries(
      Object.entries(byBand).map(([b, v]) => [b, +(v.success / v.n).toFixed(3) + ` (${v.success}/${v.n})`])
    ),
    rows,
  };
}
