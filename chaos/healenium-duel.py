#!/usr/bin/env python3
"""
chaos/healenium-duel.py — Healenium baseline for the locator-healing duel.

Protocol per perturbation (Healenium heals from a PRIOR successful find, not
from a semantic query, so it needs a record run then a heal run):
  1) RECORD: load the clean page, find by the brittle selector -> Healenium
     proxy stores the element's node tree.
  2) HEAL:   reload, apply the SAME mutation the JS scorer uses (breaking the
     selector), find by the brittle selector -> on NoSuchElement the proxy
     heals via tree similarity and returns an element.
Healing success = resolved the CORRECT element by ground truth (tag/role/text);
false-heal = a different element; miss = NoSuchElement after healing.

Driver points at the Healenium proxy (:8085); the dockerized Chrome reaches the
host app via host.docker.internal. Run with the venv that has selenium:
  chaos/healenium/venv/bin/python chaos/healenium-duel.py --in chaos/perturb-supabase.json --n 65
"""
import json, sys, time, argparse
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.common.exceptions import NoSuchElementException, WebDriverException

ap = argparse.ArgumentParser()
ap.add_argument("--in", dest="inp", default="chaos/perturb-supabase.json")
ap.add_argument("--out", default="chaos/res-sb-healenium.json")
ap.add_argument("--proxy", default="http://localhost:8085/wd/hub")
ap.add_argument("--n", type=int, default=10**9)
ap.add_argument("--settle", type=float, default=5.0)
a = ap.parse_args()

# the dockerized Chrome reaches the host's Supabase Studio via host.docker.internal
def hosted(url): return url.replace("localhost", "host.docker.internal").replace("127.0.0.1", "host.docker.internal")

# SAME mutation logic as chaos/score-healing.mjs applyMutation
MUTATE_JS = r"""
const sel = arguments[0], kind = arguments[1];
const el = document.querySelector(sel);
if (!el) return false;
el.setAttribute('data-truth','1');
const rnd = 'x' + Math.random().toString(36).slice(2, 8);
if (sel.startsWith('#')) el.id = rnd;
else if (sel.startsWith('[data-testid')) el.setAttribute('data-testid', rnd);
else if (sel.startsWith('.')) el.className = rnd;
switch (kind) {
  case 'rename-class': break;
  case 'rename-id-testid':
    if (el.id) el.id = rnd + 'b';
    if (el.getAttribute('data-testid')) el.setAttribute('data-testid', rnd + 'b'); break;
  case 'restructure-dom': {
    const w = document.createElement('div'), w2 = document.createElement('div');
    el.parentNode.insertBefore(w, el); w.appendChild(w2); w2.appendChild(el); break; }
  case 'retext-sibling':
    [...el.parentElement.children].forEach(c => { if (c !== el && c.childElementCount === 0) c.textContent = rnd; }); break;
  case 'attr-reorder-minify':
    [...el.attributes].forEach(at => { if (!/^(href|type|value|data-truth)$/.test(at.name)) el.removeAttribute(at.name); });
    el.className = rnd; break;
}
return true;
"""

def norm(t): return " ".join((t or "").split()).lower()

def classify(hashandle, is_truth):
    if not hashandle: return "miss"
    return "success" if is_truth else "false-heal"

def new_driver():
    opts = webdriver.ChromeOptions()
    return webdriver.Remote(command_executor=a.proxy, options=opts)

data = json.load(open(a.inp))
rows = []
for p in data["perturbations"][: a.n]:
    sel, truth = p["brittleSelector"], p["groundTruth"]
    url = hosted(p["url"])
    d = None
    try:
        d = new_driver(); d.set_page_load_timeout(60)
        # 1) record run (clean)
        d.get(url); time.sleep(a.settle)
        try: d.find_element(By.CSS_SELECTOR, sel)
        except NoSuchElementException: pass
        # 2) heal run (mutated)
        d.get(url); time.sleep(a.settle)
        broke = d.execute_script(MUTATE_JS, sel, p["mutation"])
        if not broke:
            rows.append({"id": p["id"], "band": p["difficultyBand"], "outcome": "target-missing"}); continue
        t0 = time.time(); got = None
        is_truth = False
        try:
            el = d.find_element(By.CSS_SELECTOR, sel)   # healenium heals on failure
            got = {"tag": el.tag_name, "text": (el.text or el.get_attribute("value") or "").strip()}
            is_truth = (el.get_attribute("data-truth") == "1")
        except NoSuchElementException:
            got = None
        ms = int((time.time() - t0) * 1000)
        outcome = classify(got is not None, is_truth)
        rows.append({"id": p["id"], "band": p["difficultyBand"], "mutation": p["mutation"],
                     "outcome": outcome, "strategy": "healenium", "ms": ms,
                     "target": truth["text"], "resolvedText": got["text"] if got else None})
    except WebDriverException as e:
        rows.append({"id": p["id"], "band": p["difficultyBand"], "outcome": "error", "err": str(e)[:120]})
    finally:
        if d:
            try: d.quit()
            except Exception: pass
    r = rows[-1]
    print(f"  {r['id']} band{r.get('band')} -> {r['outcome']}" + (f" ({r.get('ms')}ms)" if r.get('ms') else ""), flush=True)

scored = [r for r in rows if r["outcome"] in ("success", "false-heal", "miss")]
succ = [r for r in scored if r["outcome"] == "success"]
def rate(n): return round(n / len(scored), 3) if scored else None
report = {
    "resolver": "healenium", "source": a.inp, "scored": len(scored),
    "accuracy": rate(len(succ)), "successCount": len(succ),
    "falseHealRate": rate(len([r for r in scored if r["outcome"] == "false-heal"])),
    "missRate": rate(len([r for r in scored if r["outcome"] == "miss"])),
    "meanTimeToHealMs": round(sum(r.get("ms", 0) for r in succ) / len(succ)) if succ else None,
    "rows": rows,
}
json.dump(report, open(a.out, "w"), indent=2)
print(f"[healenium] accuracy {report['accuracy']} ({report['successCount']}/{report['scored']}) "
      f"false-heal {report['falseHealRate']} miss {report['missRate']} MTTH {report['meanTimeToHealMs']}ms")
print("wrote", a.out)
