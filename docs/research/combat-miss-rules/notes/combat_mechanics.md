# Combat mechanics beyond misses: turn structure, action economy, pacing, setups, defeat, foe behavior

Method and source-access note (read first). Written 2026-10-16; every URL below was accessed that day. This round had open network access for most hosts. Labels:
- **[opened]**: I read the page or file itself. For PDFs I downloaded them and extracted the text with `pdftotext`. For GitHub mirrors I read the raw file (the commit is given where it matters).
- **[search extract]**: seen only in a web-search summary; the page was not opened.
- **[computed]**: my own arithmetic or simulation, with the script and assumptions given.
- **UNVERIFIED**: from memory, no source opened.

Hosts that failed: `oldschoolessentials.necroticgnome.com` (HTTP 500 on every SRD page, so I used the `oldmanumby/ose.srd` GitHub mirror instead); `basicfantasy.org` (403); `avrae.readthedocs.io/en/latest/commands.html` (404, so I used the Avrae source on GitHub); several `fate-srd.com` and `steelcompendium.io` paths (404, so I found the right paths or used the `SteelCompendium/data-md` GitHub mirror). Hero Kids and No Thank You, Evil! are commercial and have no free rules text online, so only reviews were reachable.

Licenses: SRD 5.2.1 is CC-BY-4.0. Ironsworn (Datasworn) is CC-BY-4.0. Fate Condensed is CC-BY-3.0. Blades in the Dark's SRD is CC-BY-3.0 (UNVERIFIED this round; the page I opened didn't show the license). Old-School Essentials SRD is OGL 1.0a (per the mirror's licence PDF, not opened). Archives of Nethys hosts PF2e Remaster rules under the ORC license. Flee, Mortals! preview packet is OGL 1.0a with Product Identity carved out. Draw Steel text is under the DRAW STEEL Creator License (the Steel Compendium mirror says so). 13th Age SRD is OGL. Short quotes only for anything not CC/ORC.

---

## Current engine (baseline, read 2026-10-16 on branch `claude/story-settings`)

Files: `packages/core/src/combat/index.ts`, `balance.ts`, `bestiary.ts` and their tests; helpers in `packages/core/src/rules/combat.ts` and `rules/conditions.ts`; round collection in `packages/engine/src/turn-service.ts`; pace and timers in `packages/engine/src/pace.ts` and `apps/bot/src/flows.ts`.

**Turn structure.** Everyone picks one action at once, then the round plays out in initiative order (`index.ts:1-8`, the loop at `index.ts:1034-1043`). A round resolves as soon as every player has chosen (`apps/bot/src/handlers/battle.ts:80`), or when the round timer runs out. Timers are 180 s for game night and 86,400 s (1 day) for play by post (`pace.ts:16-31`). If nobody chose anything, play by post re-arms the timer and game night waits (`pace.ts:112-119`, `flows.ts:105-135`). A hero who didn't choose, or whose choice doesn't parse, gets **Defend** (`turn-service.ts:819`, `:858`; `index.ts:1041`). Free text becomes a "trick", resolved as a skill check before the round (`turn-service.ts:820-857`). Because targets are chosen before the round runs, a target that's already beaten falls through to the first foe still fighting (`index.ts:479-483`).

**Initiative.** Each foe rolls its own d20 + Dex modifier (`index.ts:240`), even identical foes; the SRD has a group of identical creatures share one roll. Each hero rolls d20 + initiative bonus (`index.ts:254`). Heroes win ties (`index.ts:261-266`). The order is fixed for the whole fight; heroes who join mid-fight roll in (`index.ts:464-470`).

**Hero actions** (`CombatActionSchema`, `index.ts:108-132`):
- attack with a weapon
- cast (attack spells, save-for-damage, save-for-condition, auto-damage, heal, buff)
- defend: attacks against you have disadvantage (`index.ts:910`)
- help: the foe is "distracted", so the next attack on it has advantage (`index.ts:647-660`)
- item (a healing potion)
- spare a foe that has given up
- trick (free text)
- none

There's no bonus action, reaction or movement. Scouts add sneak dice when they attack with the upper hand (advantage or a distracted foe) (`index.ts:588`, `:596`). A distracted foe stays distracted until someone attacks it; the SRD's Help expires at the start of the helper's next turn, and the engine doesn't check range.

**Foe actions** (`foeTurn`, `index.ts:1001-1032`). A spent special recharges on a d6 roll. A ready recharge special is always used, and any other ready special one time in three. Otherwise the foe uses its multiattack, or one random attack. The target is a random hero who is still standing (`index.ts:1019`), and the foe re-picks if a multiattack downs its target. Foes never attack a hero who is down (`index.ts:1005-1007`). Pack Tactics is the only trait the engine reads (`index.ts:902-904`). Legendary Resistance appears in the text of 3 bestiary creatures but does nothing. There are no legendary actions; 20 bestiary creatures are tagged `boss`.

**Conditions.** There are 9 SRD conditions with kid-friendly names, plus `dazed` (`rules/conditions.ts:147-182`). Attack-roll effects are in `attackRollMode` (`conditions.ts:205-221`): grappled has no attack effect, and frightened and poisoned always apply (no line-of-sight test). Conditions a hero puts on a foe with a spell last at most 3 rounds (`index.ts:828`) and tick down at the end of the round (`index.ts:1045-1054`). Conditions a foe puts on a hero have no duration and no save to end them inside the fight; only prone clears, at the start of the hero's turn (`index.ts:571`). A **stunned spell result (Sleep, Hold Person) puts the foe at the heroes' mercy at once** (`index.ts:822-825`; `srd/spells.ts:237`, `:337`).

**Damage, 0 HP, defeat.**
- **Heroes:** at 0 HP a hero is Dazed instead of dying (`rules/combat.ts:51-69`). On their turn a Dazed hero rolls a Rally, d20 ≥ 10, and gets back up with 1 HP (1d4+1 on a natural 20); failing costs nothing (`rules/combat.ts:78-96`, `index.ts:547-569`). Healing wakes a Dazed hero (`rules/combat.ts:71-76`).
- **Foes:** at 0 HP a foe leaves the fight in the way its `defeat` style says (`index.ts:495-513`). The first time it's bloodied (at or below half HP), it makes a morale check (`index.ts:529-532`): brave foes never break, skittish foes always break, and normal foes break on d20 < 8, 35% (`rules/combat.ts:119-124`).
- **Bestiary counts** [computed from `bestiary.generated.ts`]. Morale: brave 66, normal 176, skittish 8. Defeat style: flees 172, surrenders 36, crumbles 21, fades 20, poofs 1. `foeLeaves` handles only flees, poofs and faints by name, so the 41 that crumble or fade end up "at mercy" with the exit text "yielded" (`index.ts:502-511`). That looks like a gap, not a choice.

**How fights end.**
- **Victory:** no foe is left fighting. If any foe is at the heroes' mercy, the phase becomes "aftermath" and the heroes are offered spare choices (`index.ts:1070-1074`).
- **Party down:** every hero is Dazed (`index.ts:1074-1076`).
- **Round cap:** after `MAX_COMBAT_ROUNDS = 8`, the remaining foes "slip away" (`index.ts:21`, `:1056-1068`).
- A successful trick against a skittish foe makes it flee (`index.ts:717-720`).

**Balancer** (`balance.ts`).
- **Budget:** the SRD 5.2.1 XP budget per character (`balance.ts:27-49`).
- **House rule:** each foe beyond the party size counts +25%, capped at +100% (`balance.ts:82-88`).
- **Candidates:** every mix of up to 3 wanted creatures, up to 6 of each, at 100%, 75% or 50% HP (`balance.ts:56-58`, `:157-170`). If nothing fits, it uses same-faction or same-kind stand-ins (`balance.ts:176-199`).
- **Test fights:** each candidate, strongest first, is played 150 times with plain attacks or the hero's best damaging cantrip (`balance.ts:201-261`), using a seeded RNG (`balance.ts:219-224`). The candidate must win 97%, 90% or 75% of the time for low, moderate or high difficulty (`balance.ts:53-54`). It tries up to 60 candidates (`balance.ts:144`).
- **Consequence:** the balancer never uses Help, tricks, Defend or control spells, so it tunes against a party that only attacks.

---

## Q1. Turn structure and initiative for asynchronous / play-by-post combat

### Takeaway
The engine's "everyone declares, then the round resolves in order" model is already the most async-friendly structure in the sources. It costs one wait per round, not one per combatant. Each prior system cuts waits a different way:
- **Group by side:** OSE's per-side d6 each round, the 2014 DMG's side initiative, Hero Kids' monsters acting as a group.
- **Let the table choose the order:** Fate's elective order, Draw Steel's alternating sides.
- **Remove foe turns entirely:** Ironsworn, where foes act only when a player's roll misses.

Every PbP community source gives the same fix for a missing player: a deadline, then a default action. The engine already does this; its default is Defend. Avrae, the main Discord bot, automates bookkeeping but not pacing. It has a turn ping, but no timeout or auto-skip.

### Cited Findings
- [opened] **SRD 5.2.1** (CC-BY-4.0), "Initiative", p. 13. "For a group of identical creatures, the GM makes a single roll, so each member of the group has the same Initiative." The order "remains the same from round to round". Ties: the GM orders tied monsters, the players order tied characters, and the GM decides between a monster and a character. Surprise gives Disadvantage on the Initiative roll. — https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf
- [opened] **SRD 5.2.1**, "Doing Nothing on Your Turn": "If you can't decide what to do, consider taking the defensive Dodge action or the Ready action to delay acting." This is SRD backing for a defensive default action. — same PDF, p. 13
- [opened] **Old-School Essentials SRD** (B/X), "Combat Sequence Per Round": players declare spells and melee movement first, then "Each side rolls 1d6" every round, and the winning side acts in the order morale, movement, missiles, spells, melee. Ties: "Both sides may roll again, or actions on both sides may be resolved simultaneously." Individual initiative is the *optional* rule. — https://github.com/oldmanumby/ose.srd/blob/main/5_Adventures/10_Combat.md (mirror; the official SRD host returned HTTP 500)
- [opened] **Sly Flourish**, "Simpler Initiative Options" (Mike Shea, 2015-04-20). It quotes the 2014 DMG's side-initiative variant (p. 270): "the group rolls one d20 for the characters and the DM rolls for the monsters with no modifiers… Whoever goes first goes first in any order." He calls it "certainly fast". — https://slyflourish.com/side_initiative.html
- [opened] **Sly Flourish**, "Three Alternative Initiative Options" (2025-11-03). He describes elective ("popcorn") initiative as "cinematic", but it "feels ripe for min-maxing… Why wouldn't you put the monsters at the bottom of the turn order?" He says around-the-table initiative "doesn't work quite as easily in online play". — https://slyflourish.com/three_initiative_options.html
- [opened] **Fate Condensed** (CC-BY-3.0), turn order: "the GM and players decide who goes first based on the situation, then the active player picks who goes next"; GM characters are picked the same way. In one exchange each character can take "one overcome, create an advantage, or attack action, and can move once." — https://fate-srd.com/fate-condensed/challenges-conflicts-and-contests
- [opened] **Draw Steel** (Creator License; short quotes). A d10 roll decides which side goes first. Then sides alternate, each choosing one creature to act. Once one side has finished, the rest of the other side acts in any order. There's an "Argument Timer": after about 30 seconds "the Director chooses a hero to act." "Director-controlled creatures act in groups." The side that went first goes first in every later round. An alternative, rolled order is offered for groups who don't enjoy planning. — https://github.com/SteelCompendium/data-md/blob/main/Rules/Chapters/Combat.md
- [opened] **13th Age SRD**, combat rules: each creature rolls d20 + initiative bonus once, and "all monsters of the same exact type share one roll" (WebFetch summary of the page). — https://www.13thagesrd.com/combat-rules/
- [opened] **Avrae source** (`avrae/avrae`, `cogs5e/initiative/cog.py`; the file's last commit is `547b70d`, 2026-07-28). Options on `!init begin`: `dyn` ("Rerolls all initiatives at the start of a round"), `turnnotif` ("Notifies the controller of the next combatant in initiative"), `initscore`, `-name`. `madd`/`add` take `-group <group>` for a shared initiative. Commands include `next`, `prev`, `skipround`, `reroll`. I found no timeout or auto-skip in the cog; turns advance only when someone types `!init next`. — https://github.com/avrae/avrae/blob/master/cogs5e/initiative/cog.py
- [opened] **Avrae DM combat cheatsheet**: "it's up to the player to run commands to take their actions"; monsters added with `madd` have hidden stats. — https://avrae.readthedocs.io/en/latest/cheatsheets/dm_combat.html
- [opened] **Sly Flourish**, "Play D&D Over Discord" (2020, updated 2021): Avrae's best DM feature is "rolling initiative for the whole group at once". The article doesn't address asynchronous combat. — https://slyflourish.com/playing_dnd_over_discord.html
- [opened] **Hero Kids** review (TTRPG Kids, 2021-06-09): the game is "rated for ages 4-10". "Each hero's or monster's turn is 1 action + 4 squares of movement"; "all monsters take their turn as a group". — https://www.ttrpgkids.com/2021/06/09/kids-ttrpg-review-hero-kids-fantasy-rpg/
- [opened] **Ironsworn** (CC-BY-4.0, Datasworn `classic.json`). Foes take no turns. *Enter the Fray* decides who has "initiative". *Strike* (you have initiative) keeps it on a strong hit and loses it on a weak hit. *Clash* (the foe has initiative) seizes it on a strong hit. Every miss means "Pay the Price. Your foe has initiative." A foe's action is what happens when the player misses. — https://raw.githubusercontent.com/rsek/datasworn/main/datasworn/classic/classic.json
- [search extract] Forum PbP practice (EN World "Looking for D&D Play-By-Post Tips"; Gamers Plane "PbP Basics"; EN World "Playing DnD on a forum"):
  - per-side initiative "so players can post without waiting on one another"
  - clustering nearby initiative counts so a block of players posts in any order
  - a 24-hour deadline, after which the DM takes the turn
  - resolving the monsters' turn when only one player is left to act

  — https://www.enworld.org/threads/looking-for-d-d-play-by-post-tips.705128/ ; https://gamersplane.com/forums/thread/1276 ; https://www.enworld.org/goto/post?id=7089669
- [search extract] Fate Condensed's changelog credits "Balsera Style" (elective, "popcorn") initiative as the new default. — https://evilhat.itch.io/fate-condensed/devlog/123354/fate-condensed-changelog-20200206

### Inferences
- [computed] **Serial waits per round.**
  - Individual initiative in classic PbP: each turn waits for the previous post. Three heroes and three goblins is up to 6 serial waits a round; the engine's mean of 3.4 rounds (Q3) makes about 20 serial posts a fight.
  - Side initiative: 2 waits a round.
  - The engine: 1 wait a round, with every hero's choice made in parallel and the foes resolved by the bot.

  The engine's structure is already the async optimum. Keep it, and spend design effort elsewhere.
- Because the engine resolves in initiative order *after* declaration, it has the OSE "declare, then resolve" structure, and with it the dead-target problem. The fallback to the first fighting foe (`index.ts:479-483`) is the sensible fix, and OSE's simultaneous-ties option suggests no further fix is expected.
- Per-foe initiative (`index.ts:240`) spreads identical foes through the order. The SRD rule (one roll per group) and the minion rules below (one shared turn) both group them. Grouping would make the turn message shorter ("the goblins attack") and makes squads possible (Q3).
- Defend as the no-show default has SRD backing ("consider taking the defensive Dodge action"). A friendlier option the sources suggest is "repeat last action" or "the bot picks a plain attack". The balancer assumes plain attacks, so an absent hero who Defends makes a fight harder than the balancer tested. That's an inference, not measured.
- Popcorn and alternating-side orders need a live table to negotiate who goes next. That conversation is the expensive thing in play by post, so they don't fit the bot. Draw Steel's 30-second argument timer is the same problem at game-night scale.

### Gaps
- The 2014 DMG p. 270 side-initiative wording comes through Sly Flourish's quote; the DMG itself was not opened (not SRD).
- No primary source found for how Discord PbP servers (as opposed to forums) handle combat timeouts. Avrae has none built in.
- The origin of the term "popcorn initiative" was not found (the search returned nothing useful).

---

## Q2. Action economy: 5e vs PF2e vs 13th Age (and Draw Steel), for 8-year-olds and one post per turn

### Takeaway
Every system gives one "main thing" per turn and adds layers around it:
- 5e adds a bonus action that only exists when a feature grants one, plus one reaction.
- PF2e gives three interchangeable actions plus a reaction.
- 13th Age has standard, move and quick actions, plus one interrupt.
- Draw Steel has a main action, a maneuver and a move.

The layers that break one post per turn are **reactions and interrupts**, which happen on someone else's turn, and **multi-step turns**, which ask for several decisions in one post. The engine already uses the simplest form: one action, no movement, no reactions. That matches the kids' games (Hero Kids: "1 action + 4 squares"). The design room is in *which* single action, not in more of them.

### Cited Findings
- [opened] **SRD 5.2.1**, Actions table (p. 9): Attack, Dash, Disengage, Dodge, Help, Hide, Influence, Magic, Ready, Search, Study, Utilize. "You can take a Bonus Action only when a special ability, a spell, or another feature of the game states that you can do something as a Bonus Action." A Reaction "can occur on your turn or on someone else's"; "you can't take another one until the start of your next turn." — SRD 5.2.1 PDF pp. 9-10
- [opened] **PF2e, Archives of Nethys**, "Turns" (Player Core p. 435): at the start of your turn, "Regain your 3 actions and 1 reaction"; you can't save reactions. — https://2e.aonprd.com/Rules.aspx?ID=2427
- [opened] **13th Age SRD**: "you can take one standard action, move action, and quick action" plus free actions; "You can use one interrupt action when it's not your turn", and only some classes and powers have one. — https://www.13thagesrd.com/combat-rules/
- [opened] **Draw Steel**: each creature gets "a main action, a maneuver, and a move action". The main action can be traded for a second move or maneuver. Minion turns are cut to a move plus a main action (or a maneuver). — Combat.md and Monster Basics.md in the SteelCompendium mirror
- [opened] **Flee, Mortals!** preview (MCDM, OGL): minions "don't multiattack, roll for damage, or take bonus actions or reactions, so their turns aren't long." — https://files.mcdmproductions.com/FleeMortals/FleeMortalsPreview.pdf, p. 22
- [opened] **Hero Kids** (TTRPG Kids review): "1 action + 4 squares of movement" per turn; ages 4-10. — URL in Q1
- [opened] **No Thank You, Evil!** review (Open Gaming Network, 2018): "a straight 1d6 against a difficulty from 1 to 8 with points/actions to lower the difficulty". It is pitched at "ages five to fourteen", with character sheets "for every age/experience level". — https://articles.opengamingnetwork.com/2018/06/rpg-review-monte-cook-games-no-thank-you-evil/

### Inferences
- **Easiest for one post per turn:** one action chosen from a short menu, which is what the engine already has. PF2e's three actions fit in one post in principle, but the choices stack inside the post (and the Multiple Attack Penalty, covered in `d20_systems.md`, makes the second and third attacks a trap a new player won't see).
- **Reactions don't survive async play.** A reaction needs the player to be present on someone else's turn. The engine's only reaction-like thing, the Shield spell, is pre-declared as the hero's action for the round (`index.ts:865-867`). Pre-declared, condition-triggered "stances" ("if something attacks Mara, I step in") are the async form of a reaction. I found no source testing this with kids (UNVERIFIED as a pattern).
- **A "maneuver" slot à la Draw Steel**, a free second minor choice, is the one layer that could add a setup option (Q4) without costing the attack. It would double the decisions per post, though, so it belongs in the "advanced" presentation, if anywhere.
- **For 8-year-olds**, the kids' games point to one action from a picture-like menu, and an "Awesome"-style pool spent to help a friend (Q5).

### Gaps
- No designer rationale was opened for PF2e's three-action economy, or any study of action economy with children.
- No Hero Kids or No Thank You, Evil! rulebook text was opened (both are commercial).

---

## Q3. Fight length and pacing: rounds per fight, the HP critique, minions, and posts per fight

### Takeaway
The common expectation is about **3 rounds** for an ordinary fight, with boss fights longer (Sly Flourish). The engine's typical fights are already in that range, at a mean of about 2 to 4.5 rounds in my simplified simulation. At play-by-post pace that means up to 2 to 5 days per fight, with a hard cap of 8. The critique of 5e HP is mostly about *bosses* evaporating, not ordinary fights dragging: Mearls says a party "can vaporize boss monsters in a round or even less". Minion rules exist for many weak foes:
- 13th Age mooks: a shared mob damage pool.
- Flee, Mortals! minions: any damage from an attack drops one, overkill rolls to the next, and they make one group attack.
- Draw Steel squads: a shared Stamina pool and one roll per squad.

All three make *a single hit visibly do something*, which is a whiff-reducing tool in its own right.

### Cited Findings
- [opened] **Sly Flourish**, "How Many Rounds of Combat Are Ideal?" (2023-10-02): "I think many DMs and players expect the answer of roughly 'three'". "Climactic multi-phase battles might go six or nine rounds." He also says "I don't think it's useful to worry about how many rounds combat takes." — https://slyflourish.com/rounds_of_combat.html
- [opened] **Wargamer**, Mollie Russell, 2025-10-09, quoting Mike Mearls's Bluesky posts of 2025-10-08: "It's quite likely that a semi-optimized party can vaporize boss monsters in a round or even less." The game "was built around the assumption that characters would engage in about 20 rounds of combat between long rests." Suggested fix: "design boss monsters with a different hit point scale, one that assumes the party is alpha striking." — https://www.wargamer.com/dnd/mike-mearls-boss-fight
- [opened] **SRD 5.2.1**, "Troubleshooting: Many Creatures" (p. 202): "If your encounter includes more than two creatures per character, include fragile creatures that can be defeated quickly. This guideline is especially important for characters of level 1 or 2." "Adjustments": "You can adjust an encounter on the fly, such as by having creatures flee (making the encounter easier) or adding reinforcements." — SRD PDF p. 202
- [opened] **13th Age SRD**, monster rules, mooks: "Damage is not tracked against single mooks, but against the entire mob of mooks you're facing"; excess damage goes to "another mook"; "A mook's hit point value is one-fifth that of a regular monster"; mooks deal fixed damage. — https://www.13thagesrd.com/monsters/monster-rules/
- [opened] **Flee, Mortals!** preview (pp. 22-23):
  - **Minion trait:** "If the minion takes any damage from an attack or as the result of a failed saving throw, their hit points are reduced to 0."
  - **Overkill attacks:** damage beyond the target's HP maximum drops further minions in reach, or in a line for ranged attacks.
  - **Group attacks:** 2 to 5 minions make one attack roll at +1 per minion, and the damage is multiplied by the number of minions.
  - **Other:** minions deal static damage and "can't score critical hits".
  - **Cost:** the goblin minion is "CR 1/4 Minion 10 XP", against 50 XP for an ordinary CR 1/4 goblin in the same packet, so it costs one-fifth.
  - **Behind the design:** it rejects 4e's 1-HP minion because spells like *sleep* or *magic missile* "would lay waste" to them at high level.

  — https://files.mcdmproductions.com/FleeMortals/FleeMortalsPreview.pdf
- [opened] **Draw Steel**, "Using Minions": squads of up to 8 share a Stamina pool. A minion drops each time the pool falls by one minion's Stamina, and non-area damage can drop several. The squad makes one roll for its signature ability. "Minions die quickly! … That's okay! It's why you build encounters with them four at a time." The book also advises: "Share the information in this section with them!" — https://github.com/SteelCompendium/data-md/blob/main/Bestiary/Monsters/Chapters/Monster%20Basics.md
- [search extract] Blog of Holding (Paul Hughes) analyses the 2024 Monster Manual's HP and damage per round, using the 2014 DMG's three-round assumption, and concludes HP was "roughly on target" with damage the bigger change. — https://blogofholding.com/?p=8593 (not opened)
- [search extract] EN World threads on "HP bloat" propose halving monster HP and doubling damage. — https://www.enworld.org/threads/removing-the-hp-bloat.669410/

### Computed
[computed] Script: `pace_sim.py` (in the session scratchpad, not committed). It mimics the engine: heroes focus the first foe still fighting, foes hit a random standing hero, Dazed heroes Rally on d20 ≥ 10, the first time a foe is bloodied it breaks on d20 < 8, the cap is 8 rounds, and each case runs 20,000 times. There are no spells, Help, Pack Tactics or prone. Heroes are average: +5 to hit, 1d8+3 damage, AC 15, 11 HP at level 1 (27 HP and AC 16 at level 3). Foe stats are from SRD 5.2.1: Goblin Warrior AC 15, HP 10, +4, 1d6+2; Wolf AC 12, HP 11, +4, 1d6+2; Ogre AC 11, HP 68, +6, 2d8+4.

| Fight | Morale | Mean rounds | Median | p90 | Heroes win | Hit the 8-round cap |
|---|---|---|---|---|---|---|
| 3 L1 heroes vs 3 Goblin Warriors (150 XP, moderate budget 225) | off | 3.83 | 4 | 6 | 97% | 1.1% |
| same | on | 3.37 | 3 | 5 | 98% | 0.6% |
| 3 L1 vs 2 Wolves | on | 1.96 | 2 | 3 | 100% | 0% |
| 1 L1 vs 1 Goblin Warrior | on | 2.49 | 2 | 4 | 80% | 0.3% |
| 3 L3 vs 1 Ogre (450 XP, budget 675) | off | 4.56 | 4 | 6 | 100% | 0.2% |
| same | on | 3.82 | 4 | 5 | 100% | 0.1% |

- [computed] **Posts per fight in the engine:** one bot post per round, plus each player's button press. At the post pace (a 1-day timer) a fight of mean 3.4 rounds takes **at most 3 to 4 days**, if somebody is always last to choose, and less when everyone answers early. The p90 is 5 days and the cap is 8 days (`MAX_COMBAT_ROUNDS`). At game night (180 s) a fight takes at most about 10 to 15 minutes.
- [computed] The engine's morale check alone cuts mean fight length by about 0.4 to 0.7 rounds in these cases, about 12% to 16%.

### Inferences
- Fight length is not the engine's problem at levels 1 to 3: it already sits around 3 rounds. The cost in play by post is **days per fight**, so every empty turn costs a day of a short fight. That makes whiffs costlier in proportion than in a 6-round fight.
- The real pacing risk is the **lone boss**, from both ends:
  - **A one-post fight.** The engine hands control spells a one-roll fight-ender (Sleep or Hold Person puts a foe straight at the heroes' mercy, `index.ts:822-825`), and Legendary Resistance does nothing.
  - **A slog.** A big HP pool against a party that whiffs.

  The fixes in the sources (Q6) are action-based, not HP-based.
- **Minions are the strongest fit for kids** and for the whiff problem: "any hit drops one" means a hero's hit always changes the board. The Flee, Mortals! cost (one-fifth XP) slots straight into the XP-budget balancer. Group attacks (one roll, +1 per minion) also cut the length of the bot's turn message.
- Draw Steel's advice to *tell players how minions work* supports showing the rule on screen ("one hit knocks out a goblin scout!").

### Gaps
- No primary WotC statement of a target round count (Blog of Holding says the 2014 DMG's damage maths assumes 3 rounds; the DMG wasn't opened).
- No primary 4e text on minions (1 HP, a miss never damages a minion; UNVERIFIED, from memory).
- My simulation leaves out spells and the engine's other actions. A faithful number needs the TypeScript engine run headless: dependencies aren't installed in this checkout, and I didn't install them.

---

## Q4. Conditions and setups: which conditions are clear for kids, and how setting up an ally becomes a real choice

### Takeaway
The clearest SRD conditions are the ones with **one effect a child can picture**: Poisoned, Blinded, Prone, Frightened, Restrained. The engine's kid names ("Queasy", "Can't See", "Knocked Down", "Spooked", "Tangled") already do this. In 5e as written, and in this engine, **setting up an ally is a weak choice**. Help gives the ally advantage, worth about 2 expected damage, against about 5 for attacking yourself, unless the ally is a Scout with sneak dice. Other games make setups real in three ways:
1. Make the bonus last or **stack with the ally's own strength**: Fate's free invokes, Blades' "+1 effect or improved position", Scouts' sneak damage.
2. Make the setup **cheap**: a Draw Steel maneuver, not a main action.
3. Make the setup **also pay off on a miss**: PF2e's Demoralize lands a smaller effect on a plain success.

### Cited Findings
- [opened] **SRD 5.2.1**, Help [Action] (glossary p. 182). "Assist an Attack Roll. You momentarily distract an enemy within 5 feet of you, giving Advantage to the next attack roll by one of your allies against that enemy. This benefit expires at the start of your next turn." — SRD PDF p. 182
- [opened] **SRD 5.2.1** condition texts (pp. 177-185). Number of separate effects per condition [computed by counting the bolded effect headings]:

  | Effects | Conditions |
  |---|---|
  | 1 | Poisoned, Deafened |
  | 2 | Blinded, Charmed, Frightened, Prone |
  | 3 | Grappled, Restrained, Stunned, Invisible |
  | 4 | Incapacitated, Exhaustion |
  | 5 | Paralyzed |
  | 6 | Unconscious |
  | 7 | Petrified |

  Frightened, for example, is "Disadvantage on ability checks and attack rolls while the source of fear is within line of sight" and "Can't Approach".
- [opened] **PF2e, Archives of Nethys**:
  - **Off-Guard** (Player Core p. 445): "You take a –2 circumstance penalty to AC." — https://2e.aonprd.com/Conditions.aspx?ID=58
  - **Flanking** (Player Core p. 425): "A creature is off-guard (taking a –2 circumstance penalty to AC) to melee attacks from creatures that are flanking it." — https://2e.aonprd.com/Rules.aspx?ID=2375
  - **Aid** (Player Core p. 416): a reaction, prepared with an action on your turn, against a "typical DC is 15". A critical success gives "+2 circumstance bonus to the triggering check" (+3 for a master, +4 for legendary), a success +1, a critical failure −1. — https://2e.aonprd.com/Actions.aspx?ID=2292
  - **Demoralize** (Player Core p. 240): one action, Intimidation against the target's Will DC; critical success frightened 2, success frightened 1; then the target is immune to your Demoralize for 10 minutes. — https://2e.aonprd.com/Actions.aspx?ID=2395
- [opened] **Fate Condensed**, Create an Advantage. On a success "you create a situation aspect with one free invoke on it", and on a success with style two. "You can even let your allies use free invokes you have created." An invoke gives "+2 bonus to your roll or reroll all four dice." On a tie you get a boost. — https://fate-srd.com/fate-condensed/taking-action-rolling-dice
- [opened] **Blades in the Dark**, Teamwork. "Set up: If your action has its intended result, any member of the team who follows through on your maneuver gets +1 effect level or improved position." Assist: "Take 1 stress and give them +1d to their roll." — https://bladesinthedark.com/teamwork
- [opened] **Draw Steel**, Aid Attack is a *maneuver*, not a main action: "The next ability roll an ally makes against that enemy before the start of the aiding creature's next turn gains an edge." — Combat.md (mirror)
- [opened] **Flee, Mortals!** preview: "save ends" effects let the target "repeat the saving throw on each of their turns, ending the effect on themself early on a success". — preview PDF p. 18 ("Save Ends Effects")

### Computed
[computed] Value of Help against attacking yourself, for an average level-1 hero (+5, 1d8+3; a crit adds 4.5):

| Foe AC | Your own attack (expected damage) | What Help adds to an ordinary ally | What Help adds to a Scout ally (+1d6 sneak on advantage) |
|---|---|---|---|
| 12 | 5.47 | +1.79 | +5.31 |
| 13 | 5.10 | +1.92 | +5.33 |
| 15 | 4.35 | +2.07 | +5.20 |

So Help is worth roughly 35% to 48% of an attack, except when it sets up a Scout, where it roughly equals one. In the engine the distracted state also lasts until it's used (`index.ts:650`), not just to the start of the helper's next turn, which makes it a little better than the SRD's.

### Inferences
- **What a non-damage move could achieve**, drawing on the sources (all options, none tested):
  - give the next ally's hit **extra effect**, such as +1 damage die or a guaranteed minimum (Blades' "+1 effect")
  - leave a **lasting mark** any ally can spend once (Fate's free invoke)
  - knock a foe **prone** for the round (the bestiary's most common attack effect: 31 prone attack effects against 16 grappled and 11 poisoned [computed from `bestiary.generated.ts`])
  - **frighten** it so it hits worse (PF2e Demoralize)
  - **pin** it (Restrained)
  - **break its morale** sooner (Q6)
- **The defense-mix direction gives these moves a home.** A Wis- or Cha-keyed "Spook" against Will that lands Frightened, and a Str-keyed "Shove" against Fortitude that lands Prone, are exactly PF2e's Demoralize and Trip pattern. The partial-hits rule could give each one a smaller effect on a near miss, the way PF2e's success gives frightened 1 and a critical success frightened 2.
- **Effect duration needs one rule for both sides.** Heroes' conditions on foes last at most 3 rounds, but foes' conditions on heroes last the whole fight (`index.ts:571`, `:828`). Flee, Mortals!'s "save ends" is the simplest SRD-compatible fix.
- **Avoid Paralyzed, Petrified, Unconscious and Exhaustion** as hero-applied effects for kids: each has 4 to 7 sub-effects.

### Gaps
- 13th Age has no general "aid another" in combat as far as the SRD pages I opened show. Its setups come from class talents and the escalation die (UNVERIFIED: I didn't search every class page).
- No study of which conditions children understand; the clarity ranking above is my effect count, not a test.

---

## Q5. Defeat for kids: 0 HP, death saves vs knocked out, retreat and surrender

### Takeaway
Every kids' game and most modern games end a fight without death. The common pieces are:
- a short track to "out of the fight": Hero Kids' Bruised, Hurt, KO; No Thank You, Evil!'s "Conked Out"
- a friend's action to bring a hero back
- foes that flee or surrender
- a table-level retreat that costs story progress, not lives: 13th Age's campaign loss, Fate's concession

The engine's Dazed and Rally (d20 ≥ 10, failing costs nothing) is already gentler than SRD death saves. Two things it lacks:
- **A way for the party to concede or retreat** before everyone is down.
- **Variety in foe exits:** the bestiary's crumble and fade styles fall through to "yielded" (see Current engine).

### Cited Findings
- [opened] **SRD 5.2.1**, Dropping to 0 HP (pp. 17-18). A monster "dies the instant it drops to 0 Hit Points, although a Game Master can ignore this rule". Death saves: "Roll 1d20. If the roll is 10 or higher, you succeed… On your third success, you become Stable… On your third failure, you die." A natural 1 counts as two failures; a natural 20 regains 1 HP. Knocking Out a Creature: "When you would reduce a creature to 0 Hit Points with a melee attack, you can instead reduce the creature to 1 Hit Point and give it the Unconscious condition." "Ending Combat": "Combat ends when one side or the other is defeated, which can mean the creatures are killed or knocked out or have surrendered or fled. Combat can also end when both sides agree to end it." — SRD PDF pp. 13, 17-18, 182
- [opened] **13th Age SRD**:
  - Death saves are rolled at the start of your turn. A 16+ lets you spend a recovery and get up; a 15 or less is a failure, and the fourth failed death save in a battle kills.
  - "Fleeing is a party action. On any PC's turn, any player can propose that all the characters flee the fight"; "The party suffers a campaign loss."
  - Rally: once a battle, a standard action to spend a recovery; a second rally needs a save of 11+.
  - Staggered at half HP.

  — https://www.13thagesrd.com/combat-rules/
- [opened] **Fate Core / Condensed**, conceding: "you can interrupt any action at any time before the roll is made to declare that you concede the conflict." You get a fate point, plus one per consequence taken, and you narrate the loss, but it can't undermine the winner's victory. Being taken out hands the character's fate to the winner. — https://fate-srd.com/fate-core/conceding-conflict ; https://fate-srd.com/fate-condensed/challenges-conflicts-and-contests
- [opened] **Draw Steel**:
  - **Knock out:** "If you damage a creature with an ability that would kill them, you can choose to instead knock them unconscious."
  - **Dying heroes still act:** while dying "you can still act, your allies can help you spend Recoveries".
  - **Ending a fight:** heroes win when foes "are broken, flee, or surrender". After the stars of a fight fall, the weaker foes "flee or surrender".
  - **Dramatic Finish:** each player narrates how their hero neutralizes a remaining foe, then the battle ends.
  - **Fleeing Foes** sidebar: "this is a heroic game… 'Gotcha!' moments that make players suspicious of every fleeing bandit shouldn't be part of those stories."

  — Combat.md (mirror)
- [opened] **No Thank You, Evil!** (Open Gaming Network review): "no character dies, they merely get Conked Out"; "reviving them (to the full health/power) is an action that any other player can do". — URL in Q2
- [opened] **No Thank You, Evil!** (Monstermind blog, 2023-09-13, played with an 8-year-old): "My kid does not like to attack the monsters"; "each monster has a special weakness, that can be used to defeat it without combat". — https://www.monstermind.nl/blog/2023-09-13-no-thank-you-evil-thoughts-after-play
- [opened] **Hero Kids** review (Matthew J. Constantine, 2023-04-03): "Characters don't die, they're just knocked out"; monsters "running away" rather than being killed. — https://matthewjconstantine.com/2023/04/03/tabletop-rpg-review-hero-kids/
- [search extract] Hero Kids has three health boxes, marked Bruised, Hurt, then KO, and a KO'd hero is out of the fight. The source is a Scribd copy of the rulebook (not opened, and of unclear legality). — https://www.scribd.com/document/891262903/Hero-Kids-Fantasy-RPG-Printer-Friendly
- [search extract] Wikipedia: No Thank You, Evil! won the 2016 Gold ENnie for Best Family Game. — https://en.wikipedia.org/wiki/No_Thank_You,_Evil! (opened, but the article has no rules content)

### Inferences
- **Keep Rally, consider a friend-helps bonus.** In No Thank You, Evil! any friend can revive a Conked Out hero as an action. In the engine, healing already wakes a hero, but there's no "help a friend up" without a potion or spell. A Help-a-friend action that gives Rally advantage, or an automatic success, would make Help useful (Q4) and match the kids' games.
- **A party "fall back" choice** (13th Age's party flee, Fate's concede) fits play by post: it ends a losing fight in one post instead of several rounds of Rally rolls. The cost should be story, not loss: the foe gets what it wanted.
- **Draw Steel's Dramatic Finish is a direct fix for the post-climax tail.** Once the fight is decided, let each player narrate a finish instead of rolling out the last rounds. The engine's 8-round "slip away" cap is a blunt version of this.
- **Fix the 41 crumble and fade creatures.** They should leave with their own words, not "yielded" (`index.ts:502-511`; small, and outside this research).

### Gaps
- No Hero Kids or No Thank You, Evil! rulebook text opened; Hero Kids' exact recovery rule is unconfirmed.
- No research found on how children aged 8 to 12 react to character "defeat" in RPGs.

---

## Q6. Foe behavior: targeting in bot-run play, morale, and keeping bosses threatening

### Takeaway
- **Bot-run foes need written rules.** The SRD gives three ("use the special ability as quickly and as often as possible", Multiattack otherwise, use bonus, reaction and legendary actions whenever possible), and the engine follows them except legendary actions. Draw Steel adds per-role targeting rules (brutes go for the closest group; solos focus "whichever hero threatens them most"). Gloomhaven's deterministic focus rules show how a board game makes foe targeting predictable without a GM.
- **Morale:** B/X checks 2d6 against a 2-12 rating at the first death and at half strength. The 2014 DMG uses a DC 10 Wisdom save at half HP or when the leader falls. The engine checks once per foe at bloodied, at 35% for a normal foe.
- **Bosses:** the sources agree that action economy, not HP, keeps a lone boss threatening:
  - SRD legendary actions after other creatures' turns
  - Flee, Mortals! and Draw Steel villain actions: three, once each, at most one per round, in an opener, crowd-control, ultimate arc
  - Draw Steel's Malice, a GM resource that grows each round

### Cited Findings
- [opened] **SRD 5.2.1**, "Running a Monster" (p. 255): "If the monster has a special ability that deals a lot of damage but has a limited number of uses… have it use that special ability as quickly and as often as possible." "If the monster has Multiattack, have it use Multiattack on any of its turns in which it's not using one of its more powerful abilities." "If the monster has Bonus Actions, Reactions, or Legendary Actions… make sure it uses them as often as it can." — SRD PDF
- [opened] **SRD 5.2.1**, Legendary Actions: "A Legendary Action is an action that a monster can take immediately after another creature's turn. Only one of these actions can be taken at a time… The monster expends one use whenever it takes a Legendary Action, and it regains all expended uses at the start of each of its turns." The Aboleth has "Legendary Action Uses: 3 (4 in Lair)". — SRD PDF
- [opened] **Flee, Mortals!** preview, "Villain Actions" (p. 18): "A creature can only use one villain action per round (as such, villain actions tend to be more powerful than legendary actions)"; "Each villain action can only be used once during a combat encounter"; there's a recommended order of opener, crowd control, then "an ultimate move or 'ult'". The section is framed as an alternative to "simply increasing CR (an approach that often leads to underwhelming encounters)". Its example, Queen Bargnot's villain actions, are all *commands to her allies* (move or attack, focus fire, attack with advantage). — preview PDF
- [opened] **Draw Steel**, Villain Actions: the same three-action structure, usable "at the end of any other creature's turn". Malice: the Director gains Malice equal to the number of heroes plus the round number at the start of each round, and spends it on stronger monster abilities. Roles:
  - **Brute:** "moves toward the closest group of enemies and attacks"
  - **Artillery:** moves away from nearby foes, "often focusing first on the biggest threat to their allies"
  - **Solo:** "focus on whichever hero threatens them most effectively"
  - **Solo vs a full party:** "can typically stand toe-to-toe with six heroes of the same level."

  — Monster Basics.md (mirror)
- [opened] **OSE SRD**, Morale (Optional Rule). Morale is rated 2-12: 2 "will not fight" and 12 "fights to the death". The check is 2d6, and "Higher than morale score: The monster will surrender or attempt to flee." It's made at the "First death on side" and when "half the monsters are incapacitated". "If a monster makes two successful morale checks in an encounter, it will fight until killed." The referee may adjust by −2 to +2. — https://github.com/oldmanumby/ose.srd/blob/main/5_Adventures/12_Morale.md
- [search extract] **2014 DMG** p. 273 morale variant (not SRD). A creature may flee if surprised, or when reduced to half its HP for the first time; a group may flee when its leader is downed, incapacitated, captured or removed, or when the group is at half strength. The check is "a DC 10 Wisdom saving throw for the creature or the group's leader." Forum critics note Wisdom is a weak save for soldier types. — https://www.enworld.org/threads/handling-morale-checks.711328 ; https://dmdavid.com/tag/morale-checks-does-wisdom-make-one-courageous-or-wise/
- [opened] **SRD 5.2.1** has no morale rule. Its only lever is the GM "having creatures flee (making the encounter easier)". — SRD PDF p. 202
- [opened] **13th Age SRD**: no general targeting rule. "Only exceptional monsters get to add the escalation die to their attacks"; Large monsters "count as two monsters" and Huge as three. — https://www.13thagesrd.com/monsters/monster-rules/
- [opened] **Ironsworn**: the foe never takes a turn; its threat arrives through "Pay the Price" when the player misses or gets a weak hit on *Clash*. — Datasworn (URL in Q1)
- [search extract] **Gloomhaven** monster focus: the monster picks the enemy it can reach with the fewest movement points, then the nearest by hexes, then the one earlier in the initiative order; summons are targeted before their summoner. — https://rules.dized.com/gloomhaven/rule/monster-focus/monster-focus-faq-explained (a fan rules site, not opened)
- [search extract] **4e solos** (EN World forum discussion): solos faced "a 5:1 action-economy disadvantage", were "stunlocked too easily", and later designs added "action-preservation abilities". — https://www.enworld.org/threads/solo-monster-encounter-problems.265016/

### Computed
- [computed] **Chance to flee on one check.**

  | Rule | Chance to flee |
  |---|---|
  | OSE morale 6 | 58% |
  | OSE morale 7 | 42% |
  | OSE morale 8 | 28% |
  | OSE morale 9 | 17% |
  | OSE morale 10 | 8% |
  | Engine, "normal" foe (d20 < 8) | 35%, about OSE morale 7.5 |

  OSE checks the whole side twice, at the first death and at half strength. The engine checks each foe once, when it's bloodied.
- [computed] **Action economy of a lone boss in the engine.** Against 3 heroes the boss acts once per round to their three, and a single failed Wisdom save against Sleep or Hold Person ends the fight (`index.ts:822-825`). Only 3 of 250 bestiary creatures carry Legendary Resistance text, and the engine ignores it.

### Inferences
- **Targeting.** Random-among-standing (`index.ts:1019`) is fair and kid-safe, but players can't read it, so they can't play around it, and setups and Defend lose value. A deterministic, *shown* rule makes Defend and "step in front" moves meaningful. Draw Steel's role lines and Gloomhaven's focus rule both point this way: "the brute goes for whoever hit it last", "the archer shoots whoever is farthest from the others". This is a design option; any rule must keep "never a downed hero".
- **Morale fits the defense mix.** A Will- or Charisma-keyed "Spook" or "Shout" move could force an early morale check, which is the B/X lever from Q4. Pairing it with a side-level check (the first foe drops, so the rest check) would also shorten the post-climax tail.
- **Bosses: adopt villain actions, not legendary actions.** For a bot posting once per round, three scripted villain actions (one per round, after a hero's turn, opener, then control, then ult) are cheaper to narrate than legendary actions after every turn. They also give the boss a cinematic arc that suits kids. Villain actions don't patch the "one Sleep ends the boss" hole: bosses also need Legendary Resistance as written, or a boss rule ("asleep" only skips a turn).
- **Malice-style escalation for foes conflicts with 13th Age's warning** (in `d20_systems.md`) that giving the escalation die to monsters flattens the dramatic curve. If foes get a growing resource, it should be the boss's alone.

### Gaps
- The 2014 DMG morale text was not opened (not SRD).
- Gloomhaven's official rulebook text was not opened.
- No primary 4e text on solos or minions.
- No source on how AI-run foes in kids' digital RPGs pick targets.

---

## How these interact with the two chosen directions

- **Partial hits and momentum:**
  - Minions (Q3) are a second whiff-reducer: any hit drops one. Combining them with partial hits risks double-dipping, so choose which foes get which.
  - Setup moves (Q4) make good momentum targets: momentum could be *spent* as a Fate-style free invoke for an ally, which gives a miss a team payoff.
  - Fight length (Q3) means each whiff is about a third of a 3-round fight, which strengthens the case.
- **Defense mix:**
  - Non-damage moves such as Spook (Will, leading to Frightened or a morale check) and Shove (Fortitude, leading to Prone) are the natural moves to target the non-armor defenses (Q4, Q6).
  - Foe special attacks already target hero saves (`index.ts:950-999`). The defense mix makes this symmetrical.
  - A shown targeting rule (Q6) is needed for heroes to pick which defense to go after, and for Defend to matter.

