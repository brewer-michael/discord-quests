"""Whole fights under each miss rule (applied to heroes only). Heroes act, then foes, until one side is down."""
import random, json, sys, statistics
sys.path.insert(0, "")
R = random.Random(7)
N = 40000
def d(n, s): return sum(R.randint(1, s) for _ in range(n))
VARIANTS = ["srd", "miss-damage", "partial", "momentum+2", "momentum-adv", "partial+momentum", "partial+momentum-adv",
            "band2", "band2+inspire"]
# band2: a miss by 1-2 grazes. inspire: an empty miss earns a held reroll, spent on the hero's next miss (see attacks.py).

def hero_attack(h, ac, v, boosted):
    adv = boosted and v in ("momentum-adv", "partial+momentum-adv")
    plus = 2 if boosted and v in ("momentum+2", "partial+momentum") else 0
    r1 = R.randint(1, 20); nat = max(r1, R.randint(1, 20)) if adv else r1
    total = nat + h["atk"] + plus
    inspire = v == "band2+inspire"
    if inspire and boosted and nat != 20 and (nat == 1 or total < ac):
        nat = R.randint(1, 20); total = nat + h["atk"]; boosted = False
    keep = inspire and boosted
    if nat == 20: return d(2, h["die"]) + h["mod"], keep
    if nat != 1 and total >= ac: return d(1, h["die"]) + h["mod"], keep
    if nat == 1: return 0, inspire
    if v == "miss-damage": return h["level"], False
    if v in ("partial", "partial+momentum", "partial+momentum-adv") and ac - total <= h["edge"]: return max(1, h["mod"]), False
    if v in ("band2", "band2+inspire") and ac - total <= 2: return max(1, h["mod"]), keep
    if inspire: return 0, True
    return 0, v in ("momentum+2", "momentum-adv", "partial+momentum", "partial+momentum-adv")

def fight(heroes, foes, v):
    hs = [dict(h, hp=h["hpmax"], boosted=False) for h in heroes]
    fs = [dict(f, hp=f["hp_roll"]()) for f in foes]
    rounds = empty = turns = 0
    while any(h["hp"] > 0 for h in hs) and any(f["hp"] > 0 for f in fs) and rounds < 15:
        rounds += 1
        for h in hs:
            target = next((f for f in fs if f["hp"] > 0), None)
            if h["hp"] <= 0 or not target: continue
            dmg, h["boosted"] = hero_attack(h, target["ac"], v, h["boosted"])
            turns += 1; empty += dmg == 0
            target["hp"] -= dmg
        for f in fs:
            alive = [h for h in hs if h["hp"] > 0]
            if f["hp"] <= 0 or not alive: continue
            t = R.choice(alive)
            for _ in range(f["swings"]):
                nat = R.randint(1, 20)
                if nat == 20: t["hp"] -= f["dmg"](True)
                elif nat != 1 and nat + f["atk"] >= t["ac"]: t["hp"] -= f["dmg"](False)
    won = all(f["hp"] <= 0 for f in fs)
    return won, rounds, empty / max(1, turns)

hero = lambda level, atk, mod, edge, hp, ac: dict(level=level, atk=atk, die=8, mod=mod, edge=edge, hpmax=hp, ac=ac)
wolf2024 = dict(ac=12, atk=4, swings=1, hp_roll=lambda: d(2, 8) + 2, dmg=lambda c: d(2 if c else 1, 6) + 2)
shadow = dict(ac=13, atk=4, swings=1, hp_roll=lambda: d(4, 8) + 4, dmg=lambda c: d(4 if c else 2, 4) + 2)
owlbear = dict(ac=13, atk=7, swings=2, hp_roll=lambda: d(7, 10) + 21, dmg=lambda c: d(4 if c else 2, 8) + 5)
SCENES = {
    "1 average L1 hero vs 1 wolf": ([hero(1, 5, 3, 2, 12, 15)], [wolf2024]),
    "2 average L2 heroes vs 1 shadow wolf": ([hero(2, 5, 3, 2, 20, 15)] * 2, [shadow]),
    "4 average L5 heroes vs 1 owlbear": ([hero(5, 7, 4, 2, 44, 16)] * 4, [owlbear]),
}
out = []
for name, (hs, fs) in SCENES.items():
    for v in VARIANTS:
        res = [fight(hs, fs, v) for _ in range(N)]
        win = sum(r[0] for r in res) / N
        rounds = statistics.mean(r[1] for r in res)
        empty = statistics.mean(r[2] for r in res)
        out.append(dict(scene=name, variant=v, win=round(win, 3), rounds=round(rounds, 2), empty=round(empty, 3)))
        print(f"{name:40} {v:17} win {win:.0%}  rounds {rounds:.1f}  empty hero turns {empty:.0%}")
json.dump(out, open(sys.argv[1], "w"), indent=1)
