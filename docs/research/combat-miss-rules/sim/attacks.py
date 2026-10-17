"""Monte Carlo of attack streams under candidate miss rules. One attack per turn, same foe throughout."""
import random, statistics, json, sys

R = random.Random(20261017)
N = 60000

def d(n, s): return sum(R.randint(1, s) for _ in range(n))

# Heroes: (to-hit, damage dice count, die, ability mod, edge stat mod, proficiency, level)
HEROES = {
    ("weak", 1): dict(bonus=3, dice=(1, 8), mod=1, edge_stat=0, prof=2, level=1),
    ("average", 1): dict(bonus=5, dice=(1, 8), mod=3, edge_stat=1, prof=2, level=1),
    ("strong", 1): dict(bonus=7, dice=(1, 8), mod=3, edge_stat=2, prof=2, level=1),
    ("weak", 5): dict(bonus=4, dice=(1, 8), mod=1, edge_stat=0, prof=3, level=5),
    ("average", 5): dict(bonus=7, dice=(1, 8), mod=4, edge_stat=1, prof=3, level=5),
    ("strong", 5): dict(bonus=9, dice=(1, 8), mod=4, edge_stat=2, prof=3, level=5),
}

VARIANTS = ["srd", "miss-damage", "partial", "momentum+2", "momentum-adv", "partial+momentum", "partial+momentum-adv",
            "band2", "band4", "inspire", "band2+inspire", "band2+momentum-adv"]
# band2 / band4: a fixed near-miss band (miss by 1-2, as Long War of the Chosen's +-10 on d100; miss by 1-4, as Savage
# Worlds' raise step) instead of one keyed to the hero's stats.
# inspire: an empty miss earns a held token (at most one, like Heroic Inspiration); the hero spends it to reroll the
# next miss, so it waits for a miss instead of boosting the next attack whether or not it needed help.
BANDS = {"band2": 2, "band4": 4, "band2+inspire": 2, "band2+momentum-adv": 2}
INSPIRE = ("inspire", "band2+inspire")

def attack(h, ac, variant, boosted):
    """Returns (damage, outcome, next_boosted). outcome: hit | glance | miss."""
    adv = boosted and variant in ("momentum-adv", "partial+momentum-adv", "band2+momentum-adv")
    plus = 2 if boosted and variant in ("momentum+2", "partial+momentum") else 0
    r1 = R.randint(1, 20)
    nat = max(r1, R.randint(1, 20)) if adv else r1
    total = nat + h["bonus"] + plus
    n, s = h["dice"]
    if variant in INSPIRE and boosted and nat != 20 and (nat == 1 or total < ac):
        nat = R.randint(1, 20); total = nat + h["bonus"]; boosted = False
    if nat == 20:
        return d(2 * n, s) + h["mod"], "hit", variant in INSPIRE and boosted
    if nat != 1 and total >= ac:
        return d(n, s) + h["mod"], "hit", variant in INSPIRE and boosted
    if nat == 1:
        return 0, "miss", variant in INSPIRE
    missed_by = ac - total
    if variant == "miss-damage":
        return h["level"], "glance", False
    edge = max(0, h["edge_stat"]) + h["prof"] // 2
    if variant in ("partial", "partial+momentum", "partial+momentum-adv") and missed_by <= edge:
        return max(1, h["mod"]), "glance", False
    if variant in BANDS and missed_by <= BANDS[variant]:
        return max(1, h["mod"]), "glance", variant in INSPIRE and boosted
    if variant in INSPIRE:
        return 0, "miss", True
    momentum = variant in ("momentum+2", "momentum-adv", "partial+momentum", "partial+momentum-adv", "band2+momentum-adv")
    return 0, "miss", momentum

def stream(h, ac, variant, turns=6):
    """Six turns against the same foe, no matter what: how often a turn does nothing, and streaks of it."""
    empty = hits = glances = streak3 = 0; dmg_total = 0
    for _ in range(N):
        boosted = False; run_len = 0; had3 = False
        for _t in range(turns):
            dmg, out, boosted = attack(h, ac, variant, boosted)
            hits += out == "hit"; glances += out == "glance"
            if dmg == 0:
                empty += 1; run_len += 1; had3 = had3 or run_len >= 3
            else:
                run_len = 0
            dmg_total += dmg
        streak3 += had3
    a = N * turns
    return dict(hit=hits / a, glance=glances / a, empty=empty / a, streak3=streak3 / N, dpt=dmg_total / a)

def to_kill(h, ac, variant, hp):
    """Turns until the foe's hit points run out."""
    out = []
    for _ in range(N):
        boosted = False; dealt = 0; t = 0
        while dealt < hp and t < 60:
            t += 1
            dmg, _o, boosted = attack(h, ac, variant, boosted)
            dealt += dmg
        out.append(t)
    out.sort()
    return dict(kill_mean=statistics.mean(out), kill_p90=out[int(0.9 * len(out))])

def run(h, ac, variant, turns=6, target_hp=None):
    r = stream(h, ac, variant, turns)
    if target_hp: r.update(to_kill(h, ac, variant, target_hp))
    return r

results = []
for (prof_name, level), h in HEROES.items():
    for ac in ([12, 13, 15, 18] if level == 1 else [13, 15, 17]):
        for v in VARIANTS:
            hp = 22 if level == 1 else 59
            r = run(h, ac, v, target_hp=hp)
            results.append(dict(hero=prof_name, level=level, ac=ac, variant=v, **{k: round(x, 3) for k, x in r.items()}))
json.dump(results, open(sys.argv[1], "w"), indent=1)
for r in results:
    if (r["level"] == 1 and r["ac"] == 13) or (r["level"] == 5 and r["ac"] == 15):
        print(f'{r["hero"]:8} L{r["level"]} AC{r["ac"]} {r["variant"]:17} hit {r["hit"]:.2f} glance {r["glance"]:.2f} empty {r["empty"]:.2f} 3-streak {r["streak3"]:.2f} dpt {r["dpt"]:.1f} kill {r["kill_mean"]:.1f} (p90 {r["kill_p90"]})')
