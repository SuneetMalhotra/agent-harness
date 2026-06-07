// chaos/metrics.test.mjs — run: node --test chaos/metrics.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, aggregate, norm } from './metrics.mjs';

test('classify: no handle is miss', () => assert.equal(classify(false, false), 'miss'));
test('classify: resolved the marked true element is success', () => assert.equal(classify(true, true), 'success'));
test('classify: resolved a different element is false-heal', () => assert.equal(classify(true, false), 'false-heal'));

test('aggregate: rates, MTTH, by-band, ignores non-scored rows', () => {
  const rows = [
    { band: 1, outcome: 'success', ms: 100 },
    { band: 1, outcome: 'false-heal', ms: 50 },
    { band: 2, outcome: 'success', ms: 300 },
    { band: 2, outcome: 'miss', ms: 0 },
    { band: 2, outcome: 'target-missing' },
  ];
  const r = aggregate(rows, { resolver: 'x' });
  assert.equal(r.scored, 4);
  assert.equal(r.successCount, 2);
  assert.equal(r.accuracy, 0.5);
  assert.equal(r.falseHealRate, 0.25);
  assert.equal(r.missRate, 0.25);
  assert.equal(r.meanTimeToHealMs, 200);
  assert.equal(r.accuracyByBand['1'], '0.5 (1/2)');
});
test('norm collapses whitespace and lowercases', () => assert.equal(norm('  Hello\n World '), 'hello world'));
