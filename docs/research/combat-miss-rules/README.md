# Research brief: combat miss rules (handoff for agents with open network access)

This folder is the groundwork for the combat redesign of Discord Quests: how a miss should work, and whether foes
should have a mix of defenses. The first round of research ran in an environment whose network policy blocked
almost every source site, so most findings rest on search-result excerpts, not opened pages. **Your job is to finish
the groundwork from primary sources**, then write the report and fill the design doc.

- Design doc (Claude Doc, shared with the project owner):
  https://claude.ai/code/artifact/c9af71c0-8209-4267-bfc3-80f2ab9a640d
- Notes so far: [`notes/`](notes/) (one file per research area)
- Simulations: [`sim/`](sim/) (Python 3, standard library only)

## The problem, in one paragraph

Combat uses SRD 5.2.1 resolution: d20 + bonus against armor class, so a miss does nothing. Under those rules an
average hero's turn does nothing about one time in three, and a weak hero's almost half the time (see
`sim/attacks.py`). Streaks are what players remember, and on Discord an empty turn can cost a day of real time in
play by post. The players are aged 8 and up and range from new to experienced.

## Directions already chosen by the project owner

1. **Partial hits and momentum**, behind a per-campaign flag (`settings.partialHits`, default off). The flag
   exists; what it should do is written as placeholder comments where attacks miss in
   `packages/core/src/combat/index.ts`. Nothing is built until the rule is designed and tuned.
2. **A mix of defenses** for creatures and heroes, where the move a hero picks (keyed to their stats) decides which
   defense it targets. A simple presentation (one "defense" number) and an advanced one are to be worked out later.

What stays: SRD 5.2.1 resolution, crits (a natural 20 doubles damage dice, a natural 1 misses), the 250-creature SRD
bestiary (`packages/core/src/srd/bestiary.generated.ts`), the XP-budget encounter balancer that test-fights every
encounter (`packages/core/src/combat/balance.ts`), real random dice, and the rewind tool.

## Status by research area

| Area | Notes file | Status | What's left |
| --- | --- | --- | --- |
| d20 systems: 5e 2024 / SRD 5.2.1, 4e, Pathfinder 2e, 13th Age | `notes/d20_systems.md` (if present) | See the file's own header; the first pass may not have finished | Everything listed under A below that the file doesn't mark as opened |
| Narrative and other systems | `notes/narrative_systems.md` | Blades in the Dark, Dungeon World, Ironsworn and Fate verified from open-licensed text (mirrors on GitHub, the Datasworn npm package); WFRP 4e partly, from Foundry VTT strings | Genesys, Savage Worlds, Mythras/RuneQuest, WFRP Advantage rules, Ironsworn rulebook momentum pages, Blades effect table |
| Video games | `notes/video_game_fairness.md` | XCOM 2 aim assist verified from game script source on GitHub; everything else from search excerpts | XCOM per-difficulty values, Fire Emblem, Sid Meier's talk, Dota PRD, pity timers, psychology papers |
| Design theory | `notes/design_theory.md` | Search excerpts only; nothing opened | All of D below |

Every finding in the notes is labelled by how it was seen: `[opened]` (page read in full), `[search extract]` (only
the search engine's excerpt), `[computed]` (arithmetic from a cited formula), or `UNVERIFIED (memory)`. Upgrade a
label only by opening the page.

## Hosts the next environment needs

Allow these under the environment's network access (or use an environment with open access):

`dndbeyond.com`, `media.dndbeyond.com`, `2e.aonprd.com`, `13thagesrd.com`, `pelgranepress.com`,
`bladesinthedark.com`, `ironswornrpg.com`, `fate-srd.com`, `peginc.com`, `edge-studio.net`,
`fantasyflightgames.com`, `thedesignmechanism.com`, `cubicle7games.com`, `serenesforest.net`, `liquipedia.net`,
`gdcvault.com`, `gamedeveloper.com`, `hearthstone.blizzard.com`, `news.blizzard.com`, `tetris.wiki`,
`indie-rpgs.com`, `thealexandrian.net`, `theangrygm.com`, `slyflourish.com`, `sirlin.net`, `mitpress.mit.edu`,
`wikipedia.org`, `scholar.google.com`, `arxiv.org`, `doi.org`, `github.com`, `raw.githubusercontent.com`.

## Tasks

Open each source, record exact rules text and numbers (short quotes only for copyrighted material), and note the
license. Keep each notes file's format: per question, **Takeaway / Cited Findings / Inferences / Gaps**.

### A. d20 systems

- **SRD 5.2.1** (CC-BY-4.0; the project's own license basis): weapon masteries (Graze, Vex, Sap, Topple, Push, Slow,
  Nick, Cleave), which weapons have each, exact effect on hit and on miss; the Fighter's Studied Attacks (level and
  exact text); Unarmed Strike's Grapple and Shove (save type, DC formula); how D20 Tests treat a natural 20 or 1 for
  attacks, ability checks and saving throws; critical hits.
- **2014 DMG optional rules** (not SRD): the "players roll all the dice" variant and its exact conversion from saving
  throws to attack rolls. The project's working assumption is that a fixed defense of **14 + save bonus** gives the
  same odds as the save; confirm or correct against the published formula.
- **D&D 4e** (not open): how AC, Fortitude, Reflex and Will are computed (10 + half level + ability modifier, which
  abilities), which attacks target which, the typical gap between AC and the other defenses, "miss: half damage"
  powers, minions, and designer rationale. Also find the criticism that 4e's defenses converged so the choice felt
  redundant.
- **Pathfinder 2e** (Archives of Nethys is the official rules site): degrees of success (the ±10 rule, natural 20/1
  shifting a degree), the Multiple Attack Penalty, Strike outcomes, saves as defenses, effects that do something on a
  failure, and Athletics maneuvers (Trip, Shove, Grapple, Disarm) against Reflex or Fortitude DC.
- **13th Age** (13thagesrd.com): miss damage (how much, which classes), the escalation die (rules and rationale,
  including Heinsoo's point that giving it to monsters flattens the dramatic curve), and "Fail Forward!" (core book
  p. 48).

### B. Narrative and other systems

Already verified; keep it. Still to open:

- **Genesys / FFG narrative dice**: the official table for spending advantage and threat in combat, triumph and
  despair, and what "failure with advantage" lets a player do.
- **Savage Worlds (SWADE)**: raises, Shaken versus wounds, damage against Toughness, Soak rolls (the free Test Drive
  rules are enough).
- **Mythras / RuneQuest**: armor points by location, parry and damage reduction (Mythras Imperative is free).
- **WFRP 4e**: how Advantage is gained and lost, and its cap.
- **Ironsworn**: the rulebook's momentum pages (wording, not just the constants from the npm data).
- **Blades in the Dark**: the effect-to-clock tick table.

### C. Video games

- **XCOM 2**: the vanilla `DefaultGameCore.ini` aim-assist values per difficulty. The notes have a conflict: code
  comments say +20 per prior miss, forum quotes of the ini say 10 / 10 / 15 / 0. Resolve it from the shipped ini.
  **XCOM: Enemy Unknown**: the Ananda Gupta interview about the "bad streak breaker".
- **Fire Emblem**: Serenes Forest's true-hit pages (2RN formula, which games use it, the later hybrid system).
- **Sid Meier's GDC 2010 keynote**: a transcript or a reliable writeup, including how Civilization Revolution
  adjusted displayed odds.
- **Dota 2 pseudo-random distribution**: Liquipedia's constants table. **Hearthstone**: Blizzard's March 2023 post
  on pack pity timers. **WoW Legion** legendary bad-luck protection. **Tetris** 7-bag.
- **Psychology**: Gilovich, Vallone and Tversky (1985) and the later reanalysis; Batista et al. (2022) on fairness
  judgments in chance games; Hunicke's Hamlet system. Look again for studies that measure frustration from failure
  streaks in games.

### D. Design theory

- Geoff Engelstein on input versus output randomness: the GDC 2018 talk "White, Brown, and Pink", GameTek, and
  *Building Blocks of Tabletop Game Design* (Engelstein and Shalev).
- Ron Edwards on "fortune in the middle" versus "fortune at the end" (The Forge; his Hero Wars review is the claimed
  origin).
- Greg Costikyan, *Uncertainty in Games* (MIT Press, 2013): his sources of uncertainty, and what he says about
  randomness and agency.
- "Fail forward": earliest use, definitions, and criticisms.
- Meaningful choice: Sid Meier's "series of interesting decisions" (GDC 2012), Sirlin on balance and dominant moves,
  Ian Schreiber's game balance course (transitive and intransitive balance).
- The "whiff factor": who coined it, and essays on it (The Alexandrian, The Angry GM, Sly Flourish). WotC's stated
  rationale for Graze and weapon masteries (Unearthed Arcana playtest notes, D&D Beyond articles). The Unearthed
  Arcana bell-curve (3d6) variant.
- Onboarding: progressive disclosure, and any research or designer guidance on combat rules for children aged 8 to 12.

## What the simulations already show

Run them to check or extend; edit the hero and foe tables at the top of each script.

- `python3 sim/attacks.py out.json`: single attacks under each miss rule for weak, average and strong heroes at
  levels 1 and 5. For an average level-1 hero against armor class 13, empty turns go from **35%** (SRD) to **22%**
  with partial hits plus momentum-as-advantage. Three-in-a-row empty streaks within six turns go from **12%** to
  **1%**. Flat miss damage gets empty turns to **5%** but guarantees every miss pays.
- `python3 sim/fights.py out.json`: whole fights (simplified: no knock-prone or pack tactics). Partial hits plus
  advantage shorten fights by 0.2 to 0.3 rounds and lift a lone level-1 hero's win rate against a wolf from 86% to
  90%. The balancer would send slightly tougher foes to hold its targets.
- `python3 sim/defenses.py <5e-SRD-Monsters.json> <hostile.json> out.json`: for every hostile bestiary creature,
  compares a weapon against armor class with a stat-based move against paired saves (Fortitude = Str/Con, Reflex =
  Dex/Int, Will = Wis/Cha, move DC = 8 + proficiency + modifier). Armor class is the weakest defense for 84% of
  level-1 foes and 64% of level-5 foes. Armored foes are the exception: a hobgoblin is 40% to hit with a weapon but
  60% against its Will. The SRD data comes from
  `https://raw.githubusercontent.com/5e-bits/5e-database/main/src/2024/en/5e-SRD-Monsters.json`.
  `hostile.json` is the list of non-friendly ids in the generated bestiary.

## Open design questions the research should inform

1. **The near-miss edge**: is "missed by no more than (matching stat modifier + half proficiency)" sound, or does
   prior art suggest a fixed band (Pathfinder's ±10, Savage Worlds' steps of 4) or a resource spend (Ironsworn
   momentum, Fate invokes)? Partial hits alone favor strong heroes; momentum favors whoever misses most.
2. **Momentum's form**: +2 on the next attack, or advantage? Advantage is native to the SRD (Studied Attacks) and
   breaks streaks better in simulation. How long does it last, and does it carry to another foe?
3. **Heroes only, or foes too?** XCOM's aim assist and Sid Meier's tilted odds both favor the player only.
4. **The defense mix**: which saves pair into which defense, and the constant (14 + save matches the SRD's odds;
   12 + save lets moves land about as often as weapons). Which hero moves target which defense, and what each
   achieves (prone, frightened, restrained, a setup for allies) rather than damage.
5. **Presentation for ages 8+ and all experience levels**: one number versus several, and showing effects rather
   than percentages.

## Deliverables

1. Update each file in `notes/` in place: upgrade or remove `[search extract]` findings, add new opened sources with
   URL and access date, resolve the listed conflicts, keep the format. Add `notes/d20_systems.md` if it's missing.
2. Write `report.md` in this folder: the answer to "how should misses and defenses work in a 5e-based game for ages
   8+ on Discord?", grounded only in opened sources and the simulations, with a sources list.
3. Fill the design doc's pending sections (Summary, Prior art, Proposal 1, Proposal 2, Open questions) from the
   report. The sections already written (What stays from the SRD, The problem, Simulation results) stay unless the
   research contradicts them. Write as in the doc: lead sentence first, numbers rather than adjectives, sources at the
   end.
4. Don't change game code. The rule gets built only after the project owner picks a design from the doc.
