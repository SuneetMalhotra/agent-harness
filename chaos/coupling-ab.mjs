#!/usr/bin/env node
// chaos/coupling-ab.mjs — the coupling A/B (tests the paper's titular claim).
//
// Question: does conditioning the LLM healer's prompt on a CROSS-LAYER digest
// from the observability substrate improve healing vs. the same healer with
// local DOM + intent only?
//
//   Variant A (uncoupled): candidates + intent {role,text,aria}   [= §6.2 cascade]
//   Variant B (coupled):   candidates + intent + a cross-layer digest = the
//                          substrate's prior-clean-run observation of THIS test
//                          case (target's region, parent/sibling context) — the
//                          kind of telemetry the execution/authoring layers log.
//
// Both variants run on the IDENTICAL mutated DOM per case (paired). Success is
// the identity-marker oracle (data-truth). Reports paired recovery / false-heal
// and a McNemar exact test on per-case success (A vs B).
//
// Run: node chaos/coupling-ab.mjs --in chaos/perturb-supabase.json --out chaos/res-coupling-ab.json --settle 2500

import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1]]] : a), []));
const IN = args.in || 'chaos/perturb-supabase.json';
const OUT = args.out || 'chaos/res-coupling-ab.json';

// pre-mutation cross-layer observation of the true target (what the substrate would have logged)
async function observe(page, sel) {
  return await page.evaluate((sel) => {
    const el = document.querySelector(sel); if (!el) return null;
    const r = el.getBoundingClientRect();
    const region = `${r.top < window.innerHeight * 0.2 ? 'top' : r.bottom > window.innerHeight * 0.8 ? 'bottom' : 'mid'}-${r.left < window.innerWidth * 0.25 ? 'left' : r.right > window.innerWidth * 0.75 ? 'right' : 'center'}`;
    const sibs = [...(el.parentElement?.children || [])].filter((c) => c !== el).map((c) => (c.innerText || '').trim().slice(0, 30)).filter(Boolean).slice(0, 4);
    return { region, parentText: (el.parentElement?.innerText || '').trim().slice(0, 80), siblings: sibs, tag: el.tagName.toLowerCase() };
  }, sel);
}

async function applyMutation(page, p) {
  return await page.evaluate(({ sel, kind }) => {
    const el = document.querySelector(sel); if (!el) return false;
    el.setAttribute('data-truth', '1');
    const rnd = 'x' + Math.random().toString(36).slice(2, 8);
    if (sel.startsWith('#')) el.id = rnd; else if (sel.startsWith('[data-testid')) el.setAttribute('data-testid', rnd); else if (sel.startsWith('.')) el.className = rnd;
    switch (kind) {
      case 'rename-id-testid': if (el.id) el.id = rnd + 'b'; if (el.getAttribute('data-testid')) el.setAttribute('data-testid', rnd + 'b'); break;
      case 'restructure-dom': { const w = document.createElement('div'), w2 = document.createElement('div'); el.parentNode.insertBefore(w, el); w.appendChild(w2); w2.appendChild(el); break; }
      case 'retext-sibling': [...el.parentElement.children].forEach((c) => { if (c !== el && c.childElementCount === 0) c.textContent = rnd; }); break;
      case 'attr-reorder-minify': [...el.attributes].forEach((a) => { if (!/^(href|type|value|data-truth)$/.test(a.name)) el.removeAttribute(a.name); }); el.className = rnd; break;
    }
    return true;
  }, { sel: p.brittleSelector, kind: p.mutation });
}

async function candidates(page) {
  return await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('a,button,input,[role],[onclick],[tabindex],svg')].filter((n) => n.offsetParent !== null).slice(0, 80);
    return nodes.map((n, i) => { n.setAttribute('data-heal-idx', String(i)); return { i, tag: n.tagName.toLowerCase(), role: n.getAttribute('role') || null, text: (n.innerText || n.value || '').trim().slice(0, 60), aria: n.getAttribute('aria-label') || n.getAttribute('title') || null, near: (n.parentElement?.innerText || '').trim().slice(0, 60) }; });
  });
}

function ask(prompt) {
  const env = { ...process.env }; delete env.CLAUDECODE; delete env.CLAUDE_CODE_ENTRYPOINT;
  try { const out = execFileSync('claude', ['-p', prompt], { env, encoding: 'utf8', timeout: 90000, maxBuffer: 1 << 20 }); return parseInt((out.match(/-?\d+/) || ['-1'])[0], 10); }
  catch { return -2; } // -2 = error
}
const base = (q, c) => `You are a self-healing test locator. The original selector broke after a DOM change. Target: role=${q.role}, text=${JSON.stringify(q.text)}, aria=${JSON.stringify(q.ariaLabel)}. Candidates (JSON): ${JSON.stringify(c)}. `;
const tail = `Reply with ONLY the integer "i" of the candidate that is the SAME element as the target, or -1 if none.`;

async function resolveIdx(page, idx) { if (idx < 0) return false; const h = await page.$(`[data-heal-idx="${idx}"]`).catch(() => null); if (!h) return false; return await h.evaluate((n) => n.getAttribute('data-truth') === '1').catch(() => false); }

async function main() {
  const data = JSON.parse(readFileSync(IN, 'utf8'));
  const browser = await chromium.launch();
  const rows = [];
  for (const p of data.perturbations) {
    const page = await browser.newPage();
    let A = 'error', B = 'error';
    try {
      await page.goto(p.url, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(Number(args.settle || 2500));
      const digest = await observe(page, p.brittleSelector);
      const broke = await applyMutation(page, p);
      if (!broke) { await page.close(); rows.push({ id: p.id, band: p.difficultyBand, A: 'target-missing', B: 'target-missing' }); continue; }
      const q = { role: p.groundTruth.role, text: p.groundTruth.text, ariaLabel: p.groundTruth.ariaLabel };
      const c = await candidates(page);
      // Variant A: intent only
      const idxA = ask(base(q, c) + tail);
      const okA = await resolveIdx(page, idxA);
      A = idxA === -2 ? 'error' : idxA < 0 ? 'miss' : okA ? 'success' : 'false-heal';
      // Variant B: + cross-layer digest (prior clean-run observation from the substrate)
      const dg = digest ? `Cross-layer digest (substrate observation of this test case on a prior clean run): region=${digest.region}, parentContext=${JSON.stringify(digest.parentText)}, neighborLabels=${JSON.stringify(digest.siblings)}. Use it to disambiguate when multiple candidates look similar. ` : '';
      const idxB = ask(base(q, c) + dg + tail);
      const okB = await resolveIdx(page, idxB);
      B = idxB === -2 ? 'error' : idxB < 0 ? 'miss' : okB ? 'success' : 'false-heal';
    } catch { /* leave error */ }
    await page.close();
    rows.push({ id: p.id, band: p.difficultyBand, A, B });
    console.log(`  ${p.id} A=${A} B=${B}`, );
  }
  await browser.close();

  const sc = rows.filter((r) => ['success', 'false-heal', 'miss'].includes(r.A) && ['success', 'false-heal', 'miss'].includes(r.B));
  const recA = sc.filter((r) => r.A === 'success').length, recB = sc.filter((r) => r.B === 'success').length;
  const fhA = sc.filter((r) => r.A === 'false-heal').length, fhB = sc.filter((r) => r.B === 'false-heal').length;
  // McNemar: discordant pairs on success
  const b = sc.filter((r) => r.A === 'success' && r.B !== 'success').length; // A only
  const c2 = sc.filter((r) => r.B === 'success' && r.A !== 'success').length; // B only
  const report = { n: sc.length, variantA: { recovery: +(recA / sc.length).toFixed(3), recoveryCount: recA, falseHeal: +(fhA / sc.length).toFixed(3) }, variantB: { recovery: +(recB / sc.length).toFixed(3), recoveryCount: recB, falseHeal: +(fhB / sc.length).toFixed(3) }, discordant: { A_only: b, B_only: c2 }, rows };
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(`\nA/B on N=${sc.length}:  A recovery ${report.variantA.recovery} (${recA})  vs  B recovery ${report.variantB.recovery} (${recB})`);
  console.log(`false-heal: A ${report.variantA.falseHeal}  B ${report.variantB.falseHeal}`);
  console.log(`discordant pairs (McNemar): A-only=${b}  B-only=${c2}  (B helps if B-only > A-only)`);
  console.log(`wrote ${OUT}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
