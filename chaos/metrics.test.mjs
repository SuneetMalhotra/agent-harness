// chaos/metrics.test.mjs — run: node --test chaos/metrics.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, aggregate, norm } from './metrics.mjs';

const truth = { tag: 'button', role: null, text: 'Save' };

test('classify: exact match is success', () => {
  assert.equal(classify({ tag: 'button', role: null, text: 'Save' }, truth), 'success');
});
test('classify: whitespace/case-insensitive match is success', () => {
  assert.equal(classify({ tag: 'button', role: null, text: '  save ' }, truth), 'success');
});
test('classify: no element is miss', () => {
  assert.equal(classify(null, truth), 'miss');
});
test('classify: wrong element (different text) is false-heal', () => {
  assert.equal(classify({ tag: 'button', role: null, text: 'Cancel' }, truth), 'false-heal');
});
test('classify: empty resolved text is not a success', () => {
  assert.equal(classify({ tag: 'button', role: null, text: '' }, truth), 'false-heal');
});
test('classify: role match accepted when tag differs', () => {
  assert.equal(classify({ tag: 'div', role: 'button', text: 'Save' }, { ...truth, role: 'button' }), 'success');
});

test('aggregate: rates, MTTH, by-band, ignores non-scored rows', () => {
  const rows = [
    { band: 1, outcome: 'success', ms: 100 },
    { band: 1, outcome: 'false-heal', ms: 50 },
    { band: 2, outcome: 'success', ms: 300 },
    { band: 2, outcome: 'miss', ms: 0 },
    { band: 2, outcome: 'target-missing' }, // excluded from scoring
  ];
  const r = aggregate(rows, { resolver: 'x' });
  assert.equal(r.scored, 4);
  assert.equal(r.successCount, 2);
  assert.equal(r.accuracy, 0.5);
  assert.equal(r.falseHealRate, 0.25);
  assert.equal(r.missRate, 0.25);
  assert.equal(r.meanTimeToHealMs, 200); // mean of success ms (100,300)
  assert.equal(r.accuracyByBand['1'], '0.5 (1/2)');
  assert.equal(r.accuracyByBand['2'], '0.5 (1/2)');
});

test('norm collapses whitespace and lowercases', () => {
  assert.equal(norm('  Hello\n World '), 'hello world');
});
