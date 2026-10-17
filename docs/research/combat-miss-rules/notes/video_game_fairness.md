# How Video Games Make Random Hit/Miss Outcomes Feel Fair

> **Source-access note (read first).** In this research environment WebFetch failed for every site (DNS errors), and direct HTTPS was blocked by the egress policy for all hosts except GitHub. So citations come in three kinds:
> - **[opened]**: I downloaded and read the full file myself. These are XCOM 2 game script source files from the public XCOM 2 War of the Chosen Community Highlander repo on GitHub. That repo carries Firaxis's shipped UnrealScript, released with the XCOM 2 SDK, plus modder changes that are marked in the code.
> - **[search extract]**: the fact appeared in the search engine's extract of that page. I could not open the full page. Treat these as "seen in an excerpt", not "read in full". Where a search extract summarised several pages and the exact page is unclear, I say so.
> - **[computed]**: math I worked out myself with a script, from a formula that is cited separately. These are not sourced claims. They are derivations you can check.
> Anything from memory is marked **(unverified, from memory)**.

## 1. XCOM: Enemy Unknown / XCOM 2 "aim assist" (hidden miss-streak bonus)

### Takeaway
Both XCOM games secretly raise the player's real hit chance after misses on the easier difficulties. The XCOM 2 source code shows exactly how. If a player's shot with a displayed chance of 50% or more misses, the same roll is checked again against a boosted chance: base × a difficulty multiplier, plus a per-miss bonus for every earlier qualifying miss this turn, plus a bonus for each soldier lost, capped at 95%. Enemy hit streaks get the opposite treatment. A Firaxis designer confirmed the Enemy Unknown/Within version publicly: there is a "bad streak breaker" on Normal and Easy, and none on Classic or higher.

### Cited Findings

**XCOM 2 / War of the Chosen: mechanism, read from the game script source [opened]**
- Config variables declared in `X2AbilityToHitCalc_StandardAim.uc`, quoted from the developers' comments:
  - `ReasonableShotMinimumToEnableAimAssist`: "In order for XCom shots to receive Aim Assist help, this baseline hit chance must be met."
  - `MaxAimAssistScore`: "The Maximum score that Aim Assist will produce."
  - `BaseXComHitChanceModifier` (array of floats): "multiplied against the base hit chance for XCom shots. (Note that this is only applied in Easy & Normal Difficulty)."
  - `MissStreakChanceAdjustment` (array of ints): "The adjustment applied to XCom attack hit chances for each consecutive missed attack XCom has made this turn. (Note that this is only applied in Easy & Normal Difficulty)."
  - `HitStreakChanceAdjustment`: "The adjustment applied to Alien attack hit chances for each consecutive successful attack Aliens have made this turn. (Easy & Normal only)."
  - `SoldiersLostXComHitChanceAdjustment` and `SoldiersLostAlienHitChanceAdjustment`: applied "for each soldier XCom has lost below the NormalSquadSize. (Note that this is only applied in Easy Difficulty)."
  - Source: [X2AbilityToHitCalc_StandardAim.uc (Community Highlander, GitHub)](https://raw.githubusercontent.com/X2CommunityCore/X2WOTCCommunityHighlander/master/X2WOTCCommunityHighlander/Src/XComGame/Classes/X2AbilityToHitCalc_StandardAim.uc)
- The formula, in `GetModifiedHitChanceForCurrentDifficulty()` [opened]. Developer inline comments give example values in `//`, and each value is read from a per-difficulty array:
  ```
  // XCom gets 20% bonus to hit for each consecutive miss made already this turn
  if XCom:  Modified = Base * BaseXComHitChanceModifier            // 1.2
            if Base >= ReasonableShotMinimumToEnableAimAssist        // 50
               Modified += MissStreak * MissStreakChanceAdjustment   // 20
                         + SoldiersLost * SoldiersLostXComHitChanceAdjustment // 15
  // Aliens get -10% chance to hit for each consecutive hit made already this turn
  if Alien/Lost and living XCom soldiers <= NormalSquadSize (// 4):
            Modified = Base + HitStreak * HitStreakChanceAdjustment  // -10
                         + SoldiersLost * SoldiersLostAlienHitChanceAdjustment // -25
  Modified = Clamp(Modified, 0, MaxAimAssistScore)
  ```
  — [same file](https://raw.githubusercontent.com/X2CommunityCore/X2WOTCCommunityHighlander/master/X2WOTCCommunityHighlander/Src/XComGame/Classes/X2AbilityToHitCalc_StandardAim.uc)
- How it is applied [opened]. The game rolls normally first. If an XCOM shot rolled a **miss**, it recomputes the modified chance and compares the **same roll** against it: `if (RandRoll < ModifiedHitChance) Result = eHit_Success;` and logs "AIM ASSIST forcing an XCom MISS to become a HIT!" If an alien shot rolled a **hit** and the roll is at or above the modified chance, it becomes a miss ("forcing an Alien HIT to become a MISS!"). Reaction fire, guaranteed hits and special guaranteed hits are excluded ("reaction fire shots and guaranteed hits do not get adjusted for difficulty"). The code comment labels the block "Aim Assist (miss streak prevention)". — [same file](https://raw.githubusercontent.com/X2CommunityCore/X2WOTCCommunityHighlander/master/X2WOTCCommunityHighlander/Src/XComGame/Classes/X2AbilityToHitCalc_StandardAim.uc)
- Streak bookkeeping [opened]. After each offensive ability, a hit sets `MissStreak = 0` and adds 1 to `HitStreak`. A miss adds 1 to `MissStreak` **only if** `CalculatedHitChance >= ReasonableShotMinimumToEnableAimAssist`, and resets `HitStreak = 0`. — [XComGameStateContext_Ability.uc](https://raw.githubusercontent.com/X2CommunityCore/X2WOTCCommunityHighlander/master/X2WOTCCommunityHighlander/Src/XComGame/Classes/XComGameStateContext_Ability.uc)
- Both counters reset to 0 at the start of each player turn (`ResetHitCountersOnPlayerTurnBegin`: "clear the streak counters on this player"). — [X2TacticalGameRuleset.uc](https://raw.githubusercontent.com/X2CommunityCore/X2WOTCCommunityHighlander/master/X2WOTCCommunityHighlander/Src/XComGame/Classes/X2TacticalGameRuleset.uc)
- The Community Highlander adds a master switch, `bDisableAimAssist` (issue #1228), that turns aim assist off. That is a modder addition, not vanilla. — [X2AbilityToHitCalc_StandardAim.uc](https://raw.githubusercontent.com/X2CommunityCore/X2WOTCCommunityHighlander/master/X2WOTCCommunityHighlander/Src/XComGame/Classes/X2AbilityToHitCalc_StandardAim.uc)

**XCOM 2: values per difficulty, from community quotes of DefaultGameCore.ini [search extract]**
- The global values `ReasonableShotMinimumToEnableAimAssist=50` and `MaxAimAssistScore=95` are quoted from DefaultGameCore.ini. — [Steam discussion 2944746708998250511](https://steamcommunity.com/app/268500/discussions/0/2944746708998250511) [search extract]
- `BaseXComHitChanceModifier`: Rookie 1.2, Veteran 1.1, Commander 1.0, Legend 1.0. Legend sets every adjustment to zero, and a forum user notes that copying the Legend entries disables aim assist. — [Steam thread](https://steamcommunity.com/app/268500/discussions/0/2944746708998250511); [xcom.fandom Talk: Game difficulty (XCOM 2)](https://xcom.fandom.com/wiki/Talk:Game_difficulty_(XCOM_2)) [search extract]
- `MissStreakChanceAdjustment`: Rookie 10, Veteran 10, Commander 15, Legend 0. `HitStreakChanceAdjustment`: Rookie −10, Veteran 0. `SoldiersLostXComHitChanceAdjustment`: Rookie 15, Veteran 10. These are from a 2020 Steam post quoting the ini, and a commenter calls the Commander value "Added aim for Xcom after consecutive misses", i.e. +15. — [Steam discussion](https://steamcommunity.com/app/268500/discussions/0/2944746708998250511); [Steam workshop comments 617993180](https://steamcommunity.com/sharedfiles/filedetails/comments/617993180) [search extract]
- Conflicting older claim: a 2016 Steam post said Rookie gets a 20% and Veteran a 10% multiplicative bonus, plus a hidden +15% after a miss "including on Commander". — [Steam workshop comments 617993180](https://steamcommunity.com/sharedfiles/filedetails/comments/617993180) [search extract]. Note that the code comments above give 1.2 and 20 as example values, while the 2020 ini quote gives Rookie MissStreak = 10. The values may have changed between patches or War of the Chosen. **I could not open the actual DefaultGameCore.ini to settle this.**
- A Nexus mod that shows the aim assist describes it as applying to any shot above 50%, based on earlier missed shots above 50% in the same turn. — [Nexus Mods XCOM 2 mod 212](https://www.nexusmods.com/xcom2/mods/212) [search extract]
- An XCOM 2 aim-assist pastebin exists at [pastebin.com/YuZPAHKm](https://pastebin.com/YuZPAHKm) but was blocked, so I did not read it.

**XCOM: Enemy Unknown / Enemy Within (2012/2013)**
- Firaxis designer Ananda Gupta in an Enemy Within interview: there is "in effect, a secret 'luck' modifier that can overide the shot chance displayed on screen". "On Normal and Easy modes, there's a bad streak breaker." "It's stronger on easy. On Easy, it's very hard to actually lose soldiers, and the fewer soldiers you have the stronger this effect becomes, so if you start losing it builds to compensate." On Classic or higher it "doesn't exist". His example: on Easy, "if you miss three times in a row you're not going to miss your fourth shot. It can be a 1% chance to hit and you're not going to miss that shot." — [GameBanshee: "XCOM: Enemy Within Adds 'Save Scum' Option"](https://www.gamebanshee.com/news/112504-xcom-enemy-within-adds-qsave-scumq-option.html) [search extract]. Gupta's "1%" example conflicts with the 50% minimum-shot threshold in XCOM 2's code. EU may have worked differently, or he was speaking loosely.
- The same report says Enemy Within added a "Save Scum" option that reseeds the random number generator on reload, so a reload no longer repeats the same result. — [GameBanshee](https://www.gamebanshee.com/news/112504-xcom-enemy-within-adds-qsave-scumq-option.html) [search extract]
- Community description of EU's Normal/Easy bonus: missing a shot with at least a 50% chance "adds +15% to the next such shot you make, cumulative", resets on a hit, with no cap. On Normal, hit chance is "120% of displayed value with four or fewer soldiers". Alien hit chance changes by 10 points (absolute) per consecutive alien result. — a Steam guide excerpt surfaced in search among [Steam EU discussion 1457328927844749318](https://steamcommunity.com/app/200510/discussions/0/1457328927844749318/?ctp=3) and related threads [search extract; exact thread unclear, single unofficial source]
- On EU difficulties above Normal, aliens get +10 aim and crit, and on Impossible Outsiders and Muton Elites get another +10 aim. — [UFOpaedia Aim (EU2012)](https://temp.ufopaedia.org/Aim_(EU2012)) [search extract]. Changing difficulty mid-mission from Classic to Impossible immediately applies the health and aim bonuses. — [UFOpaedia Difficulty (EU2012)](https://ufopaedia.org/Difficulty_(EU2012)) [search extract]

**Developer framing**
- Jake Solomon on Soren Johnson's Designer Notes podcast (ep. 81, part 2) lists "why 75% does not mean 75%" as a topic. — [Designer Notes 81: Jake Solomon, Part 2](https://www.designer-notes.com/designer-notes-81-jake-solomon-part-2/) [search extract; episode content not heard]
- Solomon on EU's fixed (seeded) results: he "probably should have" offered an option to unsynchronise them. — [Softpedia: "Lead XCOM Designer Regrets Fixed Hit Chance Results"](https://games.softpedia.com/blog/Lead-XCOM-Designer-Regrets-Fixed-Hit-Chance-Results-319573.shtml) [search extract]. A Solomon quote on a forum gives the reason: "We use synchronous random in combat so the player can't just reload when they miss a shot." — [Penny Arcade forum](https://forums.penny-arcade.com/discussion/169513/xcom-enemy-unknown/p78) [search extract; secondhand quote]
- Game Developer article "Jake Solomon explains the careful use of randomness in XCOM 2": in the excerpt I could see, unpredictability was the team's design mantra. The part on aim assist was not retrieved. — [Game Developer](https://www.gamedeveloper.com/design/jake-solomon-explains-the-careful-use-of-randomness-in-i-xcom-2-i-) [search extract]

### Inferences
- [computed] The XCOM 2 code's effective hit chance is max(displayed, clamp(displayed × mult + misses × adj, 0, 95)), because only misses are re-checked against the same roll. Effective hit chance after 0, 1, 2 and 3 qualifying misses this turn:
  - Code-comment example values (×1.2, +20): 50% shot → 60 / 80 / 95 / 95. 65% shot → 78 / 95 / 95 / 95. A 40% shot gets only the multiplier, so it is 48 every time.
  - Forum-quoted Rookie (×1.2, +10): 65% shot → 78 / 88 / 95 / 95.
  - Forum-quoted Veteran (×1.1, +10): 65% shot → 72 / 82 / 92 / 95.
  - Forum-quoted Commander (×1.0, +15): 65% shot → 65 / 80 / 95 / 95.
- Design features that carry straight over to a 5e Discord bot:
  - The bonus is per team ("consecutive misses XCOM has made this turn"), not per character.
  - It applies only to "reasonable" shots (50% or more), so bad decisions aren't rescued.
  - Hit chance is capped at 95%, so nothing becomes certain.
  - Counters reset each turn.
  - It is stronger on easier modes and when the player is losing (soldiers lost).
  - It works asymmetrically: player misses are turned into hits, and enemy hit streaks are dampened.
  - It is hidden. The UI keeps showing the base percentage.
- A d20 version could be: "after each qualifying party miss this round, the next party attack gets +2 (or advantage) until a hit." That is analogous, not documented.

### Gaps
- I could not read the vanilla XCOM 2 / War of the Chosen `DefaultGameCore.ini` (blocked). Per-difficulty values come only from forum quotes, and those conflict (Rookie MissStreak 10 vs. the code comment's 20).
- I found no official Firaxis document giving XCOM 2's numbers. The Gupta interview is the only developer statement I saw, and it covers EU/EW.
- Exact EU values for Easy were not retrieved.

## 2. Fire Emblem "true hit" (2RN) and the hybrid systems

### Takeaway
Many Fire Emblem games secretly average two random numbers (0–99) and compare the average with the displayed Hit. That makes displayed hit rates above 50 more reliable than shown (75 → 87.75%) and rates below 50 less likely (30 → 18.3%). Fates and Shadows of Valentia use a community-derived "hybrid": a single RN below 50, and a weighted (3A+B)/4 at 50 or above. Three Houses returns to 2RN according to the wiki extract.

### Cited Findings
- True hit (2RN) is the calculation that decides whether an attack lands, and it differs from the displayed Hit. Two RNs are rolled and averaged, and the attack hits if the average is below Hit. The result is that hit rates under 50 land less often than shown and rates over 50 land more often. — [Fire Emblem Wiki: True hit](https://fireemblemwiki.org/wiki/True_hit) [search extract]
- The wiki's 2RN table gives displayed 50 → 50.50 and displayed 90 → 98.10. — [Fire Emblem Wiki: True hit](https://fireemblemwiki.org/wiki/True_hit) [search extract]. My computation below reproduces both values exactly, which confirms the formula reading.
- Which games use it: the Fire Emblem Wiki says true hit was absent in Fates and Shadows of Valentia, which use a "hybrid" between 1RN and 2RN, and that it returned in Three Houses. — [Fire Emblem Wiki: True hit](https://fireemblemwiki.org/wiki/True_hit) [search extract]. The Fandom wiki says every game "starting from Fire Emblem: The Binding Blade" generates two numbers for hit. — [Fire Emblem Fandom: Random Number Generator](https://fireemblem.fandom.com/wiki/Random_Number_Generator) [search extract]. These **conflict on Fates/SoV**, and the more specific Fire Emblem Wiki account is the more plausible one. Engage is also described as a 1RN/2RN hybrid in one source. — [search result set](https://fireemblemwiki.org/wiki/True_hit) [search extract; the source for the Engage claim is unclear]
- Fates hybrid, community-derived: below 50, one RN is used, so displayed equals actual ("a 10% Hit rate attack hits 10% of the time"). At 50 or above, a Tumblr analysis proposed (3A+B)/4 as "our best predictor", not a confirmed result, and said classic 2RN is "dead with high confidence". — [The Humble Grandmasters: "How Fates Handles Hit Rates"](https://fire-emblem-strategy.tumblr.com/post/143452625727/how-fates-handles-hit-rates) [search extract]. An RPGDL forum post says the formula was confirmed for hit values above 50% by the same testing, and gives examples of "90 Hit is ~95% and 75 Hit is ~80%" in Fates against about 98% and 88% under 2RN. — [RPG Duelling League forum](https://www.rpgdl.com/forums/index.php?topic=6788.0) [search extract]
- 2RN has only ever applied to hit, never to critical hits or skill procs. — [GameFAQs Fates board](https://gamefaqs.gamespot.com/boards/114533-fire-emblem-fates-conquest/74198294) [search extract]
- Commentary cites 2RN as a deliberate "lie about probability": displayed 90 is really about 98, and nominal 30 is about 18. — [diplograph.net: "lie about probability"](https://diplograph.net/notes/games/randomness/lie-about-probability) [search extract]

### Inferences
- [computed] Displayed Hit against actual chance, with RNs as integers 0–99. 2RN hits when (a+b)/2 < H. Fates hits when 3a+b < 4H for H ≥ 50, and uses 1RN below 50.

  | Displayed | 1RN | 2RN (true hit) | Fates hybrid |
  |---|---|---|---|
  | 10 | 10 | 2.10 | 10 |
  | 20 | 20 | 8.20 | 20 |
  | 30 | 30 | 18.30 | 30 |
  | 40 | 40 | 32.40 | 40 |
  | 50 | 50 | 50.50 | 50.50 |
  | 60 | 60 | 68.40 | 63.83 |
  | 65 | 65 | 75.85 | 70.50 |
  | 70 | 70 | 82.30 | 77.17 |
  | 75 | 75 | **87.75** | 83.83 |
  | 80 | 80 | 92.20 | 89.73 |
  | 85 | 85 | 95.65 | 94.30 |
  | 90 | 90 | 98.10 | 97.53 |
  | 95 | 95 | 99.55 | 99.43 |

  My (3A+B)/4 values (75 → 83.8, 90 → 97.5) are higher than the forum's rough "~80 / ~95". The forum figures may be loose approximations, or a different rounding rule. Treat the Fates column as model-dependent.
- Relevance to 5e: a typical level-1 5e attack hits about 55–70% of the time, which is the band where 2RN adds the most (+10 to +13 points). A d20 version of "2RN" is rolling 2d20 and averaging (or rolling 2d10 for a bell curve), which pulls results toward the middle. This is analogous, not documented.
- Fire Emblem's design shows a "dishonest" display that players broadly accept, because it errs in the player's favor on good odds. The cost is that low-odds enemy attacks hit less often than shown, so dodging feels more reliable.

### Gaps
- I could not open Serenes Forest or the Fire Emblem Wiki directly, so I have no full per-game list of 1RN and 2RN titles. **(Unverified, from memory:)** 1RN in the early Famicom/SNES games, 2RN from The Binding Blade (GBA) through Radiant Dawn and Awakening.
- I found no official Intelligent Systems statement of the formula. Everything is community reverse engineering.
- Engage's exact system was not confirmed.

## 3. Sid Meier's GDC 2010 keynote: "The Psychology of Game Design (Everything You Know Is Wrong)"

### Takeaway
Meier used Civilization Revolution's combat to argue that players don't judge odds mathematically. They expect to win favorable fights almost every time, and they treat "big numbers" (20 vs 10) as more decisive than the same ratio in small numbers (2 vs 1). Firaxis responded by tilting the odds toward the player.

### Cited Findings
- Playtesters were thrilled to win at 3-to-1 odds and didn't question winning at 1-to-3. Losing at 2-to-1 was accepted, but losing at 20-to-10 upset them. "To Sid (and math) there's no difference between 20-to-10 and 2-to-1." — [Game Informer: "Sid Meier: Gamers Aren't Logical" (12 Mar 2010)](https://gameinformer.com/b/news/archive/2010/03/12/sid-meier-gamers-arent-logical) [search extract]
- A blog recap says Meier gave the humorous Civ Rev example of a player complaining after losing at 3-to-1 odds in his favor, while players didn't complain when they won at 3-to-1 against. They accepted a loss at 2-to-1 but not at 20-to-10, and "the game needed to be changed to compensate in order to maintain a suspension of disbelief". — [GameDev.net: "The Psychology of Game Design – Sid Meier"](https://gamedev.net/blogs/entry/2111213-the-psychology-of-game-design-sid-meier) [search extract]
- "Players expect to win battles at rates far greater than the odds they face and therefore are disappointed if they don't ultimately win every game." — [The Strong Museum of Play: "GDC 2010: Game Psychology 101"](https://www.museumofplay.org/blog/gdc-2010-game-psychology-101/) [search extract]
- Mechanics as reported by The A.V. Club: in a 3-to-1 matchup the computer won about 25% of the time, testers disliked that, and the team then adjusted outcomes toward the expected result. — [A.V. Club: "AVC at GDC '10, Day Four"](https://avclub.com/avc-at-gdc-10-day-four-spy-party-1798219468) [search extract; second-hand paraphrase]
- "Designers tilt the odds toward the player regardless of the true mathematical odds for battles." — [GamesBeat: "Game guru Sid Meier explains decades of second-guessing egomaniacal gamers"](https://gamesbeat.com/game-guru-sid-meier-explains-decades-of-second-guessing-egomaniacal-gamers/) [search extract]
- VentureBeat's quote roundup records Meier's "winner paradox": players rarely lose in games, and when they do they complain that the game is broken or the AI is cheating. — [VentureBeat: "Quotes from Sid Meier's keynote GDC speech"](https://venturebeat.com/2010/03/12/quotes-from-sid-meiers-keynote-gdc-speech) [search extract]
- The pre-show announcement said Meier would argue that the driving force of a game's design should be the psychology of the player. — [CGW press release](https://www.cgw.com/Press-Center/News/2010/Legendary-Developer-Sid-Meier-To-Present-Keynote.aspx) [search extract]
- Other recaps: [Game Developer: "GDC: Sid Meier's Lessons On Gamer Psychology"](https://www.gamedeveloper.com/game-platforms/gdc-sid-meier-s-lessons-on-gamer-psychology); [Engadget](https://www.engadget.com/2010-03-14-sid-meier-talks-player-psychology-and-the-year-of-civilization.html); [CivFanatics wrap-up](https://forums.civfanatics.com/threads/gdc-wrapup-of-sid-meiers-keynote.357409) (titles seen in search only)

### Inferences
- Meier's "big numbers" point matters for a 5e bot. A display like "+7 vs AC 12" or "hit on 5+" can make a miss feel outrageous even at a 20% miss chance. How odds are shown shapes how unfair a miss feels.
- Recaps agree on the response (tilting odds toward the player) but don't give an exact Civ Rev formula.

### Gaps
- No transcript or GDC Vault video was reachable, and recaps differ on details (3:1 vs 1:3 wording).
- **(Unverified, from memory:)** Meier is widely reported to have said that Civ Rev also carried earlier lost battles into later odds, so a string of unlikely losses made the next battle more favorable. I did not find this in any extract.
- I found no published formula for Civ Rev's adjusted combat.

## 4. Pity timers, bad-luck protection, pseudo-random distribution (PRD) and shuffle bags

### Takeaway
The common pattern is to make "failure so far" raise the next success chance, or to draw outcomes from a finite bag, so long droughts become rare or impossible while long-run rates stay at the stated value. Documented examples:
- Warcraft III / Dota 2 PRD: chance grows linearly with each failure.
- Hearthstone: hard pity at 10 packs for an Epic and 40 for a Legendary, officially published.
- WoW Legion legendaries: chance grows with each eligible activity that doesn't drop one.
- Tetris "7-bag": at most 12 pieces between two I pieces.

### Cited Findings

**Pseudo-random distribution (Warcraft III → Dota 2)**
- Formula: P(proc on attempt N | no proc on attempts 1..N−1) = C · N. The constant C is lower than the listed chance, rises by C with each failure, and resets after a proc. The proc is guaranteed once C·N ≥ 1. — [Liquipedia Dota 2: Random Distribution](https://liquipedia.net/dota2/Random_Number_Generation) [search extract]
- Example: Skull Basher's Bash (25% nominal) has about an 8.5% chance on the first attack, and "each subsequent attack without a bash increases the probability by ~8.5%". — [Liquipedia](https://liquipedia.net/dota2/Random_Number_Generation); [Dota 2 Fandom: Pseudo-random distribution](https://dota2.fandom.com/wiki/Pseudo-random_distribution) [search extract]
- The mechanic originated in Warcraft III, and the WC3 engine encodes incorrect C values at higher levels. — [diplograph.net: "The Dota 2 Pseudo-Random Distribution Creates Semi-Consistent Effects"](https://diplograph.net/notes/games/randomness/dota-2-prd) [search extract]
- Valve's workshop scripting exposes PRD constants. — [Valve Developer Wiki: Dota 2 Workshop Tools / Scripting / Constants](https://developer.valvesoftware.com/wiki/Zh/Dota_2_Workshop_Tools/Scripting/Constants) [title seen in search only]
- A design essay's example: under true randomness, a 20% crit missing ten times in a row has about an 11% chance (0.8¹⁰ ≈ 10.7%), and PRD removes such droughts. — [davideaversa.it](https://www.davideaversa.it/blog/randomness-pcg-is-about-result/) or a related search result [search extract; exact page unclear]

**Hearthstone pack pity timer**
- Blizzard officially published exact pity timers on March 14, 2023. For normal packs: a Legendary within 40 packs, an Epic within 10. Golden Legendary and Signature Legendary timers are 361 packs, and Golden Epic is 142. In expansion Golden packs, Legendary is 40 and Epic is 10, with a "first pity timer" of 10 packs for golden legendaries. Each expansion's packs have their own counter. — [Hearthstone Wiki (wiki.gg): Card packs](https://hearthstone.wiki.gg/wiki/Card_packs); [Card pack statistics / Pity timer](https://hearthstone.wiki.gg/wiki/Card_pack_statistics); [esports.gg: Hearthstone pity timer](https://esports.gg/news/hearthstone/hearthstone-pity-timer/) [search extract]
- Starting with Knights of the Frozen Throne (2017), Blizzard guaranteed at least one Legendary in a player's first 10 packs of a new set. — [Hearthstone Wiki: Card packs (historical notes)](https://hearthstone.wiki.gg/wiki/Card_packs) [search extract; snippet truncated]
- Before Blizzard published the timers, players found them through crowd-sourced pack data. — [r/hearthstone analysis (mirror), Jan 2016](https://reddit.rtrace.io/r/hearthstone/comments/3zaeou/pity_timer_on_packs_opening_analysiskinda_proofed) [title seen in search]

**World of Warcraft: Legion legendary bad-luck protection**
- A community manager said that fixed-rate gear, mounts and pets keep a constant drop chance, but for Legion legendaries, "if you play content where Legendaries can drop and do not receive one, your chance continues to increase". He compared it to a weighted die. Time played (/played) and item level have no effect. Game director Ion Hazzikostas had earlier denied the protection, and patch 7.1 CM posts confirmed it. A soft cap at 4 legendaries reset the chance to the base value. It was later removed. — [Mein-MMO (EN): "WoW Legion bad luck protection legendary"](https://mein-mmo.de/en/wow-legion-bad-luck-protection-legendary,125904); [PCGamesN: "WoW Legion legendary soft cap removed"](https://pcgamesn.com/world-of-warcraft/wow-legion-legendary-soft-cap-removed) [search extract]. No exact percentages were published in these sources.

**Shuffle bags: the Tetris "Random Generator" (7-bag)**
- Each "bag" holds all seven tetrominoes (I, J, L, O, S, T, Z) in random order. The game deals the whole bag before generating the next one. As a result there can be "no more than 12 tetrominoes between one I piece and the next", and S/Z runs are capped at 4. Variants exist: an 8-bag in the Japanese Tetris Online beta, and Tetris The Grand Master Ace always opens with I, J, L or T. — [Tetris Wiki: Random Generator / Bag](https://tetris.wiki/Bag); [Tetris Fandom wiki](https://tetris.fandom.com/wiki/Random_Generator?oldid=8298) [search extract]

**Hidden "mercy" tuning disclosed by developers (related)**
- Jennifer Scheurle's Sept 2017 Twitter thread, collecting hidden mechanics for a talk: "Assassin's Creed and Doom value the last bit of health as more hit points than the rest of it to encourage a feeling of JUST surviving." Other examples in the thread came from Serious Sam, Mini Metro and others. Player reactions were mixed, from delight to "cheating". — [Destructoid: "I love the way you lie"](https://www.destructoid.com/devs-reveal-how-they-trick-us-in-epic-twitter-thread/); [PC Gamer](https://www.pcgamer.com/au/developers-share-their-hidden-mechanics-on-twitter); [Game Developer: "Behind the curtain: uncovering secret hidden game mechanics"](https://gamedeveloper.com/design/behind-the-curtain-uncovering-secret-hidden-game-mechanics) [search extract]

### Inferences
- [computed] PRD constants. I solved for C so that the long-run proc rate equals the nominal rate. "Max attempts" is the attempt at which a proc is guaranteed, ⌈1/C⌉.

  | Nominal | C | Max attempts |
  |---|---|---|
  | 5% | 0.00380 | 264 |
  | 10% | 0.01475 | 68 |
  | 15% | 0.03222 | 32 |
  | 20% | 0.05570 | 18 |
  | 25% | 0.08474 | 12 |
  | 30% | 0.11895 | 9 |
  | 35% | 0.15798 | 7 |
  | 40% | 0.20155 | 5 |
  | 50% | 0.30210 | 4 |
  | 60% | 0.42265 | 3 |
  | 65% | 0.48113 | 3 |
  | 70% | 0.57143 | 2 |
  | 75% | 0.66667 | 2 |

  The 25% row matches Liquipedia's "~8.5%". Applied to a 5e-style **hit** chance of 65%, PRD gives a 48.1% first-attack chance. That climbs to 96.2% after one miss, and a hit is guaranteed on the third attempt, so **at most two misses in a row** with no change to the long-run 65% rate. One drawback: first attacks hit less often than the displayed 65%.
- [computed] 7-bag simulation over 1.4M pieces: the maximum gap between I pieces is 12 and the maximum S/Z run is 4, which matches the wiki.
- Shuffle-bag version for d20: a "deck" of 20 cards numbered 1–20, drawn without replacement per character or per party, reshuffled when empty. Over each 20 draws the results are exactly flat. This is analogous, not documented in a game I verified.
- These systems differ in **visibility**. PRD and XCOM aim assist are hidden. Hearthstone's timers were hidden until Blizzard published them in 2023. The 7-bag is semi-visible through the piece preview. Fire Emblem's display openly misstates the real odds.

### Gaps
- I could not open Liquipedia or the Dota 2 wiki to copy their official C table, so mine is computed. I believe it matches the widely circulated table: 0.084744 for 25%, 0.302103 for 50% **(from memory, consistent with my computation)**.
- No Blizzard primary post for the 2023 pity timers was opened. The figures are via the wiki extract.
- No exact WoW Legion drop percentages were found.

## 5. Player psychology: misperceiving randomness, streaks and frustration

### Takeaway
There is solid general research that people misjudge short random sequences. They expect them to look "representative" and alternate more than real randomness does (gambler's fallacy and hot-hand beliefs). That holds even among people who say they understand the fallacy, and it applies to adults about as much as children. Game-specific empirical work on frustration from failure streaks is thin. What exists is mostly developer testimony (Meier, Firaxis, Blizzard) plus dynamic-difficulty research such as Hunicke's Hamlet, which reduced deaths without players noticing.

### Cited Findings
- Gilovich, Vallone & Tversky (1985), "The Hot Hand in Basketball: On the Misperception of Random Sequences" (*Cognitive Psychology*): 76ers and Celtics shooting records plus a controlled Cornell experiment found no positive correlation between successive shots. They attributed the belief in streaks to the misconception that short random sequences should closely resemble their generating process. Earlier outcomes changed players' **predictions** but not their **performance**. — [Gilovich, Vallone & Tversky PDF (CU Boulder course reading)](https://home.cs.colorado.edu/~mozer/Teaching/syllabi/7782/readings/gilovich%20vallone%20tversky.pdf); [CAUSEweb summary](https://causeweb.org/cause/node/5621) [search extract]
- Miller & Sanjurjo later found a small-sample bias in the original analysis, and their reanalysis finds a hot hand in GVT's own data, so the "fallacy" conclusion is now contested. — [Bocconi University: "Do it again: proof the hot hand exists"](https://www.unibocconi.it/en/news/do-it-again-proof-hot-hand-exists); [Wikipedia: Hot hand](https://en.wikipedia.org/wiki/Hot_hand) [search extract]
- A review of randomness perception: people "over-alternate" when producing random binary sequences and judge higher-alternation sequences as "more random". In Gold & Hester's coin experiments, preferences changed when the coin was swapped or "rested", which they read as subjects believing random devices "intentionally monitor" their own output. The bias held even among subjects who said they understood the fallacy. — [ResearchGate: "The Perception of Randomness" (review)](https://www.researchgate.net/publication/223161247_The_Perception_of_Randomness); [PMC: "Who 'Believes' in the Gambler's Fallacy and Why?"](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5215234/) [search extract; the extract merged these two sources]
- Belief and behavior come apart: in a gambler's-fallacy replication, people's stated probability of a red ball was close to 50%, yet their next-draw predictions still showed the fallacy. — [Skeptical Inquirer: "A Closer Look at the Gambler's Fallacy and the Hot Hand"](https://skepticalinquirer.org/exclusive/a-closer-look-at-the-gamblers-fallacy-and-the-hot-hand/) [search extract; secondary summary]
- **Children (relevant to ages 8+):** Batista, Borba & Henriques (2022), "Fairness in games: a study on children's and adults' understanding of probability", *Statistics Education Research Journal* 21(1), doi:10.52041/serj.v21i1.79. Using clinical interviews built around games of chance, they found that fairness judgments depended on understanding independence, sample space and proportional comparison, with misunderstandings in all three. Adults did about as poorly as children. — [SERJ article page](https://iase-web.org/ojs/SERJ/article/view/79) [search extract, abstract only]. A related study of 30 children averaging 11 years old found they could spot a game made unfair by biased randomizers, but misunderstood independence and could not justify comparisons across different sample spaces. — [Batista 2021 (Portuguese), funes.uniandes.edu.co PDF](https://funes.uniandes.edu.co/wp-content/uploads/tainacan-items/32454/1202823/Batista2021Compreens25C325B5es.pdf) [search extract; the link to the SERJ study is unconfirmed]
- Dynamic difficulty adjustment: Hunicke & Chapman's **Hamlet** (Half-Life engine) used inventory theory to adjust supply and demand during play. It changed NPC accuracy and damage reactively, and NPC health and damage proactively, to stop players getting stuck in repeated deaths or long struggles. One later paper reports a 20-subject study in which mean deaths in the first 15 minutes fell from 6.4 to 4, and players did not notice the adjustments. — [Hunicke, Hamlet paper (Northwestern)](https://users.cs.northwestern.edu/~hunicke/pubs/Hamlet.pdf) (title only); [Colwell's Castle Defence, arXiv 1806.04471](https://arxiv.org/pdf/1806.04471) [search extract; secondary account, original not opened]. Hunicke's related paper is "The Case for Dynamic Difficulty Adjustment in Games" (ACM SIGCHI ACE 2005, Valencia). — [Hunicke vitae](https://users.cs.northwestern.edu/~hunicke/vitae.html) [search extract]
- Designer and critic commentary:
  - Players have "won with a 20% shot, or missed with a 98% chance to hit". The author argues Darkest Dungeon's UI shows hit chance without explaining what drives it. — [Game Developer blog: "Probability Problems in Game Design"](https://www.gamedeveloper.com/design/probability-problems-in-game-design) [search extract]
  - XCOM showing explicit percentages helps players accept failures, while hidden odds (Darkest Dungeon) risk making players feel "frustrated and powerless". — [yu.edu piece](https://www.yu.edu/node/27633) [search extract; the extract called it "Yale", but the domain is Yeshiva University. Opinion, not data]
  - A magazine column on XCOM: "fully understanding the odds does nothing to mitigate the sense of raw outrage when the shot goes wide." — [Edge via PressReader (10 Feb 2016)](https://www.pressreader.com/australia/edge/20160210/282205124924832) [search extract]
  - A blog post reports that Sid Meier and Rob Pardo both described players consistently misunderstanding, and being frustrated by, randomness. — [gamedesignadvance.com: "The Truth in Game Design"](https://gamedesignadvance.com/?p=2084) [search extract; original talks not verified]
  - Players on Steam keep reporting that "percent to hit is a lie" in XCOM 2. — [Steam: "percent to hit is a lie"](https://steamcommunity.com/app/268500/discussions/0/2217311444329559360/?ctp=2); [Steam: "Does this game lie to you?"](https://steamcommunity.com/app/268500/discussions/0/412447331648115461/) [titles seen in search]

### Inferences
- [computed] How often unmodified d20 play produces streaks. P(at least one run of k or more consecutive misses within n attacks):

  | Hit chance | 3+ misses in 10 attacks | 3+ in 20 | 4+ in 20 | 3+ in 40 | 5+ in 40 |
  |---|---|---|---|---|---|
  | 50% | 50.8% | 78.7% | 47.8% | 96.0% | 46.8% |
  | 55% | 40.9% | 68.3% | 35.8% | 90.9% | 32.6% |
  | 60% | 31.4% | 56.2% | 25.1% | 82.2% | 20.8% |
  | 65% | 22.9% | 43.5% | 16.3% | 69.6% | 11.9% |
  | 70% | 15.5% | 31.0% | 9.6% | 54.0% | 6.1% |

  At typical 5e low-level hit rates (about 55–65%), most players will see a run of 3 or more straight misses within one or two sessions. "Attack after attack fails" is the expected experience, not a bug, and Meier's and Gold & Hester's findings predict players will read it as unfair.
- The evidence supports a few principles:
  1. Cap the maximum drought (PRD, pity timers, XCOM's miss-streak bonus).
  2. Bias toward the player on good odds (Fire Emblem 2RN above 50; Civ Rev).
  3. Keep the long-run rate honest where players can check it (PRD and bags preserve averages; Hearthstone published its timers).
  4. Apply mercy on easier modes or for younger audiences (XCOM aim assist exists only on Easy/Normal).
  5. Make the help strongest when the player is losing (XCOM's soldiers-lost bonus, Hamlet).
- Because adults reason about chance about as badly as children (Batista et al.), explaining probability to an 8+ audience is unlikely to remove the sense of unfairness. Structural streak-breaking is more reliable than education.

### Gaps
- I found **no peer-reviewed study that directly measures player frustration from miss streaks**, or perceived fairness of displayed hit percentages, in video games. Searches returned general psychology, patents and design blogs.
- I found no published study of how children react to hidden or adjusted odds in games.
- The Tversky & Kahneman (1971) "Belief in the law of small numbers" paper and Gold & Hester's originals were not retrieved, so their findings are known here only through the review extract.
- Loss aversion research specific to game combat was not found. The general framing (losses weigh more than equivalent gains; Kahneman & Tversky prospect theory) is **unverified here, from memory**.
