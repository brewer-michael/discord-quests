"""For every hostile bestiary creature: chance a weapon lands vs AC, and a stat-based move vs each paired save."""
import json, sys, collections
srd = {m["index"]: m for m in json.load(open(sys.argv[1]))}
hostile = json.load(open(sys.argv[2]))
CR = {"0": 0, "1/8": .125, "1/4": .25, "1/2": .5}
def crv(c): return CR.get(c, None) if c in CR else float(c)
mod = lambda s: (s - 10) // 2
def saves(m):
    prof = {p["proficiency"]["index"].replace("saving-throw-", ""): p["value"] for p in m["proficiencies"] if p["proficiency"]["index"].startswith("saving-throw-")}
    base = {"str": m["strength"], "dex": m["dexterity"], "con": m["constitution"], "int": m["intelligence"], "wis": m["wisdom"], "cha": m["charisma"]}
    return {k: prof.get(k, mod(v)) for k, v in base.items()}
# Hero tiers: weapon attack bonus, and the DC of a move keyed to their best other stat (8 + prof + mod).
TIERS = {"L1 average": dict(atk=5, dc=13, crmax=1), "L5 average": dict(atk=7, dc=15, crmax=5)}
hit = lambda atk, ac: min(.95, max(.05, (21 + atk - ac) / 20))
fails = lambda dc, save: min(1, max(0, (dc - 1 - save) / 20))
rows = []
for tier, t in TIERS.items():
    pool = [srd[h["id"]] for h in hostile if crv(h["cr"]) <= t["crmax"] and crv(h["cr"]) >= (0.125 if tier.startswith("L1") else 1)]
    best_counts = collections.Counter(); gaps = []
    for m in pool:
        s = saves(m); ac = m["armor_class"][0]["value"]
        d = {"AC": hit(t["atk"], ac),
             "Fortitude": fails(t["dc"], max(s["str"], s["con"])),
             "Reflex": fails(t["dc"], max(s["dex"], s["int"])),
             "Will": fails(t["dc"], max(s["wis"], s["cha"]))}
        best = max(d, key=d.get); best_counts[best] += 1
        gaps.append(max(v for k, v in d.items() if k != "AC") - d["AC"])
        rows.append(dict(tier=tier, id=m["index"], ac=ac, **{k: round(v, 2) for k, v in d.items()}))
    n = len(pool)
    print(tier, "creatures:", n, "weakest defense:", {k: f"{v/n:.0%}" for k, v in best_counts.most_common()},
          "| a non-AC option beats the weapon for", f"{sum(g > 0 for g in gaps)/n:.0%}", "| by 15+ points:", f"{sum(g >= .15 for g in gaps)/n:.0%}")
for want in ["shadow-wolf", "wolf", "goblin-warrior", "owlbear", "knight", "skeleton", "ogre", "mage", "gelatinous-cube", "young-white-dragon", "brown-bear", "hobgoblin-warrior"]:
    for r in rows:
        if r["id"] == want: print(r)
json.dump(rows, open(sys.argv[3], "w"))
