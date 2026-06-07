#!/usr/bin/env node
// chaos/score-healing.mjs
//
// Scores a self-healing resolver against the labeled perturbation set from
// generate-perturbations.mjs. For each perturbation it (1) loads the page,
// (2) BREAKS the brittle selector via the recorded mutation, (3) asks a
// resolver to find the element from a semantic query, (4) compares the
// resolved element's identity to groundTruth.
//
//   success    = resolved the CORRECT element (text+tag/role match)
//   false-heal = resolved a DIFFERENT element (would cause a false pass)  <-- the dangerous one
//   miss       = resolved nothing
//
// Reports accuracy-by-difficulty-band, overall, Mean-Time-To-Heal, and
// false-heal rate — the metrics the reviews demanded (real denominators +
// MTTH + false-positive), suitable for a Healenium baseline comparison.
//
// Usage:
//   node chaos/score-healing.mjs --in chaos/perturb-portfolio.json \
//        --resolver text-role --out chaos/results-healing-bench.json
//
// Resolvers:
//   brittle-only  baseline: only the original (now-broken) selector -> establishes the failure floor
//   text-role     baseline: find by visible text + role (vision-free heuristic)
//   cascade       YOUR repo cascade (cache->DOM-healer->vision) -- wire in resolveWithCascade()
//   healenium     Healenium baseline -- wire in resolveWithHpotenium()
//
// Run locally (needs Playwright + a reachable target URL). Not part of CI.

import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { classify, aggregate } from './metrics.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1]]] : a), [])
);
const IN = args.in || 'chaos/perturbations.json';
const OUT = args.out || 'chaos/results-healing-bench.json';
const RESOLVER = args.resolver || 'text-role';


// ---- break the brittle selector exactly per the recorded difficulty band ----
async function applyMutation(page, p) {
  return await page.evaluate(({ sel, kind }) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const rnd = 'x' + Math.random().toString(36).slice(2, 8);
    // 1) ALWAYS invalidate the recorded brittle selector, whatever its type
    if (sel.startsWith('#')) el.id = rnd;
    else if (sel.startsWith('[data-testid')) el.setAttribute('data-testid', rnd);
    else if (sel.startsWith('.')) el.className = rnd;
    // 2) band-specific ADDITIONAL difficulty on top of the broken selector
    switch (kind) {
      case 'rename-class': break; // selector already broken above
      case 'rename-id-testid':
        if (el.id) el.id = rnd + 'b';
        if (el.getAttribute('data-testid')) el.setAttribute('data-testid', rnd + 'b');
        break;
      case 'restructure-dom': {
        const w = document.createElement('div'); const w2 = document.createElement('div');
        el.parentNode.insertBefore(w, el); w.appendChild(w2); w2.appendChild(el); break;
      }
      case 'retext-sibling':
        [...el.parentElement.children].forEach((c) => { if (c !== el && c.childElementCount === 0) c.textContent = rnd; });
        break;
      case 'attr-reorder-minify':
        [...el.attributes].forEach((a) => { if (!/^(href|type|value)$/.test(a.name)) el.removeAttribute(a.name); });
        el.className = rnd; break;
    }
    return true;
  }, { sel: p.brittleSelector, kind: p.mutation });
}

// describe an ElementHandle for ground-truth comparison
const describe = (h) => h.evaluate((n) => ({
  tag: n.tagName.toLowerCase(), role: n.getAttribute('role') || null,
  text: (n.innerText || n.value || '').trim().slice(0, 80),
}));

// ---- resolvers ----
async function resolveBrittleOnly(page, p) {
  const h = await page.$(p.brittleSelector).catch(() => null);
  return { handle: h, strategy: 'brittle' };
}
async function resolveTextRole(page, p, q) {
  // vision-free heuristic: first visible element whose text matches the query
  const h = await page.evaluateHandle((q) => {
    const all = [...document.querySelectorAll('a,button,input,[role],[data-testid],*')];
    const want = (q.text || '').replace(/\s+/g, ' ').trim().toLowerCase();
    return all.find((n) => n.offsetParent !== null &&
      (n.innerText || n.value || '').replace(/\s+/g, ' ').trim().toLowerCase() === want) || null;
  }, q);
  const el = h.asElement();
  return { handle: el, strategy: 'text-role' };
}
async function resolveWithCascade(page, p, q) {
  // LLM DOM-healer via `claude -p`: tag visible interactive candidates with a
  // stable data-heal-idx, send their context to Claude, resolve the chosen idx.
  const cands = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('a,button,input,[role],[onclick],[tabindex],svg')]
      .filter((n) => n.offsetParent !== null).slice(0, 80);
    return nodes.map((n, i) => {
      n.setAttribute('data-heal-idx', String(i));
      return {
        i, tag: n.tagName.toLowerCase(), role: n.getAttribute('role') || null,
        text: (n.innerText || n.value || '').trim().slice(0, 60),
        aria: n.getAttribute('aria-label') || n.getAttribute('title') || null,
        near: (n.parentElement?.innerText || '').trim().slice(0, 60),
      };
    });
  });
  const prompt = `You are a self-healing test locator. The original selector broke after a DOM change. ` +
    `Target element: role=${q.role}, text=${JSON.stringify(q.text)}, aria=${JSON.stringify(q.ariaLabel)}. ` +
    `Candidates on the current page (JSON): ${JSON.stringify(cands)}. ` +
    `Reply with ONLY the integer "i" of the candidate that is the SAME element as the target (match on meaning/role/context, not just exact text), or -1 if none match.`;
  const env = { ...process.env }; delete env.CLAUDECODE; delete env.CLAUDE_CODE_ENTRYPOINT;
  let out;
  try { out = execFileSync('claude', ['-p', prompt], { env, encoding: 'utf8', timeout: 90000, maxBuffer: 1 << 20 }); }
  catch { return { handle: null, strategy: 'cascade-error' }; }
  const idx = parseInt((out.match(/-?\d+/) || ['-1'])[0], 10);
  if (idx < 0) return { handle: null, strategy: 'dom-healer-none' };
  const h = await page.$(`[data-heal-idx="${idx}"]`).catch(() => null);
  return { handle: h, strategy: 'dom-healer' };
}
// eslint-disable-next-line no-unused-vars
async function resolveWithHealenium(page, p, q) {
  // TODO(wire): drive the same case through a Healenium-backed Selenium session and
  // return the element it resolved. Return { handle, strategy: 'healenium' }.
  throw new Error('healenium resolver not wired — implement resolveWithHealenium()');
}
const RESOLVERS = { 'brittle-only': resolveBrittleOnly, 'text-role': resolveTextRole, cascade: resolveWithCascade, healenium: resolveWithHealenium };

async function main() {
  const data = JSON.parse(readFileSync(IN, 'utf8'));
  const resolve = RESOLVERS[RESOLVER];
  if (!resolve) throw new Error(`unknown resolver: ${RESOLVER}`);
  const browser = await chromium.launch();
  const rows = [];

  for (const p of data.perturbations) {
    const page = await browser.newPage();
    let outcome = 'error', strategy = null, ms = 0, resolved = null;
    try {
      await page.goto(p.url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(Number(args.settle || 2500));
      const broke = await applyMutation(page, p);
      if (!broke) { await page.close(); rows.push({ id: p.id, band: p.difficultyBand, outcome: 'target-missing' }); continue; }
      const q = { role: p.groundTruth.role, text: p.groundTruth.text, ariaLabel: p.groundTruth.ariaLabel };
      const t0 = Date.now();
      const r = await resolve(page, p, q);
      ms = Date.now() - t0; strategy = r.strategy;
      if (!r.handle) outcome = 'miss';
      else {
        const got = await describe(r.handle);
        resolved = got;
        outcome = classify(got, p.groundTruth);
      }
    } catch (e) { outcome = 'error'; }
    await page.close();
    rows.push({ id: p.id, band: p.difficultyBand, mutation: p.mutation, outcome, strategy, ms, target: p.groundTruth.text, resolvedText: resolved?.text ?? null });
  }
  await browser.close();

  // ---- aggregate ----
  const report = aggregate(rows, { resolver: RESOLVER, source: IN });
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(`[${RESOLVER}] accuracy ${report.accuracy} (${report.successCount}/${report.scored}) · false-heal ${report.falseHealRate} · MTTH ${report.meanTimeToHealMs}ms`);
  console.log('by band:', report.accuracyByBand);
  console.log(`wrote ${OUT}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
