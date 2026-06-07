#!/usr/bin/env node
// chaos/generate-perturbations.mjs
//
// Generates a LABELED locator-perturbation benchmark to give the self-healing
// cascade a real denominator with ground truth (fixes the "1.000 on 11 cases"
// critique). For each seed target on a page, it records a robust ground-truth
// descriptor of the correct element, then breaks the brittle selector at a
// controlled difficulty band. The healing system is later scored on whether it
// resolves the GROUND-TRUTH element from the perturbed DOM — not merely whether
// the test continued.
//
// Output: perturbations.json  (the benchmark dataset + ground truth)
//
// Usage:
//   npm i -D playwright && npx playwright install chromium
//   node chaos/generate-perturbations.mjs --url http://localhost:5173 --out perturbations.json
//   node chaos/generate-perturbations.mjs --url https://suneetmalhotra.com --out web-perturb.json
//
// NOTE: this is the dataset GENERATOR. Wiring the harness's WebDriverIO healing
// cascade to consume perturbations.json and emit a resolved element per case is
// the (small) integration step — see chaos/README.md. Run on your machine;
// not executed in CI.

import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1]]] : a), [])
);
const URL = args.url || 'http://localhost:5173';
const OUT = args.out || 'perturbations.json';
const PER_TARGET = Number(args.repeat || 1);

// Difficulty bands — each mutates the page so the original brittle selector fails,
// while a robust human could still identify the same element.
const BANDS = {
  1: 'rename-class',        // .todo-list -> .list-todo-v2
  2: 'rename-id-testid',    // #add-btn / [data-testid] swapped
  3: 'restructure-dom',     // wrap target in extra divs (depth change)
  4: 'retext-sibling',      // change nearby text labels (vision/context harder)
  5: 'attr-reorder-minify', // strip semantic attrs, randomize class names
};

// A ground-truth descriptor that does NOT depend on the broken selector:
// visible text, ARIA role, tag, and bounding-box centroid. Healing is "correct"
// iff the resolved element matches this descriptor.
async function describe(el) {
  return await el.evaluate((n) => {
    const r = n.getBoundingClientRect();
    return {
      tag: n.tagName.toLowerCase(),
      role: n.getAttribute('role') || null,
      text: (n.innerText || n.value || '').trim().slice(0, 80),
      ariaLabel: n.getAttribute('aria-label') || null,
      centroid: { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) },
      box: { w: Math.round(r.width), h: Math.round(r.height) },
    };
  });
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(Number(args.settle || 4000)); // let SPAs hydrate

  // Seed targets: interactive elements with currently-stable selectors.
  // Customize this list per target app (see chaos/README.md for suneetmalhotra.com / Supabase Studio sets).
  const seeds = await page.$$eval(
    'a, button, input, [role="button"], [role="link"], [role="tab"], [role="menuitem"]',
    (nodes) => {
      const out = [];
      const seen = new Set();
      for (const n of nodes) {
        if (n.offsetParent === null) continue;                      // visible only
        if (n.querySelector('a,button,input,[role="button"]')) continue; // leaf-ish (not a container)
        const r = n.getBoundingClientRect();
        if (r.width === 0 || r.width > 400 || r.height > 120) continue;   // discrete control, not a region
        const text = (n.innerText || n.value || n.getAttribute('aria-label') || '').trim();
        if (text.length < 1 || text.length > 40) continue;          // short, distinctive label
        const sel =
          (n.id && `#${CSS.escape(n.id)}`) ||
          (n.getAttribute('data-testid') && `[data-testid="${n.getAttribute('data-testid')}"]`) ||
          (n.className && typeof n.className === 'string' && n.className.trim() && `.${CSS.escape(n.className.trim().split(/\s+/)[0])}`) ||
          n.tagName.toLowerCase();
        if (seen.has(sel)) continue; seen.add(sel);
        out.push({ idx: out.length, brittleSelector: sel });
        if (out.length >= 40) break;
      }
      return out;
    }
  );

  const perturbations = [];
  let id = 0;
  for (const seed of seeds) {
    const el = await page.$(seed.brittleSelector).catch(() => null);
    if (!el) continue;
    const truth = await describe(el);
    for (const [band, kind] of Object.entries(BANDS)) {
      for (let r = 0; r < PER_TARGET; r++) {
        perturbations.push({
          id: `P${String(id++).padStart(4, '0')}`,
          url: URL,
          brittleSelector: seed.brittleSelector,
          difficultyBand: Number(band),
          mutation: kind,
          groundTruth: truth, // healing is correct iff resolved element matches this
        });
      }
    }
  }

  writeFileSync(OUT, JSON.stringify({ url: URL, generatedTargets: seeds.length, perturbations }, null, 2));
  console.log(`Wrote ${OUT}: ${perturbations.length} labeled perturbations across ${Object.keys(BANDS).length} difficulty bands from ${seeds.length} seed targets.`);
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
