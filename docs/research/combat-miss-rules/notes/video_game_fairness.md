# How Video Games Make Random Hit/Miss Outcomes Feel Fair

> **Source-access note (read first).** Two passes went into this file.
> - **Pass 1** ran with almost every site blocked. Its only opened sources were XCOM 2 game scripts on GitHub. Everything else came from search excerpts.
> - **Pass 2** (2026-10-16) had open network access. It re-checked every section against opened pages, papers, game config files and a talk transcript. Unless a finding says otherwise, **every [opened] source was accessed on 2026-10-16.**
>
> Labels:
> - **[opened]**: I read the page, file, paper or transcript myself.
> - **[search extract]**: the fact appeared only in a search engine's extract or summary. Treat it as "seen in an excerpt", not "read in full".
> - **[computed]**: math I worked out from a cited formula. These are derivations you can check, not sourced claims.
> - **(unverified, from memory)**: not sourced at all.
>
> **Hosts that were blocked or awkward in pass 2, and the workaround used:**
> - `liquipedia.net` web pages returned 403. Its MediaWiki API (`api.php?action=parse`) worked.
> - The Blizzard support article redirects to a Battle.net login. I read the Wayback Machine snapshot instead.
> - `pmc.ncbi.nlm.nih.gov` showed a bot-check page. I read the abstract through the Europe PMC REST API.
> - These hosts returned 403 and had no workaround: `dl.acm.org`, `icy-veins.com`, and `serenesforest.net`'s sister pages beyond the true-hit page.
> - The SERJ journal moved from `iase-web.org` to `iase-pub.org`. The DOI resolves to the new host.
> - The CU Boulder copy of Gilovich et al. failed TLS verification in WebFetch. I downloaded it with certificate checking turned off. It is the scanned journal article.
> - YouTube's own caption URLs returned nothing. I read the GDC talk's auto-generated English captions with the `youtube-transcript-api` package. Auto-captions contain transcription errors, so the quotes below are lightly cleaned.

## 1. XCOM: Enemy Unknown / XCOM 2 "aim assist" (hidden miss-streak bonus)

### Takeaway
Both XCOM games secretly favour the player after misses. In XCOM 2 the shipped config enables it on **three of four difficulties: Rookie, Veteran and Commander**. Only Legend has it off, which contradicts the code comment that says "Easy & Normal" only.

How it works: when an XCOM shot with a displayed chance of at least 50% misses, the game checks the same roll again against a boosted chance. The boosted chance is base × a multiplier, plus a bonus for each earlier qualifying miss this turn, plus a bonus for each soldier lost, capped at 95%. The shipped values are +10 per miss on Rookie and Veteran, +15 on Commander, and 0 on Legend. On the two easiest settings, enemy hit streaks are also damped. The UI keeps showing the unmodified number.

For Enemy Unknown, a Firaxis designer confirmed a "bad streak breaker" on Easy and Normal only. Jake Solomon gave the reason in 2016: misses at 85% "feel punitive".

### Cited Findings

**XCOM 2 / War of the Chosen: shipped values, from DefaultGameCore.ini [opened]**
- Two mirrors of the shipped config agree value for value: the base game ini (`XComGame/Config/DefaultGameCore.ini`) and the War of the Chosen ini (`XCom2-WarOfTheChosen/XComGame/Config/DefaultGameCore.ini`). Both come from a copy of a `steamapps/common/XCOM 2/` install, committed 2021-02-03. A third copy, `russgray/xcom2-config`, matches too.
  - Sources: [base ini](https://raw.githubusercontent.com/daakru/x2wotc-common-configs/master/XComGame/Config/DefaultGameCore.ini), [WotC ini](https://raw.githubusercontent.com/daakru/x2wotc-common-configs/master/XCom2-WarOfTheChosen/XComGame/Config/DefaultGameCore.ini), [russgray copy](https://raw.githubusercontent.com/russgray/xcom2-config/master/XComGameCore.ini)
- The `; Aim Assist` block, section `[XComGame.X2AbilityToHitCalc_StandardAim]`, sets three global values: `NormalSquadSize=4`, `ReasonableShotMinimumToEnableAimAssist=50`, `MaxAimAssistScore=95`.
- Per-difficulty values (the base game writes them as `AimAssistDifficulties[i]` structs, and WotC as repeated keys under `; Rookie`, `; Veteran` and so on):

  | Key | Rookie | Veteran | Commander | Legend |
  |---|---|---|---|---|
  | BaseXComHitChanceModifier (×) | 1.2 | 1.1 | 1.0 | 1.0 |
  | MissStreakChanceAdjustment (+ per prior qualifying miss) | 10 | 10 | **15** | 0 |
  | HitStreakChanceAdjustment (alien, per prior alien hit) | −10 | 0 | 0 | 0 |
  | SoldiersLostXComHitChanceAdjustment (per soldier below 4) | 15 | 10 | 0 | 0 |
  | SoldiersLostAlienHitChanceAdjustment (per soldier below 4) | −10 | −10 | 0 | 0 |

  WotC adds `AlienVsTheLostHitChanceAdjustment` and `TheLostVsAlienHitChanceAdjustment`, both 0 on every difficulty.
- **The pass-1 conflict, resolved.** The 2020 Steam forum quote (10 / 10 / 15 / 0) was correct.
  - The "+20", "1.2", "15", "−10" and "−25" in the script are `//` comments placed beside the code. They are not the shipped values. Rookie's multiplier (1.2) and alien hit-streak value (−10) happen to match. The miss-streak (20) and alien soldiers-lost (−25) comments do not.
  - The declaration comments ("only applied in Easy & Normal Difficulty") are also stale. The code applies whatever the array holds for the current difficulty, with no difficulty check, and the shipped Commander entry is +15.
  - The 2016 Steam claim of "+15% after a miss including on Commander" was right about Commander.
- Graze damage multiplier: `[XComGame.X2Effect_ApplyWeaponDamage] GRAZE_DMG_MULT=0.5f`. — same files [opened]

**XCOM 2: mechanism, from the vanilla game script source [opened]**
- I read the Firaxis SDK originals (`Firaxis/XCOM/SrcOrig/...` in `daakru/xcom2-wotc-modding`). They match the Community Highlander copy used in pass 1, minus the Highlander's additions.
  - [X2AbilityToHitCalc_StandardAim.uc](https://raw.githubusercontent.com/daakru/xcom2-wotc-modding/master/Firaxis/XCOM/SrcOrig/XComGame/Classes/X2AbilityToHitCalc_StandardAim.uc)
  - [XComGameStateContext_Ability.uc](https://raw.githubusercontent.com/daakru/xcom2-wotc-modding/master/Firaxis/XCOM/SrcOrig/XComGame/Classes/XComGameStateContext_Ability.uc)
  - [Globals.uci](https://raw.githubusercontent.com/daakru/xcom2-wotc-modding/master/Firaxis/XCOM/SrcOrig/Core/Globals.uci)
- The roll:
  - The game draws `RandRoll = SYNC_RAND_TYPED(100)` and walks the result table (crit, hit, graze, then miss).
  - If an XCOM shot's result is a miss, it computes `GetModifiedHitChanceForCurrentDifficulty` and checks `if( RandRoll < ModifiedHitChance )`. A pass turns the miss into `eHit_Success` and logs "AIM ASSIST forcing an XCom MISS to become a HIT!".
  - The alien side mirrors this: an alien or Lost hit with `RandRoll >= ModifiedHitChance` becomes a miss.
  - Reaction fire and guaranteed hits are exempt.
- Difficulty indexing: the values are read through `` `ScaleTacticalArrayInt `` / `` `ScaleTacticalArrayFloat ``. These macros call native `XComGameState_CampaignSettings.ScaleArray…ValueForTacticalDifficulty`. Nothing in the function limits them to Easy or Normal.
- The ×multiplier applies to every XCOM shot. The miss-streak and soldiers-lost bonuses apply only when `BaseHitChance >= 50`. The alien adjustment applies only when living XCOM soldiers ≤ `NormalSquadSize` (4). The result is clamped to 0–95.
- Streak bookkeeping: a hit resets `MissStreak` and increments `HitStreak`. A miss increments `MissStreak` only if `CalculatedHitChance >= ReasonableShotMinimumToEnableAimAssist`, and resets `HitStreak`. The counters live on the player (team) state and reset at the start of each player turn (pass 1, `X2TacticalGameRuleset.uc`).
- Presentation: the combat log prints the modified chance only when aim assist changed the result (`bModHitRoll ? ModifiedHitChance : HitChance`). The shot HUD shows the unmodified chance from `GetHitChance`.

**XCOM: Enemy Unknown / Enemy Within (2012/2013) [opened]**
- PCGamesN, "The secret dice rolls of XCOM: Enemy Within. How Firaxis fudge the numbers", Steve Hogarty, 15 Oct 2013 ([pcgamesn.com](https://www.pcgamesn.com/secret-dice-rolls-xcom-enemy-within)). The article spells the designer's name "Anand Gupta" and calls him lead game designer.
  - "On Normal and Easy modes, there's a bad streak breaker." "It's stronger on easy."
  - "On Easy, it's very hard to actually lose soldiers, and the fewer soldiers you have the stronger this effect becomes."
  - On Classic or higher "this effect doesn't exist."
  - Enemy Within adds a "Save Scum" option that "resets the random number seed whenever the game is loaded."
- GameBanshee's repost (17 Oct 2013) credits PCGamesN and carries more of the quote ([gamebanshee.com](https://www.gamebanshee.com/news/112504-xcom-enemy-within-adds-qsave-scumq-option.html)) [opened]. It adds that the aliens also have weaker stats on Easy and Normal, and the example: on Easy, "if you miss three times in a row you're not going to miss your fourth shot," even at "a 1% chance to hit".

**Developer framing [opened]**
- Jake Solomon, in "Jake Solomon explains the careful use of randomness in XCOM 2", Game Developer, 1 Mar 2016 ([gamedeveloper.com](https://www.gamedeveloper.com/design/jake-solomon-explains-the-careful-use-of-randomness-in-i-xcom-2-i-)):
  - "If you see an 85 percent chance to hit, you're not looking at that as a 15 percent chance of missing."
  - Players read the number "from an emotional sense".
  - "There's actually a number of things that tweak that number in the player's favor at the lower difficulty settings." "That 85 percent isn't actually 85 percent."
  - "We don't want the players missing multiple 85 percent shots, because then the game starts to feel punitive."

**Pass-1 items not re-opened (still [search extract])**
- A community account of EU's Normal/Easy bonus: +15% cumulative per qualifying miss, and ×1.2 with four or fewer soldiers. — [Steam EU discussion](https://steamcommunity.com/app/200510/discussions/0/1457328927844749318/?ctp=3)
- UFOpaedia: alien aim bonuses on EU's higher difficulties. — [Aim (EU2012)](https://temp.ufopaedia.org/Aim_(EU2012))
- Solomon on EU's seeded results ("probably should have" offered an option). — [Softpedia](https://games.softpedia.com/blog/Lead-XCOM-Designer-Regrets-Fixed-Hit-Chance-Results-319573.shtml)
- Designer Notes podcast ep. 81 lists "why 75% does not mean 75%". — [designer-notes.com](https://www.designer-notes.com/designer-notes-81-jake-solomon-part-2/) (episode not heard)

### Inferences
- [computed] Effective XCOM 2 hit chance = max(displayed, clamp(⌊displayed × mult⌋ + misses × adj + lost × adjLost, 0, 95)). Only misses are re-checked, against the same roll. Values below are with no soldiers lost. Veteran truncates (65 × 1.1 = 71.5 → 71).

  | Difficulty | 50% shot after 0/1/2/3 prior misses | 65% shot after 0/1/2/3 | 40% shot (any) |
  |---|---|---|---|
  | Rookie (×1.2, +10) | 60 / 70 / 80 / 90 | 78 / 88 / 95 / 95 | 48 |
  | Veteran (×1.1, +10) | 55 / 65 / 75 / 85 | 71 / 81 / 91 / 95 | 44 |
  | Commander (×1.0, +15) | 50 / 65 / 80 / 95 | 65 / 80 / 95 / 95 | 40 |
  | Legend | 50 / 50 / 50 / 50 | 65 / 65 / 65 / 65 | 40 |

  The pass-1 rows that used the code comments' example values (×1.2, +20) don't describe any shipped difficulty, so they are dropped.
- Commander is the "normal" difficulty most experienced players use. It has no general multiplier but the strongest per-miss bonus. So Firaxis kept the streak breaker even where it removed the flat boost: the streak breaker is the part they treat as essential.
- Design features that carry straight over to a 5e Discord bot:
  - The bonus is per team ("consecutive misses XCom has made this turn"), not per character.
  - It applies only to "reasonable" shots (50% or more), so bad decisions aren't rescued.
  - Nothing goes above 95%.
  - The counters reset each turn.
  - It grows when the player is losing (soldiers lost).
  - It is asymmetric: player misses become hits, and only on Rookie are enemy hit streaks damped.
  - It is hidden.
- Gupta's EU "1% shot" example conflicts with XCOM 2's 50% floor. Either EU worked differently on Easy, or he was speaking loosely. EU's code was not checked.
- A d20 analogue: "after each qualifying party miss this round, the party's next attack gets +2 (or +3) until a hit, capped so nothing needs less than a 2." Commander's +15 per miss is +3 per miss on a d20. This is analogous, not documented.

### Gaps
- The scaling functions are native, so I can't see whether WotC interpolates between difficulty entries. The shipped tables use integer difficulty indices.
- EU/EW's actual values (Easy versus Normal) were not opened. They rest on one Steam guide excerpt.
- Whether a Graze counts as a "hit" for streak bookkeeping is decided by native `IsHitResultHit`, which I couldn't read.

## 2. Fire Emblem "true hit" (2RN) and the hybrid systems

### Takeaway
From The Binding Blade (FE6) through Awakening, and again in Three Houses, Fire Emblem averages two random numbers (0–99) and hits if the average is below the displayed Hit. That makes good odds better than shown (75 → 87.75%) and poor odds worse (30 → 18.3%). Fates, Shadows of Valentia and Engage use a hybrid instead:
- below 50, a single number, so the display is honest;
- at 50 or above, a sine-shaped boost that is smaller than 2RN's (75 → 85.00%).

Games up to Thracia 776 used a single number throughout. The whole system is community reverse-engineering. Intelligent Systems has not published it.

### Cited Findings
- **Serenes Forest, "True Hit"** [opened] ([serenesforest.net](https://serenesforest.net/general/true-hit/)):
  - FE1–5 use 1 RN. In the 2 RN system, "The RNs are averaged, and if the averaged value is lower than the Hit value, the attack will hit."
  - The page says this "occurs in FE6~12 (although it has not yet been directly confirmed in FE10)."
  - Its full 0–100 table includes 1 → 0.03, 10 → 2.10, 20 → 8.20, 50 → 50.50, 70 → 82.30, 90 → 98.10, 99 → 99.99.
  - Rationale: it "encourages low Hits missing and encourages high Hits hitting". Player units usually have high Hit and enemies low, so the system favours the player.
  - The page does not cover Fates or later games.
- **Fire Emblem Wiki, "True hit"** [opened] ([fireemblemwiki.org](https://fireemblemwiki.org/wiki/True_hit)):
  - "All games up to Thracia 776 do not use true hit."
  - 2RN runs from The Binding Blade through Awakening, is absent in Fates and Shadows of Valentia, and returns in Three Houses. The Three Houses evidence is a Reddit analysis by u/dee-ee, Sept 2019.
  - **Hybrid (Fates, Shadows of Valentia, Engage):** below 50% "the game will use the 1 RN system". At 50% or above, one RN from 0–9999 is compared with `Hit×100 + (40/3)·Hit·sin((0.02·Hit − 1)·180°)`. The constant is 13.333 in Fates and SoV, and 13.33333 in Engage. The Engage formula is sourced to a @DeathChaos25 tweet (Jan 2023), and the 13.33333 is marked "citation needed".
  - The wiki's hybrid table: 60 → 64.70, 65 → 72.01, 70 → 78.87, 75 → 85.00, 80 → 90.14, 85 → 94.16, 90 → 97.05, 95 → 98.91, 99 → 99.82. Its 2RN values are cited to Serenes Forest.
  - It also notes a Binding Blade RNG quirk that lets a displayed 100% miss.
- The pass-1 Fates model "(3A+B)/4" from a 2016 Tumblr analysis is **superseded**. The wiki doesn't mention it, and its values differ (75 → 83.8 against the wiki's 85.00). — [Humble Grandmasters](https://fire-emblem-strategy.tumblr.com/post/143452625727/how-fates-handles-hit-rates) [search extract]
- 2RN has only ever applied to hit, never to crits or skill procs. — [GameFAQs](https://gamefaqs.gamespot.com/boards/114533-fire-emblem-fates-conquest/74198294) [search extract]

### Inferences
- [computed] Displayed Hit against actual chance. 2RN hits when (a+b)/2 < H, with a and b integers 0–99. The hybrid column uses the wiki's formula, and my values reproduce the wiki's table to ±0.01.

  | Displayed | 1RN | 2RN (true hit) | Hybrid (Fates/SoV/Engage) |
  |---|---|---|---|
  | 10 | 10 | 2.10 | 10 |
  | 30 | 30 | 18.30 | 30 |
  | 40 | 40 | 32.40 | 40 |
  | 50 | 50 | 50.50 | 50.00 |
  | 55 | 55 | 59.95 | 57.27 |
  | 60 | 60 | 68.40 | 64.70 |
  | 65 | 65 | 75.85 | 72.01 |
  | 70 | 70 | 82.30 | 78.88 |
  | 75 | 75 | **87.75** | 85.00 |
  | 80 | 80 | 92.20 | 90.14 |
  | 85 | 85 | 95.65 | 94.17 |
  | 90 | 90 | 98.10 | 97.05 |
  | 95 | 95 | 99.55 | 98.91 |
- The series' own history: it kept the player-favouring lie at high odds, but later stopped deflating low odds (the hybrid is honest below 50). In Fire Emblem, low displayed odds are mostly *enemy* attacks against well-dodging player units. So 2RN made enemies miss more, and the hybrid removed that extra player benefit while keeping the boost on good player shots.
- A typical level-1 5e attack hits 55–70% of the time. That is exactly the band where 2RN adds +5 to +12 points. A d20 analogue is "roll 2d20, use the average", which pulls results toward the middle. This is analogous, not documented.

### Gaps
- No Intelligent Systems statement of any formula exists in what I opened.
- Engage's constant is marked "citation needed" on the wiki.

## 3. Sid Meier's GDC 2010 keynote: "The Psychology of Game Design (Everything You Know Is Wrong)"

### Takeaway
Meier's talk (GDC, 12 Mar 2010) describes Civilization Revolution changing its combat three times in response to playtesters:
1. **Atomic sub-battles.** Battles were broken into smaller rounds, so results come out closer to what players expect.
2. **Big numbers.** Players accepted losing at 2:1 but not at "20 to 10", so the team adjusted for large numbers.
3. **Memory of losses.** Players objected to losing two 2:1 battles in a row, so the game now "take[s] into account the results of previous battles".

Meier's stated reason is to keep suspension of disbelief: players can't see the dice, so unexplained bad results breed "paranoia". He also said players expect to win "pretty much every time" at around 3:1 or 4:1.

### Cited Findings
- **Transcript of the talk** [opened]: GDC's official upload "Sid Meier's Psychology of Game Design", [youtube.com/watch?v=MtzCLd93SyU](https://www.youtube.com/watch?v=MtzCLd93SyU), read from YouTube's auto-generated English captions. The Game Developer page that points to it: [gamedeveloper.com](https://www.gamedeveloper.com/design/video-sid-meier-s-psychology-of-game-design). Timestamps are approximate.
  - ~19:50: Civ Rev "would show you before a battle ... what the odds were". His example was 1.5 against 0.5, "a 3 to 1 battle".
  - ~21:00: a player "had this battle it was 3 to one and I lost ... three is big one is small".
  - ~21:30: "so we adjusted our system ... by actually breaking the battle up into kind of more atomic little battles to make the results come out more [like what] the player expected".
  - ~21:50: players who won at 1-to-3 felt no unfairness ("clever tactics and strategy").
  - ~22:35: "there is this point and it's kind of around 3 to 1, 4 to 1 where people do expect to pretty much win every time".
  - ~23:00–23:50: a 2:1 loss was accepted, a "20 to 10" loss was not, and "we actually adjusted".
  - ~24:16–24:40: "I had another 2 to 1 battle and I lost again ... so we actually take into account the results of previous battles uh now when we do our combat calculations".
  - ~24:50: the goal was to avoid losing "that suspension of disbelief".
  - ~30:06–30:40: "whenever anything random happens to the player ... paranoia strikes". The player will find "the most paranoid explanation". Randomness "at a really significant level" needs great care.
  - ~43:24: in Civ Rev "we actually save the random number with the save file", so reloading repeats the result.
  - ~69:35–70:30 (Q&A): the player "isn't actually rolling the dice ... they're kind of at the mercy of the designer". By making "the outcomes kind of conform to what the player's expectations were we kind of damped down this paranoia".
- Game Informer, "Sid Meier: Gamers Aren't Logical", 12 Mar 2010 [opened] ([gameinformer.com](https://gameinformer.com/b/news/archive/2010/03/12/sid-meier-gamers-arent-logical)). It reports the same 3:1, 1:3, 2:1 and 20:10 sequence: "it cannot just be a math-based system", and "To Sid (and math) there's no difference between 20-to-10 and 2-to-1". It does not mention the previous-battles adjustment.
- Game Developer, Kris Graft, "GDC: Sid Meier's Lessons On Gamer Psychology", 12 Mar 2010 [opened] ([gamedeveloper.com](https://www.gamedeveloper.com/game-platforms/gdc-sid-meier-s-lessons-on-gamer-psychology)). It quotes "Whenever something random happens to the player, paranoia sets in" and the need to make randomness "seem fair to the player so he doesn't feel cheated". It has no Civ Rev odds detail.
- Other recaps were not re-opened and remain [search extract]: [GameDev.net](https://gamedev.net/blogs/entry/2111213-the-psychology-of-game-design-sid-meier), [Strong Museum](https://www.museumofplay.org/blog/gdc-2010-game-psychology-101/), [A.V. Club](https://avclub.com/avc-at-gdc-10-day-four-spy-party-1798219468), [GamesBeat](https://gamesbeat.com/game-guru-sid-meier-explains-decades-of-second-guessing-egomaniacal-gamers/), [VentureBeat](https://venturebeat.com/2010/03/12/quotes-from-sid-meiers-keynote-gdc-speech).

### Inferences
- The pass-1 "(unverified, from memory)" claim is now **verified from the talk**: Civ Rev carried earlier lost battles into later odds. That is a cross-battle streak breaker, the same idea as XCOM's.
- Meier names two separate fixes, and both have a d20 analogue:
  - Splitting one roll into several smaller rolls lowers variance, like rolling more dice.
  - Remembering recent losses breaks streaks.
- The "20 to 10" point matters for presentation. Players read the size of the numbers, not their ratio. A display like "+7 vs AC 12" may make a miss feel more outrageous than "hit on 5+". This is an inference; the talk is about Civ Rev strength numbers.
- Meier says the help is for the player. Nothing in the talk says the AI got the same treatment.

### Gaps
- No exact Civ Rev formula is given, in the talk or in the recaps.
- The transcript is auto-generated. I checked the passages above for sense, but there may be word-level errors. GDC Vault was not checked.

## 4. Pity timers, bad-luck protection, pseudo-random distribution (PRD) and shuffle bags

### Takeaway
The common pattern is either to make "failure so far" raise the next chance of success, or to draw outcomes from a finite bag. Either way, long droughts become rare or impossible while the long-run rate stays at the stated value. Verified examples:
- Dota 2 PRD: the chance rises by C after each failure. Liquipedia gives C for each nominal rate.
- Hearthstone: Blizzard's published odds guarantee a Legendary within 40 packs and an Epic within 10. Blizzard published these in March 2023.
- WoW Legion: legendary "bad luck protection" was confirmed by a community manager and later by the game director.
- Tetris 7-bag: no more than 12 pieces between two I pieces.

### Cited Findings

**Pseudo-random distribution (Dota 2): Liquipedia "Random Distribution" [opened via API]** ([liquipedia.net/dota2/Random_Distribution](https://liquipedia.net/dota2/Random_Distribution); read through `api.php?action=parse` because the page itself returned 403)
- Formula: "P(N) = C · N". For each eligible attempt that fails, the PRD "augments the probability of the effect happening for the next instance by a constant C". C "is lower than the listed probability", and "Once the effect occurs, the counter is reset". When C·N ≥ 1 the proc is guaranteed.
- Example: Skull Basher's 25% Bash is "~8.5%" on the first attack, then ~17%, ~25.5% and so on.
- Attempts that can't trigger the effect, such as crit against buildings or while on cooldown, don't advance the counter.
- C values (Liquipedia's table, citing a gaming.stackexchange derivation):

  | Nominal | C | Nominal | C |
  |---|---|---|---|
  | 5% | 0.003802 | 50% | 0.302103 |
  | 10% | 0.014746 | 55% | 0.360398 |
  | 15% | 0.032221 | 60% | 0.422650 |
  | 20% | 0.055704 | 65% | 0.481125 |
  | 25% | 0.084744 | 70% | 0.571429 |
  | 30% | 0.118949 | 75% | 0.666667 |
  | 35% | 0.157983 | 80% | 0.750000 |
  | 40% | 0.201547 | 85% | 0.823529 |
  | 45% | 0.249307 | 90% / 95% | 0.888889 / 0.947368 |

  These match the pass-1 computed constants to every digit given.
- The Warcraft III origin claim stays [search extract]. — [diplograph.net](https://diplograph.net/notes/games/randomness/dota-2-prd)

**Hearthstone pack odds and pity timers: Blizzard support article 32545, "Hearthstone Shop" [opened, Wayback snapshot 2023-04-04](https://web.archive.org/web/20230404034630/https://us.battle.net/support/en/article/32545)**
- The live URL now redirects to a Battle.net login. The snapshot's page header reads "Updated: 2 weeks ago", which fits the 14 Mar 2023 date the [Hearthstone Wiki](https://hearthstone.wiki.gg/wiki/Card_pack_statistics) gives [opened].
- Normal packs:
  - "On average, 5.0% chance to get a Normal Legendary card and guaranteed to get one within 40 packs from the previous Normal Legendary card drop".
  - "21.0% chance to get a Normal Epic card and guaranteed to get one within 10 packs".
  - Golden Legendary 0.6% / 361 packs, Golden Epic 1.4% / 142, Golden Rare 7.1% / 29, Golden Common 8.1% / 25.
  - "One Legendary card is guaranteed within the first 10 packs of a new card expansion."
- Duplicate protection is also published: no second copy of a Legendary until all of that set's Legendaries are owned.
- Each pity counter counts "from the previous ... card drop" of that rarity, so it resets on each drop. Per-set counters are the wiki's claim, not Blizzard's.

**World of Warcraft: Legion legendary bad-luck protection**
- Mein-MMO (German, 24 Nov 2016) [opened] ([mein-mmo.de](https://mein-mmo.de/en/wow-legion-bad-luck-protection-legendary,125904)):
  - Community Manager Aerythlea confirmed "ein Schutz gegen Pech existiert" ("a protection against bad luck exists").
  - Normal boss loot keeps a fixed chance, but for legendaries, the more eligible content you play without one, the higher the chance becomes.
  - The analogy is a weighted die. Source cited: an EU Battle.net forum thread, not opened.
- PCGamesN [opened] ([pcgamesn.com](https://pcgamesn.com/world-of-warcraft/wow-legion-legendary-soft-cap-removed)) quotes game director Ion Hazzikostas:
  - "the 'bad luck protection' system exists to protect the unluckiest players"
  - "We drew that line at 4 legendaries, initially"
  - "'Bad luck protection' now applies indefinitely."
- No percentages were published.

**Shuffle bags: the Tetris "Random Generator" (7-bag), Tetris Wiki [opened]** ([tetris.wiki/Random_Generator](https://tetris.wiki/Random_Generator))
- "The seven tetrominoes are shuffled and drawn from the bag one by one." It is the generator of Tetris Guideline games.
- It "can produce a run of no more than 12 tetrominoes between one I piece and the next", and S/Z runs are limited to 4.
- It was originally developed for The New Tetris, as a 63-piece bag. Droughts "are limited in severity and less likely to occur".
- Variants: an 8-bag (Tetris Online Japan beta) and TGM3's 35-bag.

**Hidden "mercy" tuning disclosed by developers (related, not re-opened)**
- Jennifer Scheurle's 2017 thread: Assassin's Creed and Doom give the last sliver of health extra hit points. — [Destructoid](https://www.destructoid.com/devs-reveal-how-they-trick-us-in-epic-twitter-thread/) [search extract]

### Inferences
- [computed] PRD on a hit chance of 65%: the first attack hits 48.1% of the time, a second attack after a miss 96.2%, and a third is guaranteed. So **at most two misses in a row** while the long-run rate stays 65%. The drawback is that first attacks hit less often than the displayed 65%.
- [computed] My 7-bag simulation (1.4M pieces) reproduces the wiki's 12-piece gap and S/Z run of 4.
- A shuffle-bag version for d20: a "deck" of 20 cards numbered 1–20 per character or per party, drawn without replacement and reshuffled when empty. This is analogous, not documented.
- Visibility differs:
  - PRD and XCOM aim assist are hidden.
  - Hearthstone's timers are now published as odds plus guarantees.
  - The 7-bag is semi-visible through the piece preview.
  - Fire Emblem's display misstates the odds.
- Hearthstone shows that a published guarantee ("within 40") can sit next to an honest average ("5.0%").

### Gaps
- No Valve primary source for PRD constants was opened. The Liquipedia table is community-derived.
- WoW's exact Legion increments were never published.

## 5. Player psychology: misperceiving randomness, streaks and frustration

### Takeaway
- People misjudge short random sequences: they expect them to look "representative". The canonical hot-hand study (Gilovich, Vallone & Tversky 1985) drew that conclusion. Miller & Sanjurjo (2018) reversed its headline result, but the belief data stand: 91% of fans believed in streak shooting.
- Children aged 10–12 and adults at the same school level judged game fairness equally poorly. **No one** of 15 children and 15 adults gave a fully correct answer when comparing two dice with different numbers of faces (Batista et al. 2022).
- In a study of grades 5 to college, the gambler's fallacy ("tails is due") weakened with age, but some other chance misconceptions grew stronger (Fischbein & Schnarch 1997).
- Measured evidence on streak frustration in games is thin but points one way:
  - EA match data: churn after repeated losses was about twice that of other recent records (5.1% vs 2.6–2.7% within 7 days).
  - Near-misses feel worse than clear misses yet raise the urge to keep playing.
  - Hunicke's Hamlet paper is a design proposal. The pass-1 claim of measured results traces to a different paper I could not open.

### Cited Findings
- **Gilovich, Vallone & Tversky (1985)**, "The Hot Hand in Basketball: On the Misperception of Random Sequences", *Cognitive Psychology* 17, 295–314 [opened] ([CU Boulder course PDF](https://home.cs.colorado.edu/~mozer/Teaching/syllabi/7782/readings/gilovich%20vallone%20tversky.pdf)):
  - The 76ers records "provided no evidence for a positive correlation between the outcomes of successive shots", and Celtics free throws and a Cornell varsity experiment agreed.
  - "The outcomes of previous shots influenced Cornell players' predictions but not their performance."
  - The belief is attributed to "a general misconception of chance according to which even short random sequences are thought to be highly representative of their generating process."
  - Survey: "91% of the fans believed that a player has 'a better chance of making a shot after having just made his last two or three shots'".
- **Miller & Sanjurjo (2018)**, "Surprised by the Hot Hand Fallacy? A Truth in the Law of Small Numbers", *Econometrica* 86(6), 2019–2047, doi:10.3982/ECTA14943 [opened, abstract] ([Econometric Society](https://www.econometricsociety.org/publications/econometrica/2018/11/01/surprised-hot-hand-fallacy-truth-law-small-numbers); [arXiv 1902.01265](https://arxiv.org/abs/1902.01265)):
  - There is "a subtle but substantial bias" in the common streak measure, which "increases in streak length".
  - "Upon correcting for the bias, we find that the longstanding conclusions of the canonical study are reversed."
- **Batista, Borba & Henriques (2022)**, "Fairness in games: a study on children's and adults' understanding of probability", *Statistics Education Research Journal* 21(1), article 13, doi:10.52041/serj.v21i1.79 [opened, full PDF] ([iase-pub.org PDF](https://iase-pub.org/ojs/SERJ/article/download/79/321)):
  - Participants: 15 children aged 10–12 and 15 adults aged 25–65, all attending 5th grade in state schools in north-east Brazil, none taught probability. They were interviewed individually (Piagetian clinical interview) on six fair and unfair games.
  - Judgments "depended mainly on the understanding of independence of events, analysis of the sample space, and perception of proportionality".
  - "the children performed better than the adults in all cases except the fair dice game".
  - **Both dice games** compared dice with different numbers of faces (a d4 with a d6, a d6 with a d8). In the fair one, 0 of 15 children and 0 of 14 adults answering were correct, and 2 adults were partly correct. In the unfair one, 0 of 15 in each group were correct, and none were partly correct.
  - In Loto, many thought 1-2-3-4-5-6 less likely than "mixed" numbers.
- **Fischbein & Schnarch (1997)**, "The Evolution With Age of Probabilistic, Intuitively Based Misconceptions", *Journal for Research in Mathematics Education* 28(1), 96–105 [opened] ([PDF](https://wwwg.uni-klu.ac.at/stochastik.schule/IEJME_FINAL_IEJME_FINAL/P05/Fischbein_Schnarch_1997.pdf)):
  - Participants: 20 students each in grades 5 (ages 10–11), 7, 9 and 11, and 18 prospective mathematics teachers, all untaught.
  - The coin item: three heads in a row, then what is the chance of heads? "The impact of the negative recency strategy decreased with age, whereas the positive recency effect was almost absent."
  - Overall, some misconceptions diminished with age, one was stable, and some grew stronger. Sample-size and time-axis errors increased with age.
- **Hunicke & Chapman, "AI for Dynamic Difficulty Adjustment in Games"** (Northwestern, about 2004) [opened] ([PDF](https://users.cs.northwestern.edu/~hunicke/pubs/Hamlet.pdf)):
  - Hamlet runs on Valve's Half-Life engine and uses Inventory Theory to predict when a player is "flailing", meaning "repeatedly edging towards a state where her current means can no longer accomplish necessary and immediate ends".
  - **Reactive** actions change on-screen entities ("the accuracy or damage of attacks, strength of weapons, level of health"). **Proactive** actions change entities not yet spawned.
  - Reactive changes "run the risk of disrupting the player's sense of disbelief". Proactive ones, happening "in the wings", are "less likely" to.
  - Each intervention has a "cost", so the game doesn't "feel trivial, repetitive or boring".
  - Evaluation was **planned, not reported** ("we plan to evaluate ..."). So the pass-1 figures (deaths 6.4 → 4, adjustments unnoticed) do not come from this paper. They are probably from Hunicke, "The Case for Dynamic Difficulty Adjustment in Games", ACE 2005, doi:10.1145/1178477.1178573, which was not opened because the ACM DL returned 403. They remain [search extract, secondary].
- **Chen et al. (2017)**, "EOMM: An Engagement Optimized Matchmaking Framework", WWW 2017 [opened] ([arXiv 1702.06820](https://arxiv.org/pdf/1702.06820)). The data come from an EA PvP game, Table 1: "The churn risk of some states with repeated losses (5.1%) is almost twice as much as those of other 'safer' states (2.6%-2.7%)". Churn means no play for 7 days after a match, conditioned on the last three outcomes.
- **Clark, Lawrence, Astley-Jones & Gray (2009)**, "Gambling near-misses enhance motivation to gamble and recruit win-related brain circuitry", *Neuron* 61, 481–490, doi:10.1016/j.neuron.2008.12.031 [opened, abstract via Europe PMC]:
  - "Compared to 'full-misses,' near-misses were experienced as less pleasant, but increased desire to play."
  - The effect appeared only "where the subject had personal control over arranging their gamble."
- **Zhang et al. (2021)**, "Effect of Input-output Randomness on Gameplay Satisfaction in Collectable Card Games" [opened] ([arXiv 2107.08437](https://arxiv.org/pdf/2107.08437)). It had 18 participants aged 20–26 and four conditions. Input randomness lowered satisfaction significantly, and output randomness (random results after the choice) had no significant effect. The authors say it may be underpowered.
- **Kou, Li, Gui & Suzuki-Gill (2018)**, "Playing with Streakiness in Online Games: How Players Perceive and React to Winning and Losing Streaks in League of Legends", CHI 2018, doi:10.1145/3173574.3174152. Title and authors are confirmed through Crossref [opened, metadata only]. Its findings are [search extract]: from an analysis of forum posts, losing streaks hurt player experience and engagement, and players attributed streaks to skill, teammates, randomness and "system design".
- Pass-1 commentary not re-opened (still [search extract]):
  - the randomness-perception review ([ResearchGate](https://www.researchgate.net/publication/223161247_The_Perception_of_Randomness));
  - the gambler's-fallacy PMC paper ([PMC5215234](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5215234/));
  - "Probability Problems in Game Design" ([Game Developer](https://www.gamedeveloper.com/design/probability-problems-in-game-design));
  - the Edge column ([PressReader](https://www.pressreader.com/australia/edge/20160210/282205124924832));
  - Steam "percent to hit is a lie" threads.

### Inferences
- [computed] How often unmodified d20 play produces streaks. P(at least one run of k or more consecutive misses within n attacks):

  | Hit chance | 3+ misses in 10 attacks | 3+ in 20 | 4+ in 20 | 3+ in 40 | 5+ in 40 |
  |---|---|---|---|---|---|
  | 50% | 50.8% | 78.7% | 47.8% | 96.0% | 46.8% |
  | 55% | 40.9% | 68.3% | 35.8% | 90.9% | 32.6% |
  | 60% | 31.4% | 56.2% | 25.1% | 82.2% | 20.8% |
  | 65% | 22.9% | 43.5% | 16.3% | 69.6% | 11.9% |
  | 70% | 15.5% | 31.0% | 9.6% | 54.0% | 6.1% |
- Batista et al.'s dice result bears directly on presentation for ages 8+. No child or adult tested fully succeeded at comparing chances across different sample spaces (a d4 against a d6). "+5 vs AC 14" against "+3 vs DC 12" is that same comparison across different numbers. One plain outcome display ("hits on 9 or more", or a word scale) is likely to work better than several numbers. Inference, not tested.
- Fischbein & Schnarch suggest the youngest players are the *most* likely to think a hit is "due" after misses. A visible momentum token shows them that something did change, which fits the expectation instead of fighting it. Inference.
- The near-miss finding cuts both ways for a children's game. A "so close!" miss with no payoff is the gambling pattern: less pleasant, yet more compelling. A near-miss band that *does* something (a graze or partial hit) turns the near-miss into a real small win. Inference. A design caution, not a measured effect in games.
- EOMM is the only behavioural measurement I found that ties a streak of failures to people leaving. It is at match level, not attack level, but it is real data at scale.

### Gaps
- Still **no controlled study of attack-level miss streaks** or of displayed versus actual hit chance in video games. The CHI 2018 paper is qualitative and wasn't opened in full.
- No study of children's reactions to *hidden* adjusted odds was found.
- Hunicke 2005 (ACE) was not opened, so the Hamlet results remain secondary.
- Tversky & Kahneman (1971) and Gold & Hester were not retrieved.

## 6. Combat mechanics relevant to a turn-based, async Discord RPG

### Takeaway
Several combat games put a middle result between hit and miss, or a visible miss-streak bonus. Where the numbers are published, they are concrete enough to copy:
- **XCOM 2 graze**: a hit can become a graze for half damage, driven by the target's Dodge stat.
- **Long War of the Chosen graze band**: rolls within 10 points either side of the hit chance become grazes.
- **Darkest Dungeon**: +4 accuracy for each consecutive miss after the first, a hidden 5–100% effective range, and a 95% display that is really a guaranteed hit.
- **Battle Brothers**: hit chance clamped to 5–95; the Beginner difficulty shifts rolls 5 points for the player and against enemies; the perk **Fast Adaptation** gives +10% to hit per miss and resets on a hit, a streak breaker the player opts into.

### Cited Findings
- **XCOM 2 graze (vanilla)** [opened] ([X2AbilityToHitCalc.uc](https://raw.githubusercontent.com/daakru/xcom2-wotc-modding/master/Firaxis/XCOM/SrcOrig/XComGame/Classes/X2AbilityToHitCalc.uc)):
  - The target's Dodge feeds `eHit_Graze`. In `FinalizeHitChance`, "Graze is scaled against Success - but ignored if success is 100%". So Graze = round(Dodge% × final hit chance), subtracted from the plain hits.
  - Graze damage is ×0.5 (`GRAZE_DMG_MULT=0.5f`, ini above).
  - The UI's "final hit chance" is "success + crit + graze", so the displayed hit chance includes grazes.
- **Long War of the Chosen graze band** [opened]:
  - `InitialGrazeBandWidth=10` ([XComLW_Overhaul.ini](https://raw.githubusercontent.com/long-war-2/lwotc/master/LongWarOfTheChosen/Config/XComLW_Overhaul.ini)).
  - The code describes a "Band of hit values around nominal to-hit that results in a graze". `GrazeChance_Hit` captures "the 'low' side where you just barely hit" and `GrazeChance_Miss` "the 'high' side where you just barely miss" ([X2LWAbilitiesModTemplate.uc](https://raw.githubusercontent.com/long-war-2/lwotc/master/LongWarOfTheChosen/Src/LW_Overhaul/Classes/X2LWAbilitiesModTemplate.uc)).
  - Near 0% or 100% the band narrows, so 100% stays a hit and 0% a miss.
  - Crit chance can promote a graze to a hit, and Dodge can demote a hit to a graze (and, with `DODGE_CONVERTS_GRAZE_TO_MISS=true`, a graze to a miss).
  - Guaranteed-hit and indirect-fire abilities ignore the band.
- **Darkest Dungeon**, "Combat Mechanics (Darkest Dungeon)", darkestdungeon.wiki.gg [opened] ([page](https://darkestdungeon.wiki.gg/wiki/Damage)):
  - Hit chance is ACC minus the defender's DODGE.
  - "Each skill also has a hidden internal +5 bonus to ACC, after all modifiers (including DODGE) are applied", so "a displayed hit chance of 95% or above is a guaranteed hit". Every skill keeps at least 5%.
  - "There is also a hidden +4 ACC bonus for any consecutive miss in a row after the first one". The cited rules-file key is `consecutive_miss_reduction_acc_buff: 0.04`.
  - The page doesn't say whether monsters get the miss bonus, or when it resets.
- **Battle Brothers**, "Hit Chance", battlebrothers.fandom.com [opened via API] ([page](https://battlebrothers.fandom.com/wiki/Hit_Chance)):
  - Hit chance = skill − defense, with defense above 50 counted at half.
  - Hit chance "cannot be lower than 5% and cannot go higher than 95%". The roll is 1–100.
  - Beginner combat difficulty: "player hit roll = hit roll - 5", "enemy hit roll = hit roll +5".
  - Fast Adaptation perk ([page](https://battlebrothers.fandom.com/wiki/Fast_Adaptation)): "Gain an additional stacking +10% chance to hit with each attack that misses an opponent. Bonus is reset upon landing a hit."
- **Presentation**, collected from the sources above:
  - XCOM 2 shows hit and crit percentages and hides aim assist.
  - Fire Emblem shows a Hit number that is not the real chance.
  - Darkest Dungeon shows a percentage whose top is a hidden 100%.
  - Civ Rev showed odds as strength ratios ("1.5 vs 0.5") and adjusted outcomes behind them.
  - Hearthstone publishes both an average and a guarantee.

### Inferences
- **Who gets the help** varies by game:

  | System | Player only? | Notes |
  |---|---|---|
  | XCOM 2 aim assist | Mostly | Enemy streaks are damped, never boosted. Damping is only on Rookie; soldiers-lost damping on Rookie and Veteran. |
  | XCOM EU streak breaker | Yes | Easy and Normal only (Gupta) |
  | Civ Rev | Yes, as Meier describes it | Not stated for AI |
  | Fire Emblem 2RN | Symmetric rule | Favours the player in practice, because players hold the high Hit values |
  | Battle Brothers Beginner | Asymmetric | +5 player, −5 enemy |
  | Fast Adaptation | Anyone with the perk | Earned, visible |
  | Darkest Dungeon | Unclear from the page | |
  | Dota PRD | Symmetric | Applies to every unit's procs |

  The pattern: **hidden help goes to the player only. Visible, rules-level mechanisms (PRD, perks, 2RN) are symmetric or earned.**
- A graze band of ±10 on d100 is ±2 on a d20. That makes "miss by 1–2 → graze for half damage" the direct analogue of LWOTC. It is a fixed band rather than one keyed to stats, so it doesn't favour strong heroes, unlike "miss by up to stat modifier + half proficiency". Inference for brief question 1.
- Fast Adaptation is a published, player-facing version of momentum: +10% on d100 is +2 on a d20, per miss, reset on a hit. That is evidence that a visible "+2 per miss until you hit" works as a mechanic in a shipped tactics game. Inference for brief question 2.
- For async play-by-post: XCOM's counters reset each turn and work per team. In a Discord game where a "turn" may take a day, a per-hero counter that lasts until that hero hits (Fast Adaptation style) survives the gaps better than a per-round team counter. Inference.

### Gaps
- No primary source (code or developer statement) was opened for Darkest Dungeon's or Battle Brothers' numbers. Both wikis cite game files, and the Darkest Dungeon page names the rules key.
- I didn't check whether XCOM 2's shot HUD shows graze chance separately.
- I found no player-facing study of graze or glancing mechanics.
