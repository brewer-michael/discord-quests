"""Fixed versus scaling defenses, across hero levels, over the engine's own bestiary.

    python3 sim/scaled_defenses.py packages/core/src/srd/bestiary.generated.ts

A move rolls d20 + stat + proficiency against Fortitude (Str/Con), Reflex (Dex/Int) or Will (Wis/Cha), the same roll
as a weapon attack against armor class. Ways to set the defenses from a stat block:

- fixed c:   c + the higher ability modifier of the pair (defenses.py's "c + save", without save proficiencies,
             which the engine's creatures don't carry).
- scaled k:  k + the creature's proficiency bonus by challenge rating + the higher ability modifier: every defense
             as if the creature were proficient in that save. 4e's defenses grow with level the same way
             (10 + half level + ability), and Pathfinder 2e sets creature saves by level.
- anchored d: the creature's armor class + d, shifted by how far the pair's modifier sits from the mean of its three
             pair modifiers. The three defenses average AC + d, so they grow with challenge exactly as armor class
             does, and each creature keeps its own weak and strong spots. 4e's monster rules start the other
             defenses 2 below AC and adjust them for the creature's strengths (4e DMG, from secondary sources).
- tiered n:  by rank, from the creature's armor class: its weakest pair AC - n, the middle one AC, the strongest
             AC + n. Pathfinder 2e builds creatures this way: AC and each save come from tables by level, and each
             save takes a tier (high, moderate, low) from what the creature is like.
- pf2e:      the same, at Pathfinder 2e's spacing. GM Core's level-1 saves of +10 / +7 / +4 (DCs 20 / 17 / 14) against
             its high armor class of 16 put the low save 2 below AC, the moderate 1 above and the high 4 above
             (notes/d20_systems.md).

For each hero level, against non-friendly creatures of fitting challenge, it prints the mean chance to land against
each defense and against the creature's weak spot (its easiest defense other than armor), and how often that beats
the weapon (and by 15 points or more).
"""
import json, sys

creatures = []
for line in open(sys.argv[1]):
    line = line.strip()
    if line.startswith('{"id"'):
        creatures.append(json.loads(line.rstrip(",")))

def cr(c): return {"0": 0, "1/8": .125, "1/4": .25, "1/2": .5}.get(c["cr"], None) or float(c["cr"])
def prof(c): return 2 if cr(c) < 1 else 2 + int((cr(c) - 1) // 4)  # SRD 5.2.1: +2 up to CR 4, +3 at 5-8, ...
mod = lambda s: (s - 10) // 2
land = lambda bonus, defense: min(.95, max(.05, (21 + bonus - defense) / 20))

# Average heroes: weapon and move both at proficiency + their best modifier, as in defenses.py.
TIERS = [("level 1", 5, (.125, 1)), ("level 5", 7, (1, 5)), ("level 10", 9, (5, 10)), ("level 15", 10, (10, 15))]
RULES = ([("fixed", c) for c in (12, 13, 14)] + [("scaled", k) for k in (9, 10, 11)]
         + [("anchored", d) for d in (0, 1, 2)] + [("tiered", o) for o in (1, 2, 3)] + [("pf2e", 0)])

print("| Defenses | Hero | Foes | Mean chance to land: AC / Fort / Ref / Will | Weak spot | A move beats the weapon | By 15+ points |")
print("| --- | --- | --- | --- | --- | --- | --- |")
for kind, n in RULES:
    for tier, bonus, (lo, hi) in TIERS:
        pool = [c for c in creatures if not c.get("friendly") and lo <= cr(c) <= hi]
        sums = [0.0] * 4; best = 0.0; beats = big = 0
        for c in pool:
            a = c["abilities"]
            pairs = [max(mod(a[x]), mod(a[y])) for x, y in (("str", "con"), ("dex", "int"), ("wis", "cha"))]
            if kind == "anchored":
                mid = round(sum(pairs) / 3)
                defenses = [c["ac"] + n + p - mid for p in pairs]
            elif kind in ("tiered", "pf2e"):
                ranked = sorted(pairs)
                steps = (-2, 1, 4) if kind == "pf2e" else (-n, 0, n)
                # Weakest pair, middle, strongest, from the creature's armor class; ties share their tiers' average.
                offset = lambda p: sum(steps[i] for i, q in enumerate(ranked) if q == p) / ranked.count(p)
                defenses = [c["ac"] + offset(p) for p in pairs]
            else:
                defenses = [n + (prof(c) if kind == "scaled" else 0) + p for p in pairs]
            d = [land(bonus, c["ac"])] + [land(bonus, x) for x in defenses]
            for i, v in enumerate(d): sums[i] += v
            best += max(d[1:])
            gap = max(d[1:]) - d[0]
            beats += gap > 0; big += gap >= .15
        m = len(pool)
        means = " / ".join(f"{s / m:.0%}" for s in sums)
        label = {"fixed": f"{n} + mod", "scaled": f"{n} + prof + mod", "anchored": f"AC {n:+d} + (mod - mean mod)",
                 "tiered": f"AC -{n} / AC / AC +{n} by rank", "pf2e": "AC -2 / AC +1 / AC +4 by rank"}[kind]
        print(f"| {label} | {tier} | {m} | {means} | {best / m:.0%} | {beats / m:.0%} | {big / m:.0%} |")
