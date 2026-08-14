#!/usr/bin/env python3
"""Exact McNemar tests on the Supabase Studio locator-healing benchmark.

WHY: Table 1 reports recovery percentages per resolver but no paired test, so the
claim that the DOM-healer outperforms the alternatives rests on a difference in
proportions with no uncertainty attached. The per-case rows needed for a paired
test are already published in res-sb-allresolvers.json, so the test costs no new
runs and no new data.

The unit is one perturbation. Cases are paired because every resolver is scored
on the same perturbation set. `target-missing` rows (the element did not resolve
on the scoring load) count as non-success for both arms and therefore contribute
to neither discordant cell.

Exact binomial two-sided test, not the chi-square approximation: the discordant
counts here are small enough that the approximation is not appropriate.

Usage:
    python3 paired_tests.py
"""
from __future__ import annotations

import json
import math
import pathlib
from collections import Counter

HERE = pathlib.Path(__file__).resolve().parent
SOURCE = HERE / "res-sb-allresolvers.json"   # the run behind Table 1


def outcomes(by_resolver: dict, name: str) -> dict[str, str]:
    return {r["id"]: r.get("outcome") for r in by_resolver[name]["rows"]}


def scored(outcome: str | None) -> bool:
    return outcome not in (None, "", "not-scored", "unscored")


def mcnemar_exact(a: dict, b: dict) -> dict:
    """Two-sided exact McNemar on paired success/not-success outcomes."""
    ids = [i for i in a if i in b and scored(a[i]) and scored(b[i])]
    n_b = sum(1 for i in ids if a[i] == "success" and b[i] != "success")
    n_c = sum(1 for i in ids if a[i] != "success" and b[i] == "success")
    n_disc = n_b + n_c
    if n_disc == 0:
        return {"n": len(ids), "b": 0, "c": 0, "discordant": 0, "p": 1.0}
    k = min(n_b, n_c)
    tail = sum(math.comb(n_disc, i) for i in range(k + 1)) / 2 ** n_disc
    return {"n": len(ids), "b": n_b, "c": n_c, "discordant": n_disc,
            "p": min(2 * tail, 1.0)}


def main() -> int:
    by = json.loads(SOURCE.read_text())["byResolver"]
    res = {name: outcomes(by, name) for name in by}

    print(f"source: {SOURCE.name}")
    print(f"resolvers: {', '.join(res)}\n")

    for name, o in res.items():
        counts = Counter(v for v in o.values())
        n_scored = sum(1 for v in o.values() if scored(v))
        succ = counts.get("success", 0)
        print(f"{name:16} rows={len(o):3}  scored={n_scored:3}  "
              f"success={succ:3} ({succ / n_scored:.3f})  {dict(counts)}")

    print("\nPaired comparisons (exact two-sided McNemar):")
    pairs = [("cascade", "text-role"), ("cascade", "brittle-only"),
             ("text-role", "brittle-only")]
    for x, y in pairs:
        if x not in res or y not in res:
            continue
        r = mcnemar_exact(res[x], res[y])
        star = "significant" if r["p"] < 0.05 else "not significant"
        print(f"  {x:12} vs {y:14} n={r['n']:3}  b={r['b']:3} c={r['c']:3}  "
              f"discordant={r['discordant']:3}  p={r['p']:.3e}  {star}")

    print("\nReading: b counts perturbations the first resolver recovered and the "
          "second did not; c the reverse. Only discordant pairs carry information "
          "in McNemar's test.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
