# Engine run: grazes and Courage

The report's three fights played through the TypeScript combat engine (`pnpm fight-rules 20000`), with the rules the
owner chose on 2026-10-17: a miss by 1–2 grazes for the ability modifier (never on a natural 1), and Courage is one
held reroll, attacks only, spent automatically on the hero's next miss.

Heroes are fighters with a longsword who attack every turn: weak, average and strong hitters are +3/+5/+7 to hit at
levels 1–2 and +4/+7/+8 at level 5. Unlike `sim/fights.py`, everything else is the engine's own: initiative, the
owlbear's two Rends, the wolves' knockdowns, morale, Rally and the eight-round limit. These fights are not run through
the balancer; in play it answers the extra damage with slightly tougher foes.

Each row is 20000 fights. "Empty" is a hero attack that did no damage.

| Fight | Heroes | Rules | Heroes win | Rounds | Empty attacks | Three empty in a row | Grazes | Courage rerolls | Damage per attack |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 level-1 hero vs 1 wolf | weak | SRD | 75% | 3.1 | 40% | 8% | 0% | 0% | 3.5 |
| 1 level-1 hero vs 1 wolf | weak | partial hits | 80% | 2.8 | 25% | 1% | 8% | 12% | 4.0 |
| 1 level-1 hero vs 1 wolf | average | SRD | 88% | 2.3 | 30% | 3% | 0% | 0% | 5.5 |
| 1 level-1 hero vs 1 wolf | average | partial hits | 91% | 2.1 | 17% | 0% | 8% | 6% | 6.1 |
| 1 level-1 hero vs 1 wolf | strong | SRD | 94% | 1.8 | 20% | 1% | 0% | 0% | 7.9 |
| 1 level-1 hero vs 1 wolf | strong | partial hits | 96% | 1.6 | 9% | 0% | 9% | 2% | 8.5 |
| 2 level-2 heroes vs 1 shadow wolf | weak | SRD | 100% | 3.6 | 45% | 13% | 0% | 0% | 3.2 |
| 2 level-2 heroes vs 1 shadow wolf | weak | partial hits | 100% | 3.1 | 29% | 1% | 8% | 14% | 3.8 |
| 2 level-2 heroes vs 1 shadow wolf | average | SRD | 100% | 2.4 | 35% | 4% | 0% | 0% | 5.1 |
| 2 level-2 heroes vs 1 shadow wolf | average | partial hits | 100% | 2.2 | 22% | 0% | 9% | 7% | 5.7 |
| 2 level-2 heroes vs 1 shadow wolf | strong | SRD | 100% | 1.8 | 25% | 1% | 0% | 0% | 7.3 |
| 2 level-2 heroes vs 1 shadow wolf | strong | partial hits | 100% | 1.7 | 14% | 0% | 9% | 3% | 8.0 |
| 4 level-5 heroes vs 1 owlbear | weak | SRD | 100% | 4.2 | 40% | 10% | 0% | 0% | 3.5 |
| 4 level-5 heroes vs 1 owlbear | weak | partial hits | 100% | 3.7 | 25% | 1% | 8% | 12% | 4.0 |
| 4 level-5 heroes vs 1 owlbear | average | SRD | 100% | 2.4 | 25% | 1% | 0% | 0% | 6.6 |
| 4 level-5 heroes vs 1 owlbear | average | partial hits | 100% | 2.2 | 14% | 0% | 9% | 3% | 7.1 |
| 4 level-5 heroes vs 1 owlbear | strong | SRD | 100% | 2.1 | 20% | 0% | 0% | 0% | 7.8 |
| 4 level-5 heroes vs 1 owlbear | strong | partial hits | 100% | 1.9 | 10% | 0% | 10% | 1% | 8.4 |

What it shows, against the report's predictions:

- **Empty attacks fall by 10 to 16 points for every hitter.** The weak hero gains most in absolute terms: 40–45% →
  25–29%, against 20–25% → 9–14% for the strong one. The report's six-turn streams predicted 45% → 27% and 25% → 12%.
- **Three empty attacks in a row nearly vanish.** For weak hitters, 8–13% of hero-fights had one under the SRD; with
  partial hits it's 1%.
- **Grazes come up on 8–10% of attacks, for every hitter.** That's what a fixed band does: the same two faces of
  the d20 for everyone. Courage rerolls follow need: 12–14% of a weak hero's attacks, 1–3% of a strong one's.
- **Fights get a little shorter and a little easier.** Damage per attack rises 0.5–0.7, rounds drop by 0.1–0.5, and
  the lone level-1 hero beats a wolf 2–5 points more often. The balancer's test fights now play by the table's rules,
  so in play it picks slightly tougher foes when partial hits are on.
