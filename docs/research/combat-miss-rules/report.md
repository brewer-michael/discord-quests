# How misses and defenses should work in Discord Quests

Report on the combat miss-rules research (second pass, 2026-10-16). It answers the brief's question, "how should misses
and defenses work in a 5e-based game for ages 8+ on Discord?", from opened sources and the simulations in `sim/`. The
evidence is in `notes/`. Every claim here traces to a finding labelled `[opened]` (or rules data read in full) or
`[computed]` there; where a point rests on less, it says so.

## The answer

Keep SRD 5.2.1 resolution and add three heroes-only rules behind `settings.partialHits`, plus a defense mix:

1. **A fixed near-miss band.** A miss by 1–2 that isn't a natural 1 is a graze for damage equal to the attack's
   ability modifier (minimum 1). That is the SRD's own Graze payoff with Long War of the Chosen's ±2-on-a-d20 band.
   The band doesn't grow with stats, so it doesn't favor strong heroes.
2. **Momentum as a held token.** A turn that does nothing gives the hero one Courage token, held at most one at a
   time. The bot spends it on the hero's next miss to reroll (the SRD's Heroic Inspiration). It never applies to foes.
   With the band, it takes an average level-1 hero's empty turns from 35% to 20% and a weak hero's from 45% to 27%.
3. **A mix of defenses.** Foes get Fortitude, Reflex and Will at 12 + the higher of two paired SRD saves. Three named
   moves target them and inflict a condition rather than damage. The bot shows each move's chance.

Before any of it, fix two engine gaps the research turned up (see "Engine findings").

## The problem, restated with sources

- Under SRD odds an average level-1 hero (+5 against armor class 13) does nothing on 35% of turns, and a weak hero
  on 45% (`sim/attacks.py`). Over 20 attacks at 65% to hit, the chance of at least one run of three misses is 43.5%
  [computed, `notes/video_game_fairness.md` §5].
- Fights are short: the engine's fights average about 2 to 4.5 rounds, so in play by post an empty turn costs about a
  third of a fight and often a day [computed, `notes/combat_mechanics.md` Q3]. A GM's remembered play-by-post fight
  "took three weeks" and was "one of the biggest reasons why the game ended" (Gnome Stew).
- Streaks drive players away. In EA's match data, churn after repeated losses was 5.1% against 2.6–2.7% for other
  recent records. That is match-level data, the only behavioral measurement found.
- Near misses that pay nothing are less pleasant but more compelling, the gambling pattern (Clark 2009). In a game
  for children a near miss should actually do something.

## What the prior art says

1. **No published system keys a near-miss band to the attacker's stats.**
   - Pathfinder 2e's ±10 degrees cover almost every first-attack miss.
   - 13th Age's miss damage applies to every miss but a natural 1.
   - Savage Worlds' Shaken band is a fixed 4 points; Fate's tie is 1 point.
   - Long War of the Chosen grazes within ±10 on d100 (±2 on a d20).

   The brief's "missed by stat modifier + half proficiency" is new, and the simulation confirms it favors strong
   heroes (strong: empty turns 25% → 10%; weak: 45% → 40%).
2. **Help after a miss goes to the player.**
   - XCOM 2 adds +10 / +10 / +15 / 0 per prior miss by difficulty, hidden and player-only.
   - Civilization Revolution remembers lost battles.
   - 13th Age gives the escalation die to heroes only. Heinsoo says giving it to monsters "would eliminate our game's
     dramatic curve".
   - No SRD monster deals damage on a miss, though the stat-block format reserves a "Miss:" line.

   Visible rules-level mechanisms are either symmetric (Dota's pseudo-random distribution, Fire Emblem's two-number
   hit) or earned (Battle Brothers' Fast Adaptation perk).
3. **Momentum in the sources is either "advantage next attack" or a held token.**
   - The SRD's form: Studied Attacks, Vex and Help give advantage on the next attack against that foe until the end of
     your next turn. WotC's only stated intent: Studied Attacks "increases the likelihood you'll hit after you miss".
   - The held form: Ironsworn momentum (burned after the roll, "never required", banned on the fight-ending roll),
     Fate points, Savage Worlds Bennies and Kids on Bikes' Adversity Tokens (earned on a failed roll, spent to "bump up
     later rolls").
   - WotC playtested "a natural 1 gives Heroic Inspiration" in 2022 and cut it, reason unpublished.
   - 13th Age 2E replaced the rogue's fragile Momentum (lost when hit) with Bravado, which "does not go away when
     you're hit".
4. **A defense mix works only with real gaps.**
   - 4e built a 2-point gap between armor class and the other defenses, then gave attacks against those defenses 2
     less. Critics called the choice "a complete wash".
   - Pathfinder 2e gives creatures one high, one moderate and one low save (+10 / +7 / +4 at level 1).
   - 13th Age sets armor class at level + 16, the better other defense at level + 14 and the lesser at level + 10.
5. **Flat miss damage is the hardest sell.**
   - It has been "popular with designers since 4e … and unpopular with users" (Tribality on the Graze playtest).
   - It is "difficult to visualize and explain" (Donoghue).
   - Robin Laws warns that consolation damage can be "a new coat of paint on a skewed ratio".
   - Juul found the happiest players were those who "failed some, and then completed".

   Real misses should stay.
6. **For ages 8+, show outcomes, not odds.**
   - In Batista et al. (2022), no child or adult fully succeeded at comparing two dice with different numbers of faces.
   - Formal probability reasoning arrives around age 12 (Piaget and Inhelder).
   - At 6–8, "math beyond basic addition and subtraction can be difficult" (Rempton Games).
   - Nielsen warns that more than two levels of progressive disclosure "typically have low usability".
   - Kids' games turn failure into a token (Kids on Bikes, No Thank You, Evil!).
   - Narrate a miss as the foe's defense working: "a miss is not a specific whiffed attempt" (Edwards); dodges or armor
     (The Angry GM).

## Proposal 1: the defense mix

- Fortitude = 12 + the higher of the foe's Strength and Constitution saves. Reflex = 12 + Dexterity or Intelligence.
  Will = 12 + Wisdom or Charisma. These are 4e's pairs, read straight from the SRD stat blocks.
- A move rolls d20 + its stat + proficiency against the matching defense. It is the same roll as an attack with that
  stat, so the bot needs no new kind of roll.
- **Why 12.** 14 + save reproduces the SRD's odds exactly (`notes/d20_systems.md` Q2). At 14, armor class stays the
  easiest target for 84% of level-1 foes, which repeats 4e's "complete wash" from the other side.

  | Move rolls against | Level 1: mean chance to land (AC / Fort / Ref / Will) | Non-armor move beats the weapon (L1 / L5) | By 15+ points (L1 / L5) |
  | --- | --- | --- | --- |
  | 14 + save | 67% / 53% / 52% / 59% | 16% / 36% | 4% / 6% |
  | 13 + save | 67% / 58% / 57% / 64% | 26% / 49% | 7% / 17% |
  | 12 + save | 67% / 63% / 62% / 69% | 40% / 66% | 13% / 31% |

  `sim/defenses.py`, average heroes, 82 hostile foes of challenge 1/8–1 and 95 of challenge 1–5. At 12, the best
  target at level 5 splits armor class 34%, Reflex 31%, Will 26% and Fortitude 9%. That spread is what makes the
  choice situational, Meier's test. Fortitude is rarely the weak spot, because monsters' Strength and Constitution
  run high.
- **Moves inflict conditions, not damage.** These follow Pathfinder 2e's Trip, Shove and Demoralize pattern. Each
  lasts until the end of the foe's next turn, the SRD's Vex and Help timing:
  - Shove: Strength against Fortitude, knocks the foe Prone.
  - Trick: Dexterity or Intelligence against Reflex, gives the next ally's attack advantage.
  - Spook: Wisdom or Charisma against Will, leaves the foe Frightened, and a normal foe checks morale.
- **Presentation.**
  - Two layers. The simple layer shows each move as "hits on 9+", worked out by the bot, plus a one-line hint about
    the foe's weak spot. The advanced layer shows all four defenses.
  - Meier would rather risk "too much information". Play-by-post GMs advise "be transparent with ACs".
- **The balancer must test-fight with moves.** It currently uses plain attacks only.

## Proposal 2: partial hits and momentum

- **The band: a miss by 1–2 is a graze.** A miss that isn't a natural 1 and falls short by 1 or 2 deals damage equal
  to the attack's ability modifier, minimum 1, which is Graze's SRD payoff. The band is the same for everyone: a
  stat-keyed band widens the gap between weak and strong heroes. The natural-1 exception is 13th Age's ("not even miss
  damage") and matches the kept SRD rule.
- **Momentum: Courage, a held reroll.** A turn that does nothing (a plain miss or a natural 1) gives the hero
  Courage, held at most one at a time. On the hero's next miss the bot spends it and rerolls, keeping the new roll,
  which is the SRD's Heroic Inspiration. It waits for a miss rather than being used up on the next attack whether or
  not that attack needed it. That is why it beats advantage-next-attack in the table below.
- **Spend it automatically.** A choice after the roll costs a round trip in play by post. The bot spends Courage on
  the next miss and shows it ("Courage! Rerolled: 14, a hit"). Ironsworn's "never required" choice, where the player
  saves it for later, belongs in the advanced layer.
- **Heroes only.** Foes' misses stay empty, as in the SRD bestiary, XCOM, Civilization Revolution and 13th Age's
  escalation die. Courage is visible (a pip on the hero's line), which suits a rule players are meant to see working:
  "a miss is not a specific whiffed attempt", and the youngest players expect a hit to be "due" (Fischbein and
  Schnarch).

`sim/attacks.py`, one attack a turn for six turns against one foe, 60,000 runs per row. Level 1 against armor class 13:

| Rule | Empty turns: weak / average / strong | Three empty in a row: weak / average / strong | Average hero damage per turn |
| --- | --- | --- | --- |
| SRD today | 45% / 35% / 25% | 24% / 13% / 5% | 5.1 |
| Stat-keyed band (the brief's draft) | 40% / 25% / 10% | 18% / 5% / 0% | 5.4 |
| Fixed band, miss by 1–2 | 35% / 25% / 15% | 13% / 5% / 1% | 5.4 |
| Fixed band, miss by 1–4 | 25% / 15% / 5% | 5% / 1% / 0% | 5.7 |
| Advantage on the next attack after an empty turn | 38% / 30% / 22% | 6% / 2% / 1% | 5.5 |
| Stat-keyed band + advantage (the brief's draft) | 34% / 22% / 10% | 4% / 1% / 0% | 5.7 |
| Fixed band 1–2 + advantage | 30% / 22% / 14% | 2% / 1% / 0% | 5.7 |
| **Fixed band 1–2 + Courage (recommended)** | **27% / 20% / 12%** | **2% / 1% / 0%** | **5.9** |
| Flat miss damage (level) | 5% / 5% / 5% | 0% / 0% / 0% | 5.4 |

- The recommended pair helps the weak hero most: 45% → 27%, against 25% → 12% for the strong one. The stat-keyed band
  alone cuts a strong hero's empty turns by 15 points and a weak hero's by 5.
- At level 5 against armor class 15 the pattern holds: empty turns 50% / 35% / 25% → 31% / 20% / 12%.
- A band of 1–4 brings a strong hero to 5% empty turns, the same as flat miss damage, where every miss pays.

Whole fights (`sim/fights.py`, 40,000 fights a row, heroes only):

| Fight (average heroes) | Heroes win: SRD → band + Courage | Rounds | Hero turns that do nothing: SRD / brief's draft / band + Courage |
| --- | --- | --- | --- |
| 1 level-1 hero vs 1 wolf | 86% → 91% | 2.5 → 2.3 | 22% / 14% / 13% |
| 2 level-2 heroes vs 1 shadow wolf | 100% → 100% | 2.8 → 2.5 | 28% / 19% / 18% |
| 4 level-5 heroes vs 1 owlbear | 100% → 100% | 2.8 → 2.6 | 22% / 13% / 12% |

Average heroes only, so these rows can't show the weak-versus-strong difference that the attack table shows. Rerunning
with more variants shifts the random stream, so the SRD rows move by up to a point against the design doc's earlier
run.

- **Guardrails.** No graze on a natural 1. No grazes against minions, if minions come in (4e). Courage applies to the
  hero's own rolls only.
- **Knobs to tune.**
  - Band width: 1 to 3.
  - Graze damage: the modifier, or half the weapon's damage.
  - Courage cap: 1.
  - Whether Courage also covers saves and checks. The SRD's Heroic Inspiration rerolls any die, but only attacks were
    simulated.
- **The balancer absorbs the extra damage.** An average level-1 hero's damage per turn rises 16% (5.1 → 5.9). The
  balancer will answer with slightly tougher foes, so the win rate holds and only the texture of the turns changes.

## Engine findings outside the miss rules

Both were found by the research and checked in the code. Neither is changed here.

1. **Conditions that foes put on heroes never end.** `packages/core/src/combat/index.ts:929-934` adds a condition when
   a hero fails the save against a foe attack's effect. Only Prone is ever cleared (`:571`), and a stunned hero skips
   every turn (`:572`). Six bestiary attacks can stun, so one failed save can take a hero out of the fight. In play by
   post that can mean days of empty turns. Foe conditions count down (`:1047`). The fix the sources suggest is the
   same clock for both sides, or "save ends" (MCDM's Flee, Mortals!).
2. **Crumble and fade foes surrender instead.** The schema allows six defeat styles
   (`packages/core/src/world/schema.ts:307`). `foeLeaves` (`index.ts:502-511`) handles "flees" and "poofs", and
   everything else becomes "yielded" and at the heroes' mercy. 41 bestiary creatures use "crumbles" or "fades".

Other combat findings worth carrying into later design (`notes/combat_mechanics.md`):

- **Keep the turn structure.** It already suits play by post: everyone picks at once, and a deadline defaults to
  Defend. That is one wait per round, against about six for classic initiative.
- **Minions turn any hit into progress.** MCDM's minions drop to any damage, roll overkill into the next one, attack
  as a group and cost a fifth of the XP. That fits the balancer. If adopted, minions should not also get grazes
  (4e: minions never take miss damage).
- **A lone boss is decided by one save.** Sleep or Hold Person puts a boss at the heroes' mercy. Villain actions
  (three, at most one per round) suit one bot post per round better than legendary actions.
- **Foes target a random standing hero (`index.ts:1019`).** Players can't plan around that, which weakens Defend and
  setup moves. A shown targeting rule would make them real choices.

## Open questions for the project owner

1. **Band width.** Recommended 1–2. 3 is a middle ground. 4 is close to flat miss damage for strong heroes.
2. **Courage.** Automatic on the next miss (recommended for play by post), or the player's choice? Attacks only, or
   any d20 roll as in the SRD?
3. **Defense constant.** Recommended 12 + save. 13 + save keeps moves rarer (49% of level-5 foes have a better
   non-armor target, against 66%).
4. **Minions.** Should they come in (MCDM-style, a fifth of the XP)? If so, they take no grazes.
5. **Foe targeting.** Should the rule be shown, so Defend and setup moves can be planned?

**Simple and advanced layers.**

- **Simple (the default, ages 8+).**
  - Each move shows "hits on 9+".
  - A graze reads "Close! You grazed it for 3".
  - Courage is a pip that spends itself.
  - The bot does every sum.
- **Advanced (opt-in).**
  - The foe's four defenses are shown.
  - The player decides when to spend Courage.
  - More moves per defense.

**Plan to build, measure and tune.**

1. Fix the two engine gaps above. They are small and independent of the flag.
2. Build the band and Courage behind `settings.partialHits`, and add them to the balancer's test fights.
3. Re-run the shadow-wolf, wolf and owlbear fights through the TypeScript engine, which is faithful where `sim/` is
   simplified, and compare empty turns, streaks and win rates.
4. Build the defense mix and the three moves, with moves in the balancer's test fights.
5. Measure from real play. Dice are saved with every turn, so the rates of empty turns and three-turn streaks can be
   read from logs before and after the flag.

## What is still unverified

- **2014 DMG.** It is paywalled. Hitting Cover and Cleaving rest on forum posts quoting p. 272. "Players Roll All the
  Dice" is confirmed as a D&D 3.5 variant but not proven absent from the 5e DMG.
- **4e.** No primary text. The fan wiki cites book pages.
- **Rationale.** No first-party rationale for Graze, 4e miss lines or the dropped natural-1 Inspiration rule.
- **Publishers that refused requests.**
  - Genesys core rulebook: the spend table comes from a transcription of the Star Wars version.
  - WFRP 4e Advantage gain and loss: Cubicle 7 refused requests.
  - Pelgrane's "Speeding Combat" and the 13th Age 2E fighter's Momentum.
- **Kids' games.** Hero Kids, No Thank You, Evil! and Kids on Bikes rules come from reviews only.
- **Research.** Hunicke's measured Hamlet results are unread (ACM refused requests). No peer-reviewed study of combat
  rules for children aged 8–12 was found.
- **Simulations.** All are simplified: one attack per turn, no spells, Help or Pack Tactics. A faithful run needs the
  TypeScript engine.

## Sources

Primary rules (opened 2026-10-16):

- [SRD 5.2.1](https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf) (CC-BY-4.0)
- [UA Player's Handbook Playtest 5](https://media.dndbeyond.com/compendium-images/one-dnd/ph-playtest5/owThVp1CESZ1c91y/UA-2023-PH-Playtest5.pdf),
  [Playtest 7](https://media.dndbeyond.com/compendium-images/ua/ph-playtest7/tsgOb3llF22AL0nU/UA2023-PH-Playtest7.pdf),
  [Expert Classes](https://media.dndbeyond.com/compendium-images/one-dnd/expert-classes/kpx0MvyfBGHe0XKk/UA2022-Expert-Classes.pdf)
- [d20 SRD: Players Roll All the Dice](https://www.d20srd.org/srd/variant/adventuring/playersRollAllTheDice.htm),
  [Bell Curve Rolls](https://www.d20srd.org/srd/variant/adventuring/bellCurveRolls.htm)
- [Archives of Nethys: degrees of success](https://2e.aonprd.com/Rules.aspx?ID=2286),
  [creature saves](https://2e.aonprd.com/Rules.aspx?ID=2889)
- [13th Age SRD: combat](https://www.13thagesrd.com/combat-rules/),
  [monster creation](https://www.13thagesrd.com/monsters/monster-creation/),
  [running the game](https://www.13thagesrd.com/running-the-game/)
- [Heinsoo, "Escalation for Everyone?"](https://web.archive.org/web/20251012090835/https://pelgranepress.com/2014/08/07/13th-sage-escalation-for-everyone/),
  [13th Age 2E changes](https://web.archive.org/web/20260424033424/https://pelgranepress.com/files/13th_Age/13A_2e/13A_Changes_from_1e.pdf)
- [Ironsworn rulebook](https://shawn-tomkin.itch.io/ironsworn),
  [Blades in the Dark SRD](https://bladesinthedark.com/effect),
  [Fate SRD: conceding](https://fate-srd.com/fate-core/conceding-conflict),
  [Savage Worlds Test Drive](https://peginc.com/store/deadlands-the-weird-west-blood-on-the-range-savage-worlds-test-drive-swade/),
  [Mythras Imperative](https://design-mechanism.itch.io/mythras-imperative)
- [MCDM Flee, Mortals! preview](https://files.mcdmproductions.com/FleeMortals/FleeMortalsPreview.pdf),
  [Draw Steel combat rules (Steel Compendium)](https://github.com/SteelCompendium/data-md/blob/main/Rules/Chapters/Combat.md)

Video games (opened 2026-10-16):

- [XCOM 2 DefaultGameCore.ini](https://raw.githubusercontent.com/daakru/x2wotc-common-configs/master/XComGame/Config/DefaultGameCore.ini),
  [Long War of the Chosen overhaul config](https://raw.githubusercontent.com/long-war-2/lwotc/master/LongWarOfTheChosen/Config/XComLW_Overhaul.ini)
- [Battle Brothers: Fast Adaptation](https://battlebrothers.fandom.com/wiki/Fast_Adaptation),
  [Fire Emblem Wiki: True hit](https://fireemblemwiki.org/wiki/True_hit),
  [Liquipedia: random distribution](https://liquipedia.net/dota2/Random_Distribution)

Design writing and research (opened 2026-10-16):

- [Necropraxis on 4e defenses](https://necropraxis.com/2012/03/05/nalfeshnee-hack-monsters/)
- [Sid Meier at GDC 2012](https://www.gamedeveloper.com/design/gdc-2012-sid-meier-on-how-to-see-games-as-sets-of-interesting-decisions)
- [Engelstein, GDC 2018 slides](https://media.gdcvault.com/gdc2018/presentations/Engelstein_Geoffrey_White_Brown_Pink.pdf)
- [The Forge glossary](http://www.indie-rpgs.com/_articles/glossary.html)
- [Robin Laws, "In Defense of the Whiff Factor"](https://www.goodreads.com/author_blog_posts/2096338-in-defense-of-the-whiff-factor)
- [Tribality on Playtest 5](https://www.tribality.com/2023/04/28/ua-2023-players-handbook-playtest-5-breakdown/)
- [Nielsen, progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/)
- [Juul, "Fear of Failing?"](https://www.jesperjuul.net/text/fearoffailing/)
- [Gnome Stew on play by post](https://gnomestew.com/how-i-lost-my-play-by-post-virginity-part-2/)
- [EN World play-by-post tips](https://www.enworld.org/threads/looking-for-d-d-play-by-post-tips.705128/)

The notes files list every other source, with its label and access date.
