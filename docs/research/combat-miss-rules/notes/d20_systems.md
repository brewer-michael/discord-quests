# d20-family rules for misses, partial success and multiple defenses (5e 2024 / SRD 5.2.1, 2014 DMG options, D&D 4e, Pathfinder 2e, 13th Age)

Method and source-access note (read first). This environment's network policy blocked direct access to dndbeyond.com, media.dndbeyond.com, media.wizards.com, 2e.aonprd.com, 13thagesrd.com, pelgranepress.com, wikipedia, enworld, reddit and the designer blogs (connections refused, so WebFetch/curl could not open them). Only GitHub was reachable. So the "primary text" below comes from faithful, machine-readable copies of the rules held in public GitHub repositories, which I cloned and read directly:
- **5e 2024 / SRD 5.2.x**: `5e-bits/5e-database` (the dataset this project already uses for its bestiary, MIT-licensed code, SRD content under CC-BY-4.0) and `open5e/open5e-api` (its `srd-2024` document is labelled "System Reference Document 5.2", licence `cc-by-40`).
- **2014 SRD 5.1**: `5e-bits/5e-database` `src/2014`.
- **Pathfinder 2e (Remaster)**: `foundryvtt/pf2e` (the official-licensed Foundry system; each entry carries `publication: Pathfinder Player Core`, `license: ORC`, `remaster: true`).
- **13th Age**: `asacolips-projects/13th-age` (Foundry "Toolkit13" system). Its README says its compendium entries are "based on the Open Game License (OGL) content for the 13th Age Roleplaying Game".
Items marked **[search summary, page not opened]** are what the web-search tool reported about a page I could not open. Treat them as unverified secondary sources. Items marked **[unverified, from memory]** have no source I could open.

**Second pass, Q1–Q3 (2026-10-16, open network).** I opened and read these primary sources in full:
- The official **SRD 5.2.1 PDF** (`https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf`, 364 pages, PDF dated 2025-04-29, CC-BY-4.0), converted to text with pdftotext.
- The **SRD 5.2 PDF** (`.../SRD_CC_v5.2.pdf`, 361 pages, 2025-04-22), used to diff 5.2 against 5.2.1.
- Six official **Unearthed Arcana playtest PDFs** from media.dndbeyond.com: Character Origins (2022), Expert Classes (2022), and Player's Handbook Playtests 5–8 (2023). I found their URLs through the Wayback Machine's CDX index.
- The 3.5 SRD "Players Roll All the Dice" variant on d20srd.org (Open Game Content).

For 4e there is still no open primary text. The 4e findings below come from the D&D 4e Wiki (fan-made, opened through its MediaWiki API, citing PHB and DMG pages) and from forum and blog pages I opened.

Blocked or paywalled hosts:
- D&D Beyond's 2014 DMG redirects to the marketplace, which is a paywall.
- dnd4.fandom.com returned 402/403 to WebFetch, but its `api.php` worked.
- d20srd.org returned 403 to WebFetch, but curl worked.
- Scribd gave truncated pages only.
- Some EN World thread URLs returned 403.

Labels in Q1–Q3 now use: **[opened]**; **[opened, fan wiki]** (a tertiary source that cites book pages); **[opened forum post quoting the book]** (the book itself was not opened); **[search summary, page not opened]**; **[unverified, from memory]**; **[computed]**. All access dates are 2026-10-16.

## Q1. SRD 5.2.1 (2024 rules, CC-BY-4.0): weapon masteries, Studied Attacks, Grapple/Shove, save DCs, crits, advantage

### Takeaway
I checked the GitHub rules data against the official SRD 5.2.1 PDF. **The data matches the 5.2.1 wording word for word** for all eight masteries, Studied Attacks, Tactical Mind, Cunning Strike, attack rolls, natural 20 and 1, Advantage, critical hits and save DCs. A sentence-level diff of 5.2 against 5.2.1 found **no change to the combat rules, class features, weapon masteries or Rules Glossary**. The differences are in magic items, monster stat-block layout and the contents pages.

The glossary text for Grapple and Shove is now quoted verbatim below. Both are **saving throws** (Strength or Dexterity, target's choice) against **DC 8 + Strength modifier + Proficiency Bonus**, with no attack roll.

The SRD softens a miss in more places than Graze and Studied Attacks:
- **Potent Cantrip** (Evoker level 3): half cantrip damage on a miss or a successful save.
- **Acid Arrow**: half the initial damage on a miss.
- **Peerless Aim** (Boon of Combat Prowess, level 19+): once per turn, "When you miss with an attack roll, you can hit instead".
- **Stroke of Luck** (Rogue level 20).
- **Heroic Inspiration**: a reroll.

None of these is available to a level 1–5 martial character except through Graze.

First-party playtest history matters here:
- Graze appeared in April 2023 (Playtest 5) with almost its final text.
- Studied Attacks arrived in Playtest 7 (Sept. 2023). Its design note is the only stated rationale I found: it "increases the likelihood you'll hit after you miss".
- In Expert Classes (Sept. 2022), WotC playtested **"rolling a 1 on any d20 Test gives Heroic Inspiration"**, a direct "momentum after failure" rule. It did not reach the final rules.

### Cited Findings
**Weapon mastery properties, SRD 5.2.1 p. 90 (verbatim, CC-BY-4.0)** [opened] — [SRD 5.2.1 PDF](https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf)
- **Graze**: "If your attack roll with this weapon misses a creature, you can deal damage to that creature equal to the ability modifier you used to make the attack roll. This damage is the same type dealt by the weapon, and the damage can be increased only by increasing the ability modifier." It is the **only mastery that does anything on a miss**.
- **Vex**: "If you hit a creature with this weapon and deal damage to the creature, you have Advantage on your next attack roll against that creature before the end of your next turn."
- **Sap**: "If you hit a creature with this weapon, that creature has Disadvantage on its next attack roll before the start of your next turn."
- **Topple**: "If you hit a creature with this weapon, you can force the creature to make a Constitution saving throw (DC 8 plus the ability modifier used to make the attack roll and your Proficiency Bonus). On a failed save, the creature has the Prone condition."
- **Push**: "If you hit a creature with this weapon, you can push the creature up to 10 feet straight away from yourself if it is Large or smaller."
- **Slow**: "If you hit a creature with this weapon and deal damage to it, you can reduce its Speed by 10 feet until the start of your next turn. If the creature is hit more than once by weapons that have this property, the Speed reduction doesn't exceed 10 feet."
- **Nick**: "When you make the extra attack of the Light property, you can make it as part of the Attack action instead of as a Bonus Action. You can make this extra attack only once per turn."
- **Cleave**: "If you hit a creature with a melee attack roll using this weapon, you can make a melee attack roll with the weapon against a second creature within 5 feet of the first that is also within your reach. On a hit, the second creature takes the weapon's damage, but don't add your ability modifier to that damage unless that modifier is negative. You can make this extra attack only once per turn."
- Each text above is identical to the 5e-bits data. — [5e-bits SRD 2024 Weapon Mastery Properties](https://github.com/5e-bits/5e-database/blob/main/src/2024/en/5e-SRD-Weapon-Mastery-Properties.json)

**Which weapons have which mastery (from the SRD 2024 equipment data, with damage die):**
- **Graze**: Glaive (1d10), Greatsword (2d6). That is the full list. The SRD 5.2.1 weapon table (p. 90) also lists Graze only on these two.
- **Cleave**: Greataxe (1d12), Halberd (1d10).
- **Push**: Greatclub (1d8), Heavy Crossbow (1d10), Pike (1d10), Warhammer (1d8).
- **Sap**: Flail (1d8), Longsword (1d8), Mace (1d6), Morningstar (1d8), Spear (1d6), War Pick (1d8).
- **Slow**: Club (1d4), Javelin (1d6), Light Crossbow (1d8), Longbow (1d8), Musket (1d12), Sling (1d4), Whip (1d4).
- **Topple**: Battleaxe (1d8), Lance (1d10), Maul (2d6), Quarterstaff (1d6), Trident (1d6).
- **Vex**: Blowgun (1), Dart (1d4), Hand Crossbow (1d6), Handaxe (1d6), Pistol (1d10), Rapier (1d8), Shortbow (1d6), Shortsword (1d6).
- **Nick**: Dagger (1d4), Light Hammer (1d4), Scimitar (1d6), Sickle (1d4).
- All of the above — [5e-bits SRD 2024 Equipment](https://github.com/5e-bits/5e-database/blob/main/src/2024/en/5e-SRD-Equipment.json)

**Who gets masteries, and when (SRD 5.2.1 pp. 47–63)** [opened]
- **Fighter** (level 1) uses the masteries of three kinds of weapons. The count is 3 at level 1, 4 at level 4, 5 at level 10 and 6 at level 16, and the choice can change after each Long Rest. **Barbarian** gets 2 kinds, which must be melee weapons. **Paladin, Ranger and Rogue** each get 2. — [SRD 5.2.1 PDF](https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf); [5e-bits Features](https://github.com/5e-bits/5e-database/blob/main/src/2024/en/5e-SRD-Features.json)
- **Tactical Master** (Fighter level 9) lets the Fighter swap a weapon's mastery for Push, Sap or Slow on an attack.
- **Studied Attacks** (Fighter **level 13**, p. 48), verbatim: "You study your opponents and learn from each attack you make. If you make an attack roll against a creature and miss, you have Advantage on your next attack roll against that creature before the end of your next turn."
- **Tactical Mind** (Fighter level 2, p. 48): on a failed **ability check**, spend a Second Wind use to add 1d10. "If the check still fails, this use of Second Wind isn't expended." It does not apply to attack rolls.
- **Cunning Strike** (Rogue level 5, p. 63): "If a Cunning Strike effect requires a saving throw, the DC equals 8 plus your Dexterity modifier and Proficiency Bonus." The Trip option (cost 1d6) reads: "If the target is Large or smaller, it must succeed on a Dexterity saving throw or have the Prone condition."

**Every other "on a miss" rule in SRD 5.2.1** (full-text search of the PDF for miss phrasings) [opened]:
- **Potent Cantrip** (Evoker level 3, p. 82): "When you cast a cantrip at a creature and you miss with the attack roll or the target succeeds on a saving throw against the cantrip, the target takes half the cantrip's damage (if any) but suffers no additional effect from the cantrip."
- **Acid Arrow** (level 2 spell, p. 107): "On a miss, the arrow splashes the target with acid for half as much of the initial damage only."
- **Boon of Combat Prowess** (Epic Boon, level 19+, p. 88), Peerless Aim: "When you miss with an attack roll, you can hit instead. Once you use this benefit, you can't use it again until the start of your next turn."
- **Stroke of Luck** (Rogue level 20, p. 63): "If you fail a D20 Test, you can turn the roll into a 20." Once per Short or Long Rest.
- **Heroic Inspiration** (p. 7): "you can expend it to reroll any die immediately after rolling it, and you must use the new roll". You can hold only one. The GM awards it.
- **Monster stat-block grammar** (p. 256): "Miss. If an attack has an effect that occurs on a miss, that information follows the "Miss:" notation." "Hit or Miss" has its own notation. In the SRD bestiary the only uses are four "Hit or Miss:" lines where a thrown weapon returns. **No SRD monster deals damage on a miss.** Save effects use "Failure:" and "Success:" lines: "Success: Half damage." appears 68 times and "Success: Half damage only." 11 times.

**Unarmed Strike, Grapple and Shove (SRD 5.2.1 Rules Glossary, p. 190, verbatim)** [opened]
- "Instead of using a weapon to make a melee attack, you can use a punch, kick, headbutt, or similar forceful blow. In game terms, this is an Unarmed Strike--a melee attack that involves you using your body to damage, grapple, or shove a target within 5 feet of you. Whenever you use your Unarmed Strike, choose one of the following options for its effect."
- "**Damage.** You make an attack roll against the target. Your bonus to the roll equals your Strength modifier plus your Proficiency Bonus. On a hit, the target takes Bludgeoning damage equal to 1 plus your Strength modifier." This upgrades the earlier "[unverified, from memory]" line.
- "**Grapple.** The target must succeed on a Strength or Dexterity saving throw (it chooses which), or it has the Grappled condition. The DC for the saving throw and any escape attempts equals 8 plus your Strength modifier and Proficiency Bonus. This grapple is possible only if the target is no more than one size larger than you and if you have a hand free to grab it."
- "**Shove.** The target must succeed on a Strength or Dexterity saving throw (it chooses which), or you either push it 5 feet away or cause it to have the Prone condition. The DC for the saving throw equals 8 plus your Strength modifier and Proficiency Bonus. This shove is possible only if the target is no more than one size larger than you."
- **Grappling** (p. 182) covers three things:
  - One grapple per hand.
  - Ending a grapple: "A Grappled creature can use its action to make a Strength (Athletics) or Dexterity (Acrobatics) check against the grapple's escape DC". The grapple also ends if the grappler is Incapacitated or the two move apart beyond its range.
  - The grappler can release the target at any time.
- Monk **Dexterous Attacks** (p. 50) lets the Monk use Dexterity instead of Strength for the Grapple and Shove save DC. The **Grappler** feat (p. 87) allows "both the Damage and the Grapple option" once per turn on an Unarmed Strike hit during the Attack action.
- The second-hand summaries cited in the first pass (Arcane Eye, Dungeon Mister, D&D Beyond forum) are now superseded by the text above.
- 2014 comparison (SRD 5.1): a Strength (Athletics) check contested by Athletics or Acrobatics, made "instead of an attack roll". — [5e-bits SRD 5.1 Rule Sections](https://github.com/5e-bits/5e-database/blob/main/src/2014/en/5e-SRD-Rule-Sections.json)

**Conditions and the Help action: what "setting up an ally" looks like (SRD 5.2.1 Rules Glossary, verbatim)** [opened]
- **Help [Action]** (pp. 182–183), "Assist an Attack Roll": "You momentarily distract an enemy within 5 feet of you, giving Advantage to the next attack roll by one of your allies against that enemy. This benefit expires at the start of your next turn." "Assist an Ability Check" gives an ally Advantage on their next check with a chosen skill or tool.
- **Prone** (p. 186): "Your only movement options are to crawl or to spend an amount of movement equal to half your Speed (round down) to right yourself... You have Disadvantage on attack rolls. An attack roll against you has Advantage if the attacker is within 5 feet of you. Otherwise, that attack roll has Disadvantage."
- **Frightened** (p. 182): "You have Disadvantage on ability checks and attack rolls while the source of fear is within line of sight." "You can't willingly move closer to the source of fear."
- **Restrained** (p. 187): "Your Speed is 0 and can't increase... Attack rolls against you have Advantage, and your attack rolls have Disadvantage... You have Disadvantage on Dexterity saving throws."
- **Grappled** (p. 182): "Speed 0... You have Disadvantage on attack rolls against any target other than the grappler... The grappler can drag or carry you when it moves, but every foot of movement costs it 1 extra foot unless you are Tiny or two or more sizes smaller than it."
- **Bloodied** (pp. 16, 177): "If you have half your Hit Points or fewer, you're Bloodied, which has no game effect on its own but which might trigger other game effects." This is a 4e term carried into the SRD.
- **Saving Throw** (p. 187): "you can decide to fail the save without rolling."
- **Attack [Action]** (p. 177): "you can make one attack roll with a weapon or an Unarmed Strike". You can equip or unequip one weapon per attack, and move between attacks if you have Extra Attack.

**DC formulas, attack rolls, crits, advantage (SRD 5.2.1, verbatim)** [opened]
- Spell DC and attack bonus (p. 23 and p. 106): "Spell save DC = 8 + spellcasting ability modifier + Proficiency Bonus". The spell attack bonus is the spellcasting ability modifier + Proficiency Bonus.
- Save DCs in general (p. 7): "The Difficulty Class for a saving throw is determined by the effect that causes it or by the GM... Monster abilities that call for saves specify the DC."
- Attack rolls (p. 7): "An attack roll hits if the roll equals or exceeds the target's Armor Class." "Base AC = 10 + the creature's Dexterity modifier."
- Natural 20 and 1 (p. 7), under "Rolling 20 or 1": "If you roll a 20 on the d20 (called a "natural 20") for an attack roll, the attack hits regardless of any modifiers or the target's AC. This is called a Critical Hit." "If you roll a 1 on the d20 (a "natural 1") for an attack roll, the attack misses regardless of any modifiers or the target's AC." This applies to attack rolls only, not to checks or saves.
- Critical Hits (p. 16): "Roll the attack's damage dice twice, add them together, and add any relevant modifiers as normal... If the attack involves other damage dice, such as from the Rogue's Sneak Attack feature, you also roll those dice twice."
- Save damage (p. 16): "Many saving throw effects deal half damage (round down) to a target when the target succeeds on the saving throw." Damage against multiple targets is rolled once.
- Advantage (p. 7): "Use the higher of the two rolls if you have Advantage, and use the lower roll if you have Disadvantage." Instances don't stack, and having both means "you roll one d20... even if multiple circumstances impose Disadvantage and only one grants Advantage or vice versa."
- The open5e and 5e-bits data match all of this. — [open5e SRD 2024 Rule.json](https://github.com/open5e/open5e-api/blob/staging/data/v2/wizards-of-the-coast/srd-2024/Rule.json)

**SRD 5.2 vs 5.2.1** [opened; diff computed]
- I diffed the whitespace-normalised text of both PDFs sentence by sentence. 5.2.1 has 473 sentences not in 5.2, and 5.2 has 351 not in 5.2.1. Restricting to sentences about attacks, saves, Advantage, masteries, grapples, Prone, crits, misses or DCs, every change is in **magic items**, for example new or rewritten entries such as Energy Bow, Quarterstaff of the Acrobat and Sentinel Shield, and in reflowed tables.
- The other differences are monster stat-block layout and the contents pages.
- No sentence in the core rules (pp. 5–20), class features or Rules Glossary changed.
- So the first pass's open question of 5.2 versus 5.2.1 wording is **resolved**: they are the same for everything this project uses.

**Licensing** [opened]
- The SRD 5.2.1's required attribution is: "This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode."
- It also says: "Please do not include any other attribution to Wizards". A work may say it is "compatible with fifth edition" or "5E compatible". — [SRD 5.2.1 PDF, p. 1](https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf)
- The project NOTICE already uses this statement. — [project NOTICE.md](../../../../NOTICE.md)

**First-party design history: Unearthed Arcana playtests (official WotC PDFs)** [opened]
- **Graze first appears in Player's Handbook Playtest 5** (PDF dated 2023-04-25). It had "Prerequisite: Melee Weapon, Heavy Property". The rule text matched the final text, except the last clause read "the damage can't be increased in any way, other than increasing the ability modifier."
  - The weapon table already gave Graze only to the Glaive and Greatsword.
  - The design note says only that "Each weapon now has a Mastery property, a special property that requires a feature to unlock."
  - The Fighter note says "Weapon Mastery is a new 1st-level feature, giving you new ways to use weapons". The class updates were "inspired by the Player's Handbook survey in 2021".
  - The Graze text is unchanged in Playtests 6 (2023-06-28), 7 (2023-09-07) and 8 (2023-11-22).
  - — [UA Player's Handbook Playtest 5](https://media.dndbeyond.com/compendium-images/one-dnd/ph-playtest5/owThVp1CESZ1c91y/UA-2023-PH-Playtest5.pdf); [Playtest 6](https://media.dndbeyond.com/compendium-images/ua/ph-playtest6/OJVW7QLuHjEFCCVs/UA-2023-PH-Playtest6.pdf); [Playtest 7](https://media.dndbeyond.com/compendium-images/ua/ph-playtest7/tsgOb3llF22AL0nU/UA2023-PH-Playtest7.pdf); [Playtest 8](https://media.dndbeyond.com/compendium-images/ua/ph-playtest8/gHvtmY50loGLgQUb/UA2023-PH-Playtest8.pdf)
- **Studied Attacks first appears in Playtest 7.** The Fighter design note says: "Studied Attacks is a new level 13 feature that increases the likelihood you'll hit after you miss." The playtest text began "You masterfully study your opponents". This note is the **only first-party statement of intent for a miss rule** that I found. — [Playtest 7](https://media.dndbeyond.com/compendium-images/ua/ph-playtest7/tsgOb3llF22AL0nU/UA2023-PH-Playtest7.pdf)
- **"Rolling a 1 gives Heroic Inspiration" (Expert Classes, Sept. 2022):**
  - "Whenever a player character rolls a 1 for a d20 Test, that character gains Heroic Inspiration."
  - "That 1 must be on the d20 used for the test's total... This Heroic Inspiration represents a character's resolve to do better after fumbling an attempt."
  - In that playtest, Heroic Inspiration gave "Advantage on a d20 Test", chosen after the roll.
  - The final SRD keeps Heroic Inspiration as a GM award and a reroll. The Human species starts each day with it. There is no gain-on-a-1.
  - — [UA Expert Classes](https://media.dndbeyond.com/compendium-images/one-dnd/expert-classes/kpx0MvyfBGHe0XKk/UA2022-Expert-Classes.pdf)
- **Character Origins (Aug. 2022)** had broader natural-number rules, later reverted:
  - "If you roll a 1 on the d20, the d20 Test automatically fails". This covered checks and saves too.
  - "If you roll a 20 on the d20, the d20 Test automatically succeeds... A player character also gains Inspiration when rolling the 20".
  - Critical Hits were limited to player characters: "If a player character rolls a 20 for an attack roll with a Weapon or an Unarmed Strike, the attack is also a Critical Hit".
  - Unarmed Strike was an attack roll, and on a hit "The target is Grappled". Grapple became a saving throw by Playtest 5 (April 2023).
  - The final 5.2.1 limits natural 20 and 1 to attack rolls and lets any attacker crit.
  - — [UA Character Origins](https://media.dndbeyond.com/compendium-images/one-dnd/character-origins/CSWCVV0M4B6vX6E1/UA2022-CharacterOrigins.pdf)
- A Playtest 5 Barbarian note explains why Rage persists when you attack or force a save rather than when you take damage: "The focus is now on what you do, not on what's done to you." — [Playtest 5](https://media.dndbeyond.com/compendium-images/one-dnd/ph-playtest5/owThVp1CESZ1c91y/UA-2023-PH-Playtest5.pdf)

**Design commentary (secondary)**
- D&D Beyond's "Your Guide to Weapon Mastery in the 2024 Player's Handbook" (Mike Bernier, founder of Arcane Eye, a freelance contributor, not WotC staff; 2024-06-18) says: "Graze is an excellent way to increase the consistency of your weapon damage." **[opened]** — [D&D Beyond post 1742](https://www.dndbeyond.com/posts/1742-your-guide-to-weapon-mastery-in-the-2024-players)
- At a 2022 Creator Summit, Jeremy Crawford reportedly gave Graze as the example mastery, one that "allows a user to deal damage on a target with a weapon even when an attack misses". **[search summary, page not opened]** — [ComicBook.com](https://comicbook.com/gaming/news/dungeons-dragons-one-dnd-fighter-class-weapon-mastery/)
- Community rules readings say Graze damage still counts as a miss for other effects, and that it forces a DC 10 Concentration save. **[search summary, page not opened]** — [D&D Beyond forum: Graze](https://www.dndbeyond.com/forums/dungeons-dragons-discussion/rules-game-mechanics/216289-graze-weapon-mastery-abuse?comment=21)

### Inferences
- **Whiff math [computed]:** P(hit) = (21 − (AC − attack bonus)) / 20, clamped to 5%–95%. A level-1 PC with +5 against AC 13 hits 65% of the time, misses 35%, and misses twice running about 12% of the time. Against AC 15: 55% to hit, 20% for two misses in a row. With Advantage, 65% becomes about 88% (1 − 0.35²).
- **Graze as a miss floor [computed]:** with +3 Strength, a Greatsword miss deals 3, against 10 on an average hit (2d6+3). That is about 30% of a hit, or +1.05 expected damage per attack at 65% to hit. It is limited to two heavy weapons, so any design that spreads miss damage to everyone is a project rule, not an SRD rule. The SRD-native precedents are "ability modifier on a miss" (Graze) and "half damage on a miss" (Potent Cantrip, Acid Arrow).
- **The SRD's own "momentum" grammar answers part of design question 2.**
  - Studied Attacks, Vex and Help all grant **Advantage on the next attack**.
  - Studied Attacks and Vex apply only **against that creature** and expire "before the end of your next turn".
  - Help expires "at the start of your next turn" and works for an ally.
  - An SRD-faithful momentum rule would be: Advantage, one use, against the same foe, lasting until the end of your next turn. Letting it carry to another foe, or to an ally as Help does, would be a deliberate extension.
- **WotC itself playtested "failure → Heroic Inspiration"**, which gave Advantage at the time, on any natural 1. It then removed the rule (reason not found). That is the closest first-party precedent to "momentum after a miss". Note that the trigger was a natural 1 (5% per roll), not any miss (35% for an average hero), so it was much rarer than the project's proposal.
- The stat-block grammar already reserves a "Miss:" line, so a partial-hit rule for foes can be written in SRD-native form. The SRD bestiary itself never uses it for damage. Monster misses in the SRD are always empty, which supports making partial hits **heroes-only** by default (design question 3).
- Grapple and Shove (and Topple, and Cunning Strike Trip) turn "attacker misses" into "defender resists". The target picks the better of Strength or Dexterity, which is already a "higher of two saves" defense like 4e's (Q3). Any "mix of defenses" should treat these maneuvers as targeting that higher-of-two value.

### Gaps
- I found **no WotC article or design note stating why Graze exists** or why it is limited to two weapons. The playtest notes describe changes, not intent. The accompanying YouTube videos (Jeremy Crawford) were not transcribed.
- I found no stated reason why "Heroic Inspiration on a 1" (2022) and the all-d20-Test natural-20 rule were dropped. One forum excerpt calls the natural-20 version "rich get richer" **[search summary, page not opened]**.
- The Creator Summit remark about Graze is still second-hand.

## Q2. 2014 5e DMG optional rules ("players roll all the dice", hitting cover, cleaving) and SRD status

### Takeaway
**"Players Roll All the Dice" is confirmed as a D&D 3.5 variant**: I opened the 3.5 SRD variant-rules text (Open Game Content). It sets the monster's static "attack score" at **11 + attack bonus**, and the targets' "save scores" at **11 + save modifier**. Worked through, 11 moves the odds **5 points toward whichever player is rolling**, because ties go to the roller. For 5e, **12 + attack bonus** (defense) and **14 + save bonus** (against a d20 + spell attack bonus) are exact, so the conversion in these notes is confirmed.

No opened source puts the variant in the 5e 2014 DMG. I could not open the DMG to prove it is absent.

**Hitting Cover** and **Cleaving through Creatures** are confirmed by forum posts that quote and cite DMG p. 272, but the book itself is behind a paywall. Wargamer confirms both were dropped from the 2024 DMG, along with Flanking and the Action Options.

### Cited Findings
- **"Players Roll All the Dice", 3.5 variant (verbatim, Open Game Content under OGL 1.0a)** [opened] — [d20srd.org: Players Roll All The Dice](https://www.d20srd.org/srd/variant/adventuring/playersRollAllTheDice.htm)
  - Rationale: "In large combats, players often have little control over the outcome of events when it isn't their turn. This can lead to boredom if a player's attention drifts between his turns". It says players get "the feeling of having greater control over their successes and failures."
  - Cost: "it takes away some of the GM's ability to adjust encounters on the fly. Since the GM isn't rolling the dice, he can't fudge a result".
  - Attacks: "Each time an enemy attacks a PC, the character's player rolls a defense check. If that defense check equals or exceeds the attack score of the enemy, the attack misses." "Attack Score: 11 + enemy's attack bonus". "Defense Check: 1d20 + character's AC modifiers", which the text calls "effectively the same as rolling d20, adding your total AC, and then subtracting 10."
  - Crits: "If a player rolls a natural 1 on a defense check, his character's opponent has scored a threat". A second failed defense check confirms the critical hit, following 3.5's confirmation rule.
  - Saves: "Fortitude Score: 11 + enemy's Fortitude save modifier" (likewise Reflex and Will). "Magic Check: 1d20 + spell level + ability modifer + other modifiers". If the check "equals or exceeds the appropriate save score", the creature is affected "as if it had failed its save."
  - The page does not name its source book. These 3.5 SRD variant rules come from *Unearthed Arcana* (2004). **[unverified, from memory]**
- **Hitting Cover (2014 DMG p. 272)**:
  - The page number is cited by Mad Zagyg (EN World, 2014-12-05): "this optional rule is in the DMG on page 272: Hitting Cover."
  - A partial verbatim quote comes from Satyrn (EN World, 2019-06-27), who uses the rule "minus the final clause": "If a creature is providing cover for the missed creature and the attack roll exceeds the AC of the covering creature".
  - The mechanic, as these posts and Crit Academy describe it: when a ranged attack misses a target that has cover, check whether it would have hit without the cover. If so, the cover is struck, and a creature providing the cover is hit if the roll also beats its AC.
  - **[opened forum posts quoting the book; DMG not opened]** — [EN World: Firing into Combat](https://www.enworld.org/threads/firing-into-combat.392738/); [EN World: How do you handle ranged attacks into melee?](https://www.enworld.org/threads/how-do-you-handle-ranged-attacks-into-melee.660323/); [Crit Academy: D&D 5e Combat Options](https://www.critacademy.com/post/dampd-5e-combat-options)
- **Cleaving through Creatures (2014 DMG p. 272)**:
  - aco175 (EN World, 2022-06-28) quotes the rule: "When a melee attack reduces an undamaged creature to 0 hit points, any excess damage from that attack might carry over", "The attacker targets another creature within reach", and the chain repeats "until there are no valid targets". The original attack roll must hit the new target.
  - This replaces the first pass's "from memory" wording.
  - **[opened forum post quoting the book; DMG not opened]** — [EN World: Cleaving through Creatures (optional rule)](https://www.enworld.org/threads/cleaving-through-creatures-optional-rule.689520/)
- **Other 2014 DMG combat options (paraphrased, not verbatim)**: Flanking. Disarm: "Creature can make attack roll vs contested check to force them to drop a weapon". Mark: Advantage on opportunity attacks. Overrun: a contested Strength check. Shove Aside, Tumble, and Climb onto a Bigger Creature. Crit Academy cites DMG pp. 271–273 for nearby tables and lists **no "players roll all the dice" option**. **[opened, secondary paraphrase]** — [Crit Academy](https://www.critacademy.com/post/dampd-5e-combat-options)
- **2024 DMG** (Mollie Russell, Wargamer, updated 2024-11-01) **[opened]**:
  - Cleaving is missing. Her guess is that it "didn't gel well" with weapon mastery.
  - Hitting Cover is missing, and "likely doesn't synergize well anymore" now that objects have AC values.
  - Flanking "is noticeably absent from the new DMG".
  - "many uncommon actions from the 2014 DMG are absent", namely Disarm, Mark, Overrun, Shove Aside, Tumble and climbing onto bigger creatures.
  - Facing, lingering injuries and massive damage are gone too.
  - — [Wargamer: DnD quietly axed a stack of optional rules](https://www.wargamer.com/dnd/axed-optional-rules)
- **SRD status, checked in primary text**: neither SRD 5.1 nor SRD 5.2.1 has Cleaving, Flanking, Hitting Cover or a defense-roll variant. The SRD 5.2.1 Cover rules (p. 15) give cover's AC benefit only. — [5e-bits SRD 5.1 Rule Sections](https://github.com/5e-bits/5e-database/blob/main/src/2014/en/5e-SRD-Rule-Sections.json); [SRD 5.2.1 PDF](https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf)
- 5e community discussion of 11 versus 12 (EN World, r/rpg) was **[search summary, page not opened]**. It is now superseded by the arithmetic below. — [EN World: players roll all the dice 11 vs 12](https://enworld.org/threads/players-roll-all-the-dice-11-vs-12.77217)

### Inferences
- **Exact conversions [computed]:**
  - **Standard 5e attack:** a monster with attack bonus B hits armor class AC with P = (21 + B − AC)/20.
  - **Defense roll:** the PC rolls d20 + (AC − 10) and avoids the hit on ≥ T. Equal odds need **T = 12 + B**. With 3.5's T = 11 + B, P(hit) = (20 + B − AC)/20, so monsters hit **5 points less often**.
  - **Saves:** a 5e target fails a save of DC D with P = (D − 1 − s)/20. The caster rolls d20 + (D − 8), which is the spell attack bonus, against 14 + s. Then P = (D − 1 − s)/20, so **14 + save bonus is exact**.
  - **3.5's save version:** d20 + (DC − 10) against 11 + s gives P = (DC − s)/20, which makes spells land **5 points more often**.
  - So the 3.5 variant tilted both conversions toward the players. That fits the "players favored" pattern in the brief's question 3, though the page doesn't say it was deliberate.
- **Natural-number mapping [computed]:** keeping odds exact at the ends means a defender's natural 1 counts as the monster's natural 20 (a hit and a Critical Hit), and a defender's natural 20 counts as the monster's natural 1 (a miss). SRD 5.2.1 saves have no natural-20 or natural-1 rule. So a "caster rolls against 14 + save" conversion that applied attack-roll natural 20s and 1s would add a 5% floor and ceiling that the save rules don't have. It should either leave natural 20s and 1s out, or accept the shift.
- Cleaving makes a strong turn bigger but does nothing for a miss. Hitting Cover makes a miss "hit something", which is colour more than progress. Neither is SRD content. The mechanic can be rewritten in the project's own words, since game mechanics are generally not copyrightable, but that is a legal judgment beyond this research.

### Gaps
- The 2014 DMG text itself is still unopened. It is paywalled on D&D Beyond and I found no legitimate mirror. The p. 272 attributions and partial wording come from forum posts that quote the book.
- **"Players Roll All the Dice" is not proven absent from the 5e DMG.** No opened source places it there, and the 3.5 origin is confirmed, but a negative needs the book's index.
- The d20srd page doesn't name *Unearthed Arcana* as its source, so that attribution is from memory.

## Q3. D&D 4th Edition: four defenses, targeting conventions, "Miss:" effects, Reliable, minions, rationale

### Takeaway
4e has four static defenses: AC, Fortitude, Reflex and Will. Each is 10 + ½ level + the **higher of two ability modifiers**, plus other bonuses:
- Fortitude uses Strength or Constitution.
- Reflex uses Dexterity or Intelligence, plus the shield bonus.
- Will uses Wisdom or Charisma.
- AC adds Dexterity or Intelligence only in light armor.

The power you use, not a per-attack choice, decides which defense you target, for example Strength vs. AC or Intelligence vs. Reflex. The key design fact is the monster math (DMG role tables, via the fan wiki):
- Monster **AC = level + 14** for artillery (+12 for brutes, +16 for soldiers and minions).
- **Other defenses = level + 12**.
- **Attacks vs. AC = level + 5**, and **attacks vs. other defenses = level + 3**.

So 4e **built in a 2-point gap and cancelled it with a 2-point lower bonus**. Targeting a non-AC defense was not meant to be easier.

That produced two opposite criticisms:
- **Monster defenses converge.** Necropraxis: "What's the point of having multiple defenses if they are all within spitting distance of each other?"
- **PC defenses diverge.** PCs have "2 excellent defenses... and 1 poor defense", and monsters "regularly hit your worst NAD on a 2".

A tally of the first Monster Manual found non-AC defenses sat 1.4 (Fortitude), 2.75 (Reflex) and 3.3 (Will) points below AC, so Will was easiest to hit.

Miss safety nets are confirmed at the power level:
- At-will *Reaping Strike* deals half Strength modifier on a miss, or the full modifier with a two-handed weapon.
- Daily *Acid Arrow*: "Half damage" on a miss.
- *Sleep*: a miss still slows.
- **Reliable** powers aren't expended on a miss.
- **Minions** never take miss damage.
- In 2010 WotC changed *Magic Missile* to need **no attack roll**.

4e text is not open-licensed (GSL), so none of it can be reused.

### Cited Findings
- **Defense formula and pairs**: "10 + (half your level) + (armor or shield bonuses if applicable) + (ability modifiers) + (feat, race, untyped, etc bonuses)".
  - AC in light armor (cloth, leather or hide): "add either your Intelligence modifier or Dexterity modifier to your AC (whichever is higher)".
  - Fortitude: "Your Strength or Constitution modifier (whichever is higher)".
  - Reflex: "Add the higher of your Dexterity or Intelligence modifiers... In addition, equipping a shield will add to your Reflex defense."
  - Will: "Add your Wisdom or Charisma modifier to this defense, whichever is higher."
  - "Some powers take effect on a miss too, though with limited potency."
  - **[opened, fan wiki]** — [D&D 4e Wiki: Defense (via MediaWiki API)](https://dnd4.fandom.com/api.php?action=parse&page=Defense&prop=wikitext&format=json)
- **Attack roll**: "Roll a d20. Add 1/2 your level (rounded DOWN). Add the applicable ability modifier. The power you use determines which ability applies." Bonuses include "feat, power, proficiency, or situational bonuses". A natural 20 is an automatic hit and may crit, and a natural 1 is an automatic miss. "Otherwise you miss, which may still have effects (such as half damage)." Weapon proficiency adds its bonus only to weapon attacks. Implements add no proficiency bonus, only enhancement. **[opened, fan wiki citing PHB p. 56]** — [Attack roll](https://dnd4.fandom.com/api.php?action=parse&page=Attack_roll&prop=wikitext&format=json); [Weapon proficiency](https://dnd4.fandom.com/api.php?action=parse&page=Weapon_proficiency&prop=wikitext&format=json); [Implement](https://dnd4.fandom.com/api.php?action=parse&page=Implement&prop=wikitext&format=json)
- **Targeting is set by the power**, for example *Reaping Strike* "Strength vs. AC", *Scorching Burst* "Intelligence vs. Reflex", *Sleep* "Intelligence vs. Will", *Acid Arrow* "Intelligence vs. Reflex". Typical conventions: Fortitude for poison, disease and brute force; Reflex for area blasts and breath; Will for charm, fear and illusion. **[opened, fan wiki, for the examples; conventions unverified, from memory]**
- **Monster role statistics (DMG, as transcribed on the wiki)** **[opened, fan wiki]** — [Brute](https://dnd4.fandom.com/api.php?action=parse&page=Brute&prop=wikitext&format=json); [Soldier](https://dnd4.fandom.com/api.php?action=parse&page=Soldier&prop=wikitext&format=json); [Artillery](https://dnd4.fandom.com/api.php?action=parse&page=Artillery&prop=wikitext&format=json); [Minion](https://dnd4.fandom.com/api.php?action=parse&page=Minion&prop=wikitext&format=json)
  - Artillery: AC level + 14, other defenses level + 12, attack vs. AC level + 5, vs. other defenses level + 3.
  - Brute: AC level + 12, other defenses level + 12, attacks +5 and +3.
  - Soldier: AC level + 16, other defenses level + 12, attacks +5 and +3.
  - Minion: "Hit points: 1, a missed attack never damages a minion", AC level + 16, other defenses level + 12, attacks level + 3 against both.
  - A secondary copy of the role table also gives "Attack vs. AC Level + 5 / vs. other defenses Level + 3", with a footnote to subtract 2 for multi-target attacks. **[search summary of a Scribd copy, page not opened]**
  - The DMG table had errata. Greg Bilsland confirmed a typo ("The update has level + 5 for the soldier's attacks vs. AC or other defenses"), as quoted by Aegeri on EN World, 2010-07-07. **[opened forum post]** — [EN World: July Rules Update DMG](https://www.enworld.org/threads/july-rules-update-dmg-errata-needed.281219/)
- **Measured gap in the first Monster Manual** (kerbarian, EN World, 2008-06-04) **[opened forum post with a tally]** — [EN World: Lots of statistics from the Monster Manual](https://www.enworld.org/threads/lots-of-statistics-from-the-monster-manual.229092/)
  - Average defense minus AC over all monsters: Fortitude −1.39, Reflex −2.75, Will −3.31. Relative to level: AC +14.29, Fortitude +12.90, Reflex +11.54, Will +10.98.
  - "at every tier, will is the easiest defense to hit, followed closely by reflex."
  - By role, the exceptions: brutes have Fortitude 0.86 *above* AC, and soldiers sit 4.3–4.4 below AC on Reflex and Will.
- **Criticism: monster defenses converge, so the choice feels redundant** (Necropraxis/Brendan, 2012-03-05) **[opened]** — [Necropraxis: Nalfeshnee hack monsters](https://necropraxis.com/2012/03/05/nalfeshnee-hack-monsters/)
  - "all four of the defenses have similar values for any particular monster".
  - AC runs higher, but attacks against AC carry a higher bonus, so "it's a complete wash".
  - "What's the point of having multiple defenses if they are all within spitting distance of each other?"
  - He wanted defenses players could learn and exploit.
- **Criticism: PC defenses have a hole** (EN World "Non-AC Defenses", 2009-10-28) **[opened]** — [EN World: Non-AC Defenses](https://www.enworld.org/threads/non-ac-defenses.267173/)
  - Runestar: "Your character will typically have 2 excellent defenses (the 2 governed by your 2 key stats) and 1 poor defense."
  - CapnZapp: "monsters regularly hit your worst NAD on a 2."
  - Starfox: a level-15 Rogue and Bard have Fortitude about 20.
  - Tuft: a level-15 bard has Fort 20, Ref 26, Will 28, an 8-point spread.
  - Later "math fix" feats (Improved Defenses, Expertise) patched the scaling. **[search summary, page not opened]** — [EN World: Math fixes; can you clarify?](https://www.enworld.org/threads/math-fixes-can-you-clarify.304993/)
- **Miss lines on powers** **[opened, fan wiki citing PHB pages]** — [Reaping strike](https://dnd4.fandom.com/api.php?action=parse&page=Reaping_strike&prop=wikitext&format=json); [Acid arrow](https://dnd4.fandom.com/api.php?action=parse&page=Acid_arrow&prop=wikitext&format=json); [Sleep](https://dnd4.fandom.com/api.php?action=parse&page=Sleep&prop=wikitext&format=json); [Cleave](https://dnd4.fandom.com/api.php?action=parse&page=Cleave&prop=wikitext&format=json)
  - *Reaping Strike* (Fighter at-will, PHB p. 77): Strength vs. AC. Hit: "1[W] + Strength modifier damage." Miss: "Half Strength modifier damage. If you're wielding a two-handed weapon, you deal damage equal to your Strength modifier."
  - *Acid Arrow* (Wizard daily, PHB p. 160): Miss: "Half damage, and ongoing 2 acid damage (save ends)."
  - *Sleep* (Wizard daily, PHB p. 160): Intelligence vs. Will. Hit: slowed (save ends), and unconscious after the first failed save. Miss: "The target is slowed (save ends)."
  - *Cleave* (Fighter at-will, PHB p. 77), for contrast: a hit also deals Strength modifier damage to an adjacent enemy. There is no miss line.
- **Reliable** (PHB p. 55): "its per-encounter or daily use is not expended when the power doesn't hit". The Fighter daily *Brute Strike* (PHB p. 78) is "martial, reliable, weapon" with a "3[W] + Strength modifier" hit. **[opened, fan wiki]** — [Reliable](https://dnd4.fandom.com/api.php?action=parse&page=Reliable&prop=wikitext&format=json); [Brute strike](https://dnd4.fandom.com/api.php?action=parse&page=Brute_strike&prop=wikitext&format=json)
- **Minions**: "Minions take no damage from missed attacks, even if the attack normally deals damage on a miss. A minion is destroyed when it takes any amount of damage". The wiki notes that auto-damage, multi-target and zone attacks are the counter to minions. **[opened, fan wiki]** — [Minion](https://dnd4.fandom.com/api.php?action=parse&page=Minion&prop=wikitext&format=json)
- **WotC removed the roll from a whiff-prone at-will.** After the July 2010 update, *Magic Missile* "does not require an attack roll" and deals "2 + Intelligence modifier force damage" (3 at level 11, 5 at level 21). **[opened, fan wiki citing PHB p. 159 and the July 2010 update]** — [Magic missile](https://dnd4.fandom.com/api.php?action=parse&page=Magic_missile&prop=wikitext&format=json)
- **Commentary on defenses instead of saves**:
  - Talen Lee (press.exe, 2025-07-01): with non-AC defenses "A dragon rearing its head back and taking a breath weapon in fourth edition is just a normal combat action". The cost is lost "theatre" from the old roll-to-survive. **[opened]** — [4e: Kicked in the Nads](https://press.invincible.ink/4e-kicked-in-the-nads/)
  - The Alexandrian, DMDavid and RPG Musings frame the change as mathematically neutral, as consistency, and as one roll for area attacks. **[search summary, pages not opened]** — [The Alexandrian, tag: 4th edition](https://thealexandrian.net/wordpress/tag/4th-edition); [DMDavid](https://dmdavid.com/page/29/); [RPG Musings](https://rpgmusings.com/2009/08/saving-throw-mechanic-angst/)
- **Damage on a miss after 4e (D&D Next, 2012–14)**:
  - Rob Donoghue ("Drama on a Miss", 2014-02-06) lists the case for it: it avoids a "wasted" action, keeps fights moving, and is modular.
  - He lists the case against: it is counterintuitive to narrate, makes combat more predictable, contradicts other D&D editions, can kill on a miss, and interacts oddly with accuracy bonuses.
  - He sees the disagreement as coming from different assumptions about what hit points are.
  - **[opened]** — [Walking Mind: Drama on a Miss](https://walkingmind.evilhat.com/2014/02/06/drama-on-a-miss/)
  - An EN World poll on the Next playtest's miss damage: 121 votes (45.5%) to scrap it as unbelievable, 106 (39.8%) to keep it. A WotC Q&A of 2013-10-17 reportedly ruled that miss damage is not a "hit" for other effects. **[search summary, pages not opened]** — [EN World: Q&A 10/17/13](https://www.enworld.org/goto/post?id=6204802)
  - The 2014 PHB shipped without miss damage. The 2024 rules brought back a capped version as Graze (Q1).

### Inferences
- **4e's real lesson for the defense mix:** a gap between AC and the other defenses matters only if attacks against them don't carry a matching penalty. 4e matched the gap, giving NAD attacks 2 less, so the choice of defense was mostly flavour plus "which of my stats attacks". The project's `sim/defenses.py` finds the opposite problem: with DC 8 + PB + mod against paired SRD saves, **AC is the weakest defense for 84% of level-1 foes**. Untuned, the SRD numbers give **large, uneven gaps, not convergence**. The constant (14 + save keeps SRD odds; 12 + save lets moves land as often as weapons, per design question 4) decides which way the project errs.
- In 4e the **power** picks the defense, and a class's list of powers spreads its targets. That is the same as the project's direction 2 (the move keyed to a hero's stats decides the defense). It avoids a per-attack "pick a defense" menu, which suits ages 8+.
- **The higher-of-two rule creates one weak defense per character.** For heroes this would mirror 4e's "hit your worst NAD on a 2" complaint. For foes, a deliberate hole (soldiers weak on Reflex and Will, brutes weak on AC) is what makes a "find the weak spot" lesson work.
- **Any miss damage needs a minion carve-out or an equivalent.** 4e excluded minions explicitly. The SRD bestiary has many very low-HP creatures, so flat miss damage would kill them on a miss.
- 4e's layered safety net is precedent for making every **limited-use** ability pay something: half damage or a lesser effect on dailies, a small modifier on some at-wills, Reliable refunds, and auto-hit *Magic Missile*. *Magic Missile*'s change shows WotC accepted "no roll, small sure damage" for a basic at-will.

### Gaps
- Still **no primary 4e text** (PHB, DMG, Rules Compendium are GSL and not freely available). The formulas, role tables and power text come from the D&D 4e Wiki, which cites page numbers. The revised MM3/DMG2 role tables were not checked.
- **No first-party 4e designer statement** (Mearls, Heinsoo, Collins, Wyatt) on why Miss lines, Reliable or the NAD attack penalty exist. The Next-era Mearls and Crawford statements on miss damage were found only as forum summaries.
- 4e is under the GSL, not an open licence, so its text must not be reproduced in the game.

## Q4. Pathfinder 2e (Remaster): degrees of success, MAP, Strike, saves as defenses, failure effects, Athletics maneuvers, three actions, creature defenses

Second pass (2026-10-16): Archives of Nethys (2e.aonprd.com) was reachable. Rules pages were opened directly, and action, feat, trait, condition and spell entries were read from the JSON search index that the AoN site itself queries (`elasticsearch.aonprd.com/aon/_search`), which returns each entry's full text, source book and page. Findings marked **[opened 2026-10-16]** come from those reads. The earlier Foundry-data findings still stand: every one I rechecked matched the AoN text.

### Takeaway
Pathfinder 2e grades every check into four degrees. You meet the DC to succeed, **beat it by 10 or more** for a critical success and **fail by 10 or more** for a critical failure, and a **natural 20 or 1 moves the result one degree** (Player Core p. 401). Every defense is a DC of **10 + a modifier**. AC stops Strikes and spell attacks. The **Fortitude, Reflex and Will DCs** (10 + save modifier) stop skill maneuvers, and spells that call for saves use the spell DC (Player Core pp. 403–404). The plain Strike has no Failure entry, so a miss does nothing. Paizo adds miss value through opt-in keywords:
- **Press** actions: Certain Strike deals the hit's damage without any dice, a missed Exacting Strike doesn't add to MAP, and a missed Brutish Shove still leaves the target off-guard.
- **Finishers**: Confident Finisher deals half precise strike damage on a miss.
- The **backswing** trait: +1 to your next attack after a miss.

The **three-action turn** is the bigger cushion against whiffs. A failed Strike costs one action of three, and the remaining actions can go to Raise a Shield, Step, or Demoralize (Intimidation against the **Will DC**). Athletics maneuvers attack non-AC defenses: Trip and Disarm target the **Reflex DC**, while Shove, Grapple and Reposition target the **Fortitude DC**. Each maneuver's critical failure backfires on the attacker. GM Core builds creatures from tables. AC comes in four bands (level 1: extreme 19, high 16, moderate 15, low 13). For saves, the advice is to set "one high, one moderate, and one low" (level 1: +10, +7, +4, which gives DCs of 20, 17 and 14). That is a **built-in mix of defenses with a 6-point spread**. AoN publishes under Paizo's Community Use Policy. The Remaster books' rules text is ORC-licensed according to the Foundry data's tags (see Licensing below).

### Cited Findings
- **Degree of Success** (Player Core p. 401) **[opened 2026-10-16]**:
  - "You critically succeed when the check's result meets or exceeds the DC by 10 or more." "If you fail a check by 10 or more, that's a critical failure."
  - Natural 20: "your result is one degree of success better than it would be by numbers alone". Natural 1: "your result is one degree worse."
  - Against a very high DC a natural 20 may give only a success, or even a failure. A high enough modifier can succeed on a natural 1.
  - "If an effect doesn't list a critical success effect, the critical success effect is the same as the success effect, and the same goes for critical failures."
  - Effects that change the degree apply after the natural 20/1 adjustment.
  - — [AoN Rules ID 2286: Step 4: Degree of Success](https://2e.aonprd.com/Rules.aspx?ID=2286)
- The same rule, as the official Foundry implementation codes it: if total − DC ≥ 10, critical success; if DC − total ≥ 10, critical failure; otherwise success when total ≥ DC and failure when it isn't. A natural 20 then raises the result one degree, and a natural 1 lowers it one degree. — [foundryvtt/pf2e degree-of-success.ts, lines ~120–143](https://github.com/foundryvtt/pf2e/blob/v14-dev/src/module/system/degree-of-success.ts)
- **Designer rationale, Mark Seifter (Paizo design manager and one of PF2's four leads), 30 March 2018, Playtest era** **[opened 2026-10-16]**:
  - The playtest replaced scattered "fail by 5 or more" rules with "a unified mechanic". "If a failure entry is missing, that means nothing happens on a failure."
  - On Certain Strike: "a failed attack roll isn't actually a miss—your fighter is so skilled that you still get a glancing blow on a failure and miss entirely only on a critical failure!"
  - On save-or-lose spells: with two outcomes "you either cast the save or lose spell and win, or you cast it and waste the turn". Four degrees mean that "even on a success, you suffer a milder effect that is still useful for the spell's caster."
  - — [Paizo blog: Critical Hits and Critical Failures](https://paizo.com/blog/critical-hits-and-critical-failures)
- **Multiple Attack Penalty** (Player Core p. 275) **[opened 2026-10-16]**: "If you use an action with the attack trait more than once on the same turn, your attacks after the first take a penalty called a multiple attack penalty. Your second attack takes a –5 penalty, and any subsequent attacks take a –10 penalty." It "doesn't apply to attacks you make when it isn't your turn (such as attacks made as part of a reaction, like Reactive Strike)", and agile weapons reduce it. — [AoN Rules ID 2186 (Weapons)](https://2e.aonprd.com/Rules.aspx?ID=2186)
- Trait text confirms the rest. **attack**: "For each attack you make beyond the first on your turn, you take a multiple attack penalty." **agile**: "The multiple attack penalty you take with this weapon on the second attack on your turn is -4 instead of -5, and -8 instead of -10 on the third and subsequent attacks." Athletics maneuvers (Trip, Shove, Grapple, Disarm, Reposition) carry the **attack** trait, so they also count toward MAP. — [foundryvtt/pf2e static/lang/en.json](https://github.com/foundryvtt/pf2e/blob/v14-dev/static/lang/en.json); [Strike](https://github.com/foundryvtt/pf2e/blob/v14-dev/packs/pf2e/actions/basic/strike.json); [Trip](https://github.com/foundryvtt/pf2e/blob/v14-dev/packs/pf2e/actions/skill/trip.json)
- **Strike (Player Core, Remaster, ORC)**: "Roll an attack roll... and compare the result to the target creature's AC." "**Critical Success** You make a damage roll according to the weapon or unarmed attack and deal double damage." "**Success** You make a damage roll... and deal damage." There are no Failure or Critical Failure entries, so a failed Strike does nothing. — [foundryvtt/pf2e strike.json](https://github.com/foundryvtt/pf2e/blob/v14-dev/packs/pf2e/actions/basic/strike.json)
- **Spell attack vs AC, and saves as defenses**:
  - *Ignition* (cantrip, attack trait): "Make a spell attack roll against the target's AC, dealing 2d4 fire damage on a hit... Critical Success The target takes double damage and 1d4 persistent fire damage. Success The target takes full damage."
  - *Electric Arc* (cantrip): "Each target takes 2d4 electricity damage with a basic Reflex save."
  - *Caustic Blast* (cantrip): "1d8 acid damage with a basic Reflex save; on a critical failure, the creature also takes [persistent acid] damage."
  - *Force Barrage* (rank 1): "It automatically hits and deals 1d4+1 force damage", with 1–3 shards for 1–3 actions.
  - — [ignition.json](https://github.com/foundryvtt/pf2e/blob/v14-dev/packs/pf2e/spells/spells/cantrip/ignition.json); [electric-arc.json](https://github.com/foundryvtt/pf2e/blob/v14-dev/packs/pf2e/spells/spells/cantrip/electric-arc.json); [caustic-blast.json](https://github.com/foundryvtt/pf2e/blob/v14-dev/packs/pf2e/spells/spells/cantrip/caustic-blast.json); [force-barrage.json](https://github.com/foundryvtt/pf2e/blob/v14-dev/packs/pf2e/spells/spells/rank-1/force-barrage.json)
- AoN shows the same Strike text, from Player Core p. 418, with no Failure entry **[opened 2026-10-16]**. Same for *Ignition* (p. 336, "Defense AC"), *Electric Arc* (p. 328, "Defense basic Reflex") and *Force Barrage* (p. 332, automatic hit). — [AoN Strike](https://2e.aonprd.com/Actions.aspx?ID=2306); [AoN Ignition](https://2e.aonprd.com/Spells.aspx?ID=1565); [AoN Electric Arc](https://2e.aonprd.com/Spells.aspx?ID=1509); [AoN Force Barrage](https://2e.aonprd.com/Spells.aspx?ID=1536)
- **Saves as defenses** (Player Core pp. 403–404) **[opened 2026-10-16]**:
  - Fortitude uses Constitution, Reflex uses Dexterity and Will uses Wisdom, each plus proficiency.
  - "Like any other DC derived from a modifier, the DC for a saving throw is 10 + the total modifier for that saving throw", and the rules name "a Grapple attempt requiring a roll against your Fortitude DC" as an example.
  - "Spell DC = 10 + spellcasting attribute modifier + proficiency bonus". The spell attack roll is the same modifier on a d20 against AC, and it takes MAP. "Your spell DC is usually the same number + 10."
  - AC = 10 + Dex (up to the armor's cap) + proficiency + armor's item bonus.
  - — [AoN Saving Throws](https://2e.aonprd.com/Rules.aspx?ID=2296); [AoN Spell DC](https://2e.aonprd.com/Rules.aspx?ID=2293); [AoN Spell Attack Rolls](https://2e.aonprd.com/Rules.aspx?ID=2292); [AoN Armor Class](https://2e.aonprd.com/Rules.aspx?ID=2295)
- **Basic saving throw** (Player Core p. 404) **[opened 2026-10-16]**: "Critical Success You take no damage from the effect. Success You take half the listed damage... Failure You take the full damage... Critical Failure You take double the listed damage." This resolves the earlier gap, where the line came from memory. — [AoN Basic Saving Throws](https://2e.aonprd.com/Rules.aspx?ID=2297)
- **A save effect that bites on a success**: *Fear* (rank 1, Will) gives critical success, unaffected; success, frightened 1; failure, frightened 2; critical failure, frightened 3 and fleeing for 1 round (Player Core p. 331) **[opened 2026-10-16]**. Frightened is a status penalty equal to its value "to all your checks and DCs", dropping by 1 at the end of each of the creature's turns (p. 444). — [AoN Fear](https://2e.aonprd.com/Spells.aspx?ID=1524); [AoN Frightened](https://2e.aonprd.com/Conditions.aspx?ID=76)
- **Press trait** (verbatim): "An action with the press trait can be used only if you are currently affected by a multiple attack penalty... Some actions with the press trait also grant an effect on a failure. The effects that are added on a failure don't apply on a critical failure. If your press action succeeds, you can choose to apply the failure effect instead." — [foundryvtt/pf2e en.json](https://github.com/foundryvtt/pf2e/blob/v14-dev/static/lang/en.json)
- **Failure-effect examples (Player Core / Player Core 2, ORC)**:
  - *Exacting Strike* (Fighter 1, press): "**Failure** This attack doesn't count toward your multiple attack penalty." — [exacting-strike.json](https://github.com/foundryvtt/pf2e/blob/v14-dev/packs/pf2e/feats/class/fighter/level-1/exacting-strike.json)
  - *Brutish Shove* (Fighter 2, press, two-handed weapon): on a hit, the target is off-guard and you can automatically Shove it. "**Failure** The target becomes off-guard until the end of your current turn." — [brutish-shove.json](https://github.com/foundryvtt/pf2e/blob/v14-dev/packs/pf2e/feats/class/fighter/level-2/brutish-shove.json)
  - *Certain Strike* (Fighter 10, press): "Even when you don't hit squarely, you can still score a glancing blow... **Failure** Your attack deals any damage it would have dealt on a hit, excluding all damage dice. (This removes damage dice from weapon runes, spells, and special abilities, in addition to weapon damage dice.)" — [certain-strike.json](https://github.com/foundryvtt/pf2e/blob/v14-dev/packs/pf2e/feats/class/fighter/level-10/certain-strike.json)
  - *Confident Finisher* (Swashbuckler, finisher): "Make a Strike with the following failure effect. **Failure** You deal half your Precise Strike damage to the target." The **finisher** trait says: "Some finisher actions also grant an effect on a failure. If your finisher succeeds, you can choose to apply the failure effect instead." Using a finisher spends panache and ends attack actions for the turn. — [confident-finisher.json](https://github.com/foundryvtt/pf2e/blob/v14-dev/packs/pf2e/actions/class/swashbuckler/confident-finisher.json); [en.json](https://github.com/foundryvtt/pf2e/blob/v14-dev/static/lang/en.json)
  - **backswing** weapon trait: "After missing with this weapon on your turn, you gain a +1 circumstance bonus to your next attack with this weapon before the end of your turn." — [en.json](https://github.com/foundryvtt/pf2e/blob/v14-dev/static/lang/en.json)
  - **sweep** weapon trait: +1 circumstance bonus to attack "if you already attempted to attack a different target this turn using this weapon". **forceful** weapon trait: second attack +1 damage per weapon die, later attacks +2 per die. — [en.json](https://github.com/foundryvtt/pf2e/blob/v14-dev/static/lang/en.json)
- **Athletics maneuvers (Player Core, ORC; each 1 action with the attack trait; need a free hand; target no more than one size larger)**:
  - **Trip**, against the **Reflex DC**: critical success, the target falls prone and takes 1d6 bludgeoning; success, prone; critical failure, *you* fall prone. — [trip.json](https://github.com/foundryvtt/pf2e/blob/v14-dev/packs/pf2e/actions/skill/trip.json)
  - **Shove**, against the **Fortitude DC**: critical success, push up to 10 ft; success, 5 ft (you may Stride after the target); critical failure, you fall prone. — [shove.json](https://github.com/foundryvtt/pf2e/blob/v14-dev/packs/pf2e/actions/skill/shove.json)
  - **Grapple**, against the **Fortitude DC**: critical success, restrained until the end of your next turn; success, grabbed; failure, you fail, and any existing grab ends; critical failure, the target can grab you or knock you prone. — [grapple.json](https://github.com/foundryvtt/pf2e/blob/v14-dev/packs/pf2e/actions/skill/grapple.json)
  - **Disarm**, against the **Reflex DC**: critical success, the item drops; success, a further Disarm attempt gets +2, and the target takes −2 on attacks and checks with that item until it regrips; critical failure, you are off-guard until the start of your next turn. — [disarm.json](https://github.com/foundryvtt/pf2e/blob/v14-dev/packs/pf2e/actions/skill/disarm.json)
  - **Reposition**, against the **Fortitude DC**: critical success, move the target up to 10 ft; success, 5 ft; critical failure, the target can move you 5 ft. — [reposition.json](https://github.com/foundryvtt/pf2e/blob/v14-dev/packs/pf2e/actions/skill/reposition.json)
- **AoN check of the failure effects and maneuvers** **[opened 2026-10-16]**: the AoN text matches the Foundry data above. Page references:
  - *Exacting Strike*: Fighter 1, Player Core p. 140.
  - *Brutish Shove*: Fighter 2, p. 141.
  - *Certain Strike*: Fighter 10, p. 147.
  - *Confident Finisher*: Player Core 2 p. 161. Its failure damage is "that of the weapon or unarmed attack you used".
  - The **press** trait: p. 139. It adds that press actions can't be used "when it's not your turn, even if you use the Ready activity", and that a successful press action may take its failure effect instead "(For example, you may wish to do this when an attack deals no damage due to resistance.)".
  - The **finisher** trait: Player Core 2 p. 163.
  - **backswing**, **forceful**, **sweep** and **agile**: p. 282–283.
  - Trip p. 236, Disarm p. 236, Shove p. 235, Grapple p. 235, Reposition p. 235. All five are single actions with the **attack** trait.
  - Grapple's success lasts "until the end of your next turn unless you move or your target Escapes". Escape (p. 416) is a check against "the Athletics DC of a creature grabbing you".
  - — [AoN Certain Strike](https://2e.aonprd.com/Feats.aspx?ID=4820); [Exacting Strike](https://2e.aonprd.com/Feats.aspx?ID=4770); [Brutish Shove](https://2e.aonprd.com/Feats.aspx?ID=4779); [Confident Finisher](https://2e.aonprd.com/Actions.aspx?ID=2818); [Press](https://2e.aonprd.com/Traits.aspx?ID=675); [Finisher](https://2e.aonprd.com/Traits.aspx?ID=802); [Backswing](https://2e.aonprd.com/Traits.aspx?ID=545); [Forceful](https://2e.aonprd.com/Traits.aspx?ID=611); [Sweep](https://2e.aonprd.com/Traits.aspx?ID=708); [Agile](https://2e.aonprd.com/Traits.aspx?ID=526); [Trip](https://2e.aonprd.com/Actions.aspx?ID=2382); [Shove](https://2e.aonprd.com/Actions.aspx?ID=2380); [Grapple](https://2e.aonprd.com/Actions.aspx?ID=2376); [Disarm](https://2e.aonprd.com/Actions.aspx?ID=2383); [Reposition](https://2e.aonprd.com/Actions.aspx?ID=2379); [Escape](https://2e.aonprd.com/Actions.aspx?ID=2296)
- **What the maneuvers inflict** (Player Core p. 445) **[opened 2026-10-16]**: **off-guard** is "a –2 circumstance penalty to AC". **Prone** makes the creature off-guard and gives it "a –2 circumstance penalty to attack rolls", and standing up ends it. — [AoN Off-Guard](https://2e.aonprd.com/Conditions.aspx?ID=58); [AoN Prone](https://2e.aonprd.com/Conditions.aspx?ID=88)
- **Sudden Charge** (Barbarian/Fighter 1, two actions, flourish; Player Core p. 141) **[opened 2026-10-16]**: "Stride twice. If you end your movement within melee reach of at least one enemy, you can make a melee Strike against that enemy." It has no Failure line. **Swipe** (p. 144) compares one attack roll against the AC of up to two adjacent foes and "counts as two attacks for your multiple attack penalty". — [AoN Sudden Charge](https://2e.aonprd.com/Feats.aspx?ID=4774); [AoN Swipe](https://2e.aonprd.com/Feats.aspx?ID=4795)
- **Three-action economy and miss fallbacks** (Player Core pp. 398, 418–419, 240) **[opened 2026-10-16]**:
  - "During an encounter, you get 3 actions and 1 reaction per turn."
  - **Raise a Shield** (1 action): gain the shield's circumstance bonus to AC "until the start of your next turn".
  - **Step** (1 action): "You carefully move 5 feet", and the move doesn't trigger reactions.
  - **Demoralize** (1 action): an Intimidation check against the target's **Will DC**. Success makes the target frightened 1 and critical success frightened 2. "Regardless of your result, the target is temporarily immune to your attempts to Demoralize it for 10 minutes." It has no failure entry. It is not an attack-trait action, so it doesn't add to MAP.
  - — [AoN Actions](https://2e.aonprd.com/Rules.aspx?ID=2268); [AoN Raise a Shield](https://2e.aonprd.com/Actions.aspx?ID=2316); [AoN Step](https://2e.aonprd.com/Actions.aspx?ID=2304); [AoN Demoralize](https://2e.aonprd.com/Actions.aspx?ID=2395)
- **incapacitation trait** (Player Core p. 457) **[opened 2026-10-16]**: against a creature of "more than twice the spell's rank", the creature's save counts as one degree better and the caster's check as one degree worse. For non-spell effects the same applies to a creature of higher level than the source. This is a degree-shifting balance valve. — [AoN Incapacitation](https://2e.aonprd.com/Traits.aspx?ID=631)
- **How creature defenses are generated** (GM Core pp. 117–118, 120, 122) **[opened 2026-10-16]**:
  - **AC table** (Table 2–5), with four bands. At level 1: extreme 19, high 16, moderate 15, low 13. At level 5: 25 / 22 / 21 / 19. "Most creatures use high or moderate AC—high is comparable to what a PC fighter would have." Low AC "typically fits spellcasters".
  - **Saves table** (Table 2–6), with five bands. At level 1: extreme +11, high +10, moderate +7, low +4, terrible +2. At level 5: +17 / +15 / +12 / +9 / +7.
  - The GM Core guidance on saves: "You can often set saves quickly by assigning one high, one moderate, and one low modifier... Pay attention to the creature's Con, Dex, and Wis modifiers." It adds that "Almost no creature should have more than one extreme save", and that terrible saves go to "creatures that have a clear weak point—for example, a nearly immobile creature would have a terrible Reflex save."
  - **Strike attack bonus** (Table 2–9). At level 1: extreme +11, high +9, moderate +7, low +5. "Spellcasters typically have poor attack bonuses, potentially in exchange for extreme spell DCs."
  - **Spell DC** (Table 2–11). At level 1: extreme 20, high 17, moderate 14. "There is no low value."
  - — [AoN Armor Class (GM Core)](https://2e.aonprd.com/Rules.aspx?ID=2889); [AoN Saving Throws (GM Core)](https://2e.aonprd.com/Rules.aspx?ID=2890); [AoN Strike Attack Bonus](https://2e.aonprd.com/Rules.aspx?ID=2896); [AoN Spell DC and Spell Attack Modifier](https://2e.aonprd.com/Rules.aspx?ID=2899); [AoN Hit Points (GM Core)](https://2e.aonprd.com/Rules.aspx?ID=2891)
- **Encounter budget** (GM Core p. 75) **[opened 2026-10-16]**: for four PCs, trivial is 40 XP or less, low 60, moderate 80, severe 120 and extreme 160. Each extra or missing PC moves the budget by 10, 20, 20, 30 or 40. A creature of party level − 4 costs 10 XP. Sample structures include "Mated Pair (80 XP): Two creatures of party level" and "Mook Squad (60 XP): Six creatures of party level – 4". GM Core gives **no target fight length in rounds** on the page I opened. — [AoN Encounter Design](https://2e.aonprd.com/Rules.aspx?ID=2715)
- Licensing:
  - Every PF2e file I read in the Foundry data is tagged `license: ORC` and `remaster: true`, from Pathfinder Player Core or Player Core 2. — [strike.json](https://github.com/foundryvtt/pf2e/blob/v14-dev/packs/pf2e/actions/basic/strike.json)
  - AoN's licence page says the site "uses trademarks and/or copyrights owned by Paizo Inc., used under Paizo's Community Use Policy". It reproduces the OGL 1.0a and the books' copyright notices (Player Core © 2023, Player Core 2 © 2024), but my search of the page found no ORC notice text. **[opened 2026-10-16]** — [AoN Licenses](https://2e.aonprd.com/Licenses.aspx)

### Inferences
- PF2e's four-degree resolver is an **opt-in** partial-success system. The base Strike stays binary, and "failure effects" are earned through class features (press, finisher) or weapon traits (backswing). Seifter's own framing is that Certain Strike makes a failure "a glancing blow" and only a critical failure "a miss". A 5e-based game could copy that *structure*, an optional Failure line on some moves, while keeping 5e's d20 against AC.
- **Size of PF2e's "near-miss" band, computed** **[computed]**: take a +7 attacker (Str +4, trained +3) against a level-1 creature with high AC 16.
  - First Strike: hit on 9+ (60%, including 10% critical on 19–20). Failure on 2–8 (35%). Critical failure only on a natural 1 (5%).
  - Second Strike, at +2: hit 35%, failure 45%, critical failure 20% (rolls 1–4).
  - Third Strike, at −3: hit 10%, failure 45%, critical failure 45%.
  - So MAP, not the base math, is what pushes attacks into the critical-failure band. That is also why press failure effects, which "don't apply on a critical failure", pay off only about half the time on a second attack.
  - On a first attack, PF2e's "failure" is effectively *every* miss except a natural 1. A 5e game copying ±10 would behave the same way: the band would be "all misses", not "near misses". A narrower band (miss by up to N) is a different, unpublished design.
- **Defense mix, computed** **[computed]**: the same +7 Athletics check against a level-1 creature with saves +10 / +7 / +4 (DCs 20 / 17 / 14) succeeds 40% / 55% / 70% of the time. Critical failure rates are 15% / 5% / 5%. GM Core's "one high, one moderate, one low" rule therefore builds a **30-point spread** between a foe's best and worst save. Against high AC 16 (Strike 60%), a maneuver aimed at the low save is +10 points better and one aimed at the high save is 20 points worse. The rule that "high AC is comparable to what a PC fighter would have" and low AC "fits spellcasters" ties the AC band to creature type, as the project's `defenses.py` finding for armored foes does.
- Picking the right defense is the PF2e player's main tool for raising odds without extra dice. Trip (Reflex) and Shove/Grapple (Fortitude) give martial characters a non-AC option, and Demoralize (Will) gives everyone one. That is a direct template for "the move a hero picks decides which defense it targets", and each move's result is a condition (prone, off-guard, frightened, grabbed), not damage.
- The **three-action turn** blunts whiffs structurally. One failed Strike is a third of a turn, and the rest of the turn still does something (a shield raised, a Step, a Demoralize, a second Strike). A one-action-per-turn Discord game has no such cushion, which is why a per-attack partial-hit rule matters more there. Sudden Charge illustrates a softer version: its movement still happens when its Strike misses.
- Maneuvers that attack Reflex or Fortitude DC (10 + save modifier) show how to target a defense other than AC with an attack roll. That maps onto 5e's six save bonuses (see the Q2 conversion). PF2e's saves track one attribute each (Con, Dex, Wis), so it has no pairing of two abilities into one defense. 13th Age (Q5) and 4e (Q3) do pair them.
- Certain Strike (static damage on a failure) is the closest PF2e analogue to 5e's Graze. Both deal "modifiers only, no dice" on a miss.
- Critical failures on maneuvers backfire on the attacker (you fall prone, you become off-guard, the target grabs you). For players aged 8+, a backfire on a natural 1 may feel punishing. The SRD 5.2.1 baseline has no such tier, and the brief keeps "a natural 1 misses" only.

### Gaps
- **Resolved this pass**: the degree-of-success and MAP wording, the Player Core page numbers, and the basic-save definition now come from AoN pages I opened. The first-pass search summaries and memory notes for these are superseded.
- **Licence**: the ORC licence status of the Remaster rules rests on the Foundry data's `license: ORC` tags. AoN itself cites Paizo's Community Use Policy and the OGL, and I did not open Paizo's own ORC notice for Player Core.
- **Fight length**: I found no Paizo target for rounds per fight. GM Core's encounter section budgets XP but gives no round count.
- **Designer rationale**: beyond Seifter's 2018 blog post and the press trait's own resistance example, I found no Paizo statement on why press and failure effects exist, or on why creatures get one high, one moderate and one low save.

## Q5. 13th Age: miss damage, flexible attacks, escalation die, defenses and monster tables, Fail Forward, 2E changes, designer rationale

Second pass (2026-10-16): 13thagesrd.com was reachable. I opened the Combat Rules, Character Rules, Running the Game, Monster Rules, Monster Creation and Legal pages and nine class pages. pelgranepress.com returned **HTTP 403** to both WebFetch and curl (a bot block, not the network policy), so I read the Pelgrane articles and the 2E changes PDF from **web.archive.org** snapshots. `site.pelgranepress.com` failed TLS (its certificate is for wpengine.com). Findings marked **[opened 2026-10-16]** come from those reads.

### Takeaway
In 13th Age, "By default, a miss deals no damage", but most classes' **basic melee attack deals miss damage equal to the character's level**. That covers Fighter, Barbarian, Paladin, Ranger, Rogue, Cleric, Bard and Sorcerer. Wizards get none, and only Ranger and Rogue get it on basic ranged attacks. Many at-will attacks also deal level damage on a miss, and daily spells usually do "Miss: Half damage", leave the target dazed, or return the spell. A **natural 1 is a fumble**: it does "not even miss damage". So a miss rule paired with a hard natural-1 floor is the SRD's own design.

The **escalation die** is set to 1 at the start of round 2 and rises by 1 a round to a maximum of +6. PCs add it to attacks. "Monsters and NPCs do not" (dragons and a few others excepted). Heinsoo says that giving it to all monsters "would eliminate our game's dramatic curve, in which battles start out stacked against the heroes but tip in their favor."

Defenses are a **built-in mix**. A PC's AC, PD and MD each use the *middle* of three ability modifiers (Con/Dex/Wis, Str/Con/Dex, Int/Wis/Cha) plus a class base and level. Monster-building tables give every normal monster **AC = level + 16**, a **better defense = level + 14** and a **lesser defense = level + 10**, with the advice "Make either PD or MD better than the other". So AC is always the hardest target, and one non-AC defense sits 6 lower.

"Fail Forward!" in the SRD is explicitly a **non-combat** skill-check rule ("Outside of battle..."). 13th Age 2E (2025) keeps 1E compatibility. As a rule its Fighter drops flexible attacks, which a talent restores. The rogue's 1E Momentum (gained on a hit, lost when hit) becomes Bravado, which "does not go away when you're hit". Vulnerability now adds damage "hit or miss". Its changes document lists no change to miss damage or the escalation die. The SRD (Archmage Engine) is OGL 1.0a Open Game Content.

### Cited Findings
- **Core attack rules** (13th Age SRD, Combat Rules) **[opened 2026-10-16]**:
  - "For each attack, roll a d20 + an ability bonus + your level... Compare your total to the target's defense, usually Armor Class but sometimes Physical Defense or Mental Defense. If the total is equal to or higher than the defense, you hit."
  - "AC protects you from weapon attacks." "PD protects you from other physical attacks." "MD protect you against mental attacks."
  - Crits: "Every attack roll that is natural 20 is a crit... for double damage."
  - Fumbles: "Rolling a natural 1 has no effect on the target, not even miss damage."
  - Damage on Miss: "By default, a miss deals no damage, though some attacks are an exception. These attacks specify what happens on a miss."
  - Unarmed attacks deal "no damage" on a miss.
  - — [13th Age SRD: Combat Rules](https://www.13thagesrd.com/combat-rules/)
- **Escalation die** (same page) **[opened 2026-10-16]**:
  - "At the start of the second round, the GM sets the escalation die at 1. Each PC gains a bonus to attack rolls equal to the current value on the escalation die. Each round, the escalation die advances by +1, to a maximum of +6."
  - "Monsters and NPCs do not add the escalation die bonus to their attacks."
  - "If the GM judges that the characters are avoiding conflict rather than bringing the fight to the bad guys, the escalation die doesn't advance. If combat virtually ceases, the escalation die resets to 0."
  - Fear "dazes you and prevents you from using the escalation die."
  - This confirms the first pass's search-summary version and the Toolkit13 `@std = LVL+ED` formula.
  - — [13th Age SRD: Combat Rules](https://www.13thagesrd.com/combat-rules/)
- **Flexible attacks** (same page) **[opened 2026-10-16]**: "choose your target first, make your attack roll, and then use the natural unmodified die result to determine which of your eligible flexible attacks to use. You still use the modified roll to determine whether or not you hit". Also: "You can only use one flexible attack at a time", none on opportunity attacks, and you must declare flexible or non-flexible before rolling. The Fighter page confirms the maneuver triggers and effects listed below from the Toolkit13 data, for example *Heavy Blows* ("Any natural even miss": a miss-damage bonus "equal to the escalation die"), *Two-Weapon Pressure* ("Any miss": +2 melee attack against the target until the end of your next turn), *Grim Intent* and *Strong Guard*. — [13th Age SRD: Fighter](https://www.13thagesrd.com/classes/fighter/)
- **Basic attacks by class (SRD class pages)** **[opened 2026-10-16]**:
  - Melee "Miss: Damage equal to your level" for Barbarian, Bard, Cleric, Fighter, Paladin, Ranger, Rogue and Sorcerer.
  - Ranged "Miss: Damage equal to your level" only for Ranger and Rogue. The others show "—".
  - Wizard: "—" for both.
  - Fighter's melee attack is "Strength + Level vs. AC; Hit: WEAPON + Strength damage; Miss: Damage equal to your level".
  - Barbarian Rage: "roll 2d20 to hit with your barbarian melee and thrown weapon attacks... Use the higher roll", once per day plus a recharge roll.
  - — SRD class pages: [Barbarian](https://www.13thagesrd.com/classes/barbarian/), [Bard](https://www.13thagesrd.com/classes/bard/), [Cleric](https://www.13thagesrd.com/classes/cleric/), [Fighter](https://www.13thagesrd.com/classes/fighter/), [Paladin](https://www.13thagesrd.com/classes/paladin/), [Ranger](https://www.13thagesrd.com/classes/ranger/), [Rogue](https://www.13thagesrd.com/classes/rogue/), [Sorcerer](https://www.13thagesrd.com/classes/sorcerer/), [Wizard](https://www.13thagesrd.com/classes/wizard/)
- **PC defenses** (Character Rules and class pages) **[opened 2026-10-16]**:
  - "you look at three ability modifiers and use the middle value (not the highest or the lowest)". AC uses Con/Dex/Wis, PD uses Str/Con/Dex and MD uses Int/Wis/Cha. "PCs also add their class level to their defenses."
  - Class bases (AC with heavy or light armor, no shield / PD / MD):
    - Fighter 15 / 10 / 10
    - Paladin 16 / 10 / 12
    - Cleric 14 / 11 / 11
    - Ranger 14 / 11 / 10
    - Rogue 12 / 12 / 10
    - Barbarian 12 / 11 / 10
    - Bard 12 / 10 / 11
    - Sorcerer 10 / 11 / 10
    - Wizard 10 / 10 / 12
  - A shield adds +1 AC.
  - — [13th Age SRD: Character Rules](https://www.13thagesrd.com/character-rules/); class pages above
- **Monster defenses and stats** (Monster Creation; Baseline Stats for Normal Monsters) **[opened 2026-10-16]**:
  - Normal monsters by level (attack / strike damage / HP / AC / better defense / lesser defense):
    - Level 0: +5 / 4 / 20 / 16 / 14 / 10
    - Level 1: +6 / 5 / 27 / 17 / 15 / 11
    - Level 2: +7 / 7 / 36 / 18 / 16 / 12
    - Level 3: +8 / 10 / 45 / 19 / 17 / 13
    - Level 4: +9 / 14 / 54 / 20 / 18 / 14
    - Level 5: +10 / 18 / 72 / 21 / 19 / 15
    - The pattern holds through level 14 (+19 / 135 / 576 / 30 / 28 / 24).
  - In general: **attack = level + 5, AC = level + 16, better defense = level + 14, lesser defense = level + 10**.
  - Large/double-strength and huge/triple-strength monsters keep the same attack and defenses with about 2× and 3× damage and HP. Mooks keep the same defenses, with "Damage to kill one" of 5 at level 0 and 6 at level 1.
  - Guidance:
    - "Better Defense/Lesser Defense: Make either PD or MD better than the other, in general."
    - "Use the defense numbers as the top-end rather than the baseline unless you want the difficulty to scale up."
    - "If you only want to boost AC: Give the monster a +6 AC boost" (as the equivalent of one level).
    - Raise attacks and defenses "by 1 per added level".
  - — [13th Age SRD: Monster creation](https://www.13thagesrd.com/monsters/monster-creation/)
- **Monster attacks** (Monster Rules) **[opened 2026-10-16]**:
  - "Most monster attacks generally deal a specific amount of damage (instead of rolling for damage) and don't add on the escalation die. Only exceptional monsters get to add the escalation die to their attacks."
  - Monster riders trigger on "natural even or odd attack rolls, a 16+ on the natural roll, or other specific die rolls".
  - Dragons have the "escalator" ability, which "allows the dragon to add the escalation die to its attack rolls".
  - Some monsters also have miss damage. The dire animal feature *Carnage* says: "The dire animal's attacks that miss deal damage equal to its level."
  - Roles (archer, blocker, caster, leader, mook, spoiler, troop, wrecker) "still use the same stats".
  - — [13th Age SRD: Monster rules](https://www.13thagesrd.com/monsters/monster-rules/)
- **Building battles** (Running the Game) **[opened 2026-10-16]**: "For adventure tier, levels 1-4, start with one enemy creature of the party's level per PC." At champion tier the monsters are one level higher, and at epic tier two levels higher. Mooks count as about 0.33 of a standard monster at levels 1–2 and 0.25 at levels 3–4, and large and huge monsters count as 2 and 3. The SRD gives **no target fight length in rounds** on the pages I opened. — [13th Age SRD: Running the Game](https://www.13thagesrd.com/running-the-game/)
- **"Fail Forward!"** (Running the Game, under skill checks) **[opened 2026-10-16]**: "Outside of battle, when failure would tend to slow action down rather than move the action along, instead interpret it as a near-success or event that happens to carry unwanted consequences or side effects. The character probably still fails to achieve the desired goal, but that's because something happens on the way to the goal rather than because nothing happens." The ritual rules repeat: "Failure should fail forward." The SRD has no page numbers, so the brief's "core book p. 48" is **not confirmed**. — [13th Age SRD: Running the Game](https://www.13thagesrd.com/running-the-game/)
- **Rogue Momentum (1E)** (Rogue page) **[opened 2026-10-16]**: "You gain momentum by hitting an enemy with an attack. You lose momentum when you are hit by an attack." Momentum powers are mostly interrupt actions, limited to one a round. — [13th Age SRD: Rogue](https://www.13thagesrd.com/classes/rogue/)
- **Licensing** (13th Age SRD Legal page and page footers) **[opened 2026-10-16]**: "the game mechanics of this Fire Opal Media game product are Open Game Content, as defined in the Open Game License version 1.0a". Product Identity covers trademarks, proper names (characters, icons and so on), dialogue, plots, storylines, locations, characters, artworks and trade dress. The footer reads "13th Age Archmage Engine, version 3.0. Copyright © 2013-2015 Fire Opal Media... Licensed under the Open Game License." The site is run by Open Gaming Network, a third party, and its menu also lists clearly marked third-party (3pp) material, which I did not use. — [13th Age SRD: Legal](https://www.13thagesrd.com/legal/)
- **Attack formula**: Toolkit13 power cards roll attacks as `d20 + ability mod + @std + bonus vs. AC/PD/MD`, and the sheet defines `@std` as "LVL+ED" (level + escalation die). So the escalation die adds directly to PC attack rolls, alongside level. — [13th-age _item-sheet-helpers.mjs](https://github.com/asacolips-projects/13th-age/blob/main/src/module/item/_item-sheet-helpers.mjs); [Melee attack (Fighter)](https://github.com/asacolips-projects/13th-age/blob/main/src/packs/src/fighter/Melee_attack__Fighter__glntfSVG8JRGYk40.yml)
- **Three defenses**: attacks in the compendium target **AC**, **PD** (Physical Defense: for example *Ray of Frost*, *Fireball*, *Lightning Bolt*, *Acid Arrow* and the Rogue's *Thief's Strike* all go vs. PD) or **MD** (Mental Defense: for example *Sleep*, *Charm Person*, *Confusion*, *Hold Monster*, and the Rogue's *Shadow Walk* and *Slick Feint* go vs. MD). — [13th-age wizard powers](https://github.com/asacolips-projects/13th-age/tree/main/src/packs/src/wizard); [13th-age rogue powers](https://github.com/asacolips-projects/13th-age/tree/main/src/packs/src/rogue)
- **Miss damage on basic attacks (Toolkit13 compendium, OGL-based)**:
  - Melee attack, "Miss: [level] damage", for Fighter, Barbarian, (Rage) Barbarian (which rolls `2d20kh`), Paladin, Ranger, Rogue and Cleric.
  - **Wizard melee: Miss "—"** (none).
  - Ranged attack Miss "—" for Fighter, Barbarian, Paladin, Cleric and Wizard. Ranger and Rogue ranged attacks deal "Miss: [level] damage".
  - — [Fighter melee](https://github.com/asacolips-projects/13th-age/blob/main/src/packs/src/fighter/Melee_attack__Fighter__glntfSVG8JRGYk40.yml); [13th-age class packs (barbarian, paladin, ranger, rogue, cleric, wizard)](https://github.com/asacolips-projects/13th-age/tree/main/src/packs/src)
- **Miss lines on class powers and spells**:
  - Rogue at-wills (*Bleeding Strike*, *Deadly Thrust*, *Evasive Strike*, *Tumbling Strike*, *Flying Blade*) have "Miss: [level] damage." *Sure Cut*: "Miss: Deal your Sneak Attack damage + [level] damage."
  - Wizard *Ray of Frost* (at-will, vs. PD): "Miss: [level] damage". *Shocking Grasp*'s miss backfires: "You take damage equal to the target's level from botched feedback."
  - Daily spells: *Fireball*, *Lightning Bolt*, *Disintegrate*, *Meteor Swarm* and *Denial* deal "Miss: Half damage". *Sleep* and *Hold Monster* leave the target "dazed until the end of your next turn" on a miss. *Acid Arrow*: "Miss: 5 ongoing acid damage, and you regain the spell during your next quick rest." *Confusion*: "If you miss all targets, you regain this spell during your next quick rest."
  - Cleric: *Javelin of Faith* and *Judgment* deal level damage on a miss. *Spirits of the Righteous* misses still give the weakest nearby ally +2 AC.
  - Paladin *Smite Evil*: "Miss: Half damage".
  - — [13th-age wizard](https://github.com/asacolips-projects/13th-age/tree/main/src/packs/src/wizard); [rogue](https://github.com/asacolips-projects/13th-age/tree/main/src/packs/src/rogue); [cleric](https://github.com/asacolips-projects/13th-age/tree/main/src/packs/src/cleric); [paladin](https://github.com/asacolips-projects/13th-age/tree/main/src/packs/src/paladin)
- **Flexible attacks (Fighter maneuvers; trigger is the natural d20 roll)**:
  - **On a miss, level 1:**
    - *Heavy Blows* (natural even miss): "bonus to your miss damage... equal to the escalation die".
    - *Grim Intent* (natural even miss): the next miss damage adds a WEAPON die (2 dice at level 5, 3 at level 8).
    - *Brace for It* (any miss): the first crit against you becomes a normal hit.
    - *Two-Weapon Pressure* (any miss): +2 melee attack against that target until the end of your next turn.
  - **On a miss, level 3:**
    - *Make 'em Flinch* (natural even miss): add your Str or Dex modifier to miss damage (double at level 5, triple at level 8).
    - *Steady Now* (natural even miss): gain Con-modifier temporary HP.
    - *Strong Guard* (any miss): an adjacent ally gets +2 AC.
  - **On a miss, level 5:** *Hero's Skill* (natural even miss): "Add +2 to the attack roll, then halve any damage dealt by the attack if it hits."
  - **Other triggers:**
    - *Carve an Opening* (any natural odd roll): crit range expands by a cumulative +1 until you crit.
    - *Defensive Fighting* (natural 16+, or any natural even roll with a shield): +2 AC.
    - *Deadly Assault* (natural even hit): reroll 1s on damage.
    - *Precision Attack* (hit with natural 16+): + Dex to damage.
    - *Hack & Slash* (level 3, any natural even roll when the escalation die is 2+): make another melee attack against a different target.
    - *Combat Mastery* (level 9, natural 16+, once per battle): "Increase the escalation die by 1."
  - — [13th-age fighter maneuvers](https://github.com/asacolips-projects/13th-age/tree/main/src/packs/src/fighter), e.g. [Heavy Blows](https://github.com/asacolips-projects/13th-age/blob/main/src/packs/src/fighter/Heavy_Blows_Bi7GO9FPGzen6F2t.yml), [Grim Intent](https://github.com/asacolips-projects/13th-age/blob/main/src/packs/src/fighter/Grim_Intent_65Lp5HlBoJur8F7B.yml), [Make 'em Flinch](https://github.com/asacolips-projects/13th-age/blob/main/src/packs/src/fighter/Make__em_Flinch_sg6Q2dE3J7Bk0IAg.yml), [Two-Weapon Pressure](https://github.com/asacolips-projects/13th-age/blob/main/src/packs/src/fighter/Two_Weapon_Pressure_8MYr04jig6k0lDRv.yml), [Brace for It](https://github.com/asacolips-projects/13th-age/blob/main/src/packs/src/fighter/Brace_for_it_z9moL0VS3fbUUn4a.yml)
- **Escalation die rules**: superseded by the SRD Combat Rules quote above **[opened 2026-10-16]**. The first-pass summary matched it. A v4.0 Archmage Engine PDF exists on pelgranepress.com, but the host returned 403, so I used the 13thagesrd.com text (Archmage Engine v3.0). — [13th Age Archmage Engine v4.0 Combat Rules (PDF), not opened](https://pelgranepress.com/nas/content/live/pelgranepress/wp-content/uploads/2013/10/13th-Age-Archmage-Engine-v4.0_CombatRules.pdf)
- **Escalation die rationale, Rob Heinsoo, "13th Sage: Escalation for Everyone?" (7 August 2014)** **[opened 2026-10-16 via archive.org snapshot of 12 October 2025]**:
  - "The short answer is 'No' because the math of 13th Age expects that only the PCs (and dragons!) get the escalation die. Adding the escalation die to all monster attacks would make monsters far more deadly and would eliminate our game's dramatic curve, in which battles start out stacked against the heroes but tip in their favor as they dig in and fight."
  - For special cases he suggests giving a villain's forces the die "only when it is even". That "preserves the PCs' status as something special—they always have momentum and destiny on their side". It also adds urgency, and it is "slightly less likely to brute-force the PCs" into a loss. Other cases he names are an "escalating apocalypse" (monsters get the die only while it is at 1, then up to 2, and so on), horror one-shots (monsters hold the die until a PC dies), and returning named villains.
  - — [Pelgrane: 13th Sage: Escalation for Everyone? (archived)](https://web.archive.org/web/20251012090835/https://pelgranepress.com/2014/08/07/13th-sage-escalation-for-everyone/)
- **Rob Heinsoo, "13th Sage: Escalate the Drama!" (1 February 2019)** **[opened 2026-10-16 via archive.org snapshot of 17 September 2025]**:
  - "Bump It Up": "Mid-fight, increase the escalation die by 1 higher than normal—and make sure the players notice", when "the tide has suddenly turned against the PCs". In "Big Foreshadowing" the GM brings out a d10 or d12 as the escalation die to signal a long fight against hard-to-hit foes.
  - He points to "de-escalation" (core rulebook p. 162: the die doesn't rise while the PCs "aren't doing anything to push the conflict"). He says that in practice he has enforced it about once, and that the threat is usually enough.
  - He adds a caveat that these tricks work better with experienced players than with newcomers.
  - — [Pelgrane: 13th Sage: Escalate the Drama! (archived)](https://web.archive.org/web/20250917142821/https://pelgranepress.com/2019/02/01/13th-sage-escalate-the-drama/)
- "13th Sage: Speeding Combat" (2018) could not be opened: pelgranepress.com returned 403, archive.org has no snapshot, and the `site.pelgranepress.com` mirror failed TLS. The 2E preview PDF (2024) also has no archive.org snapshot. — [Pelgrane: 13th Sage: Speeding Combat](https://pelgranepress.com/2018/07/02/13th-sage-speeding-combat/); [13th Age 2E preview (PDF)](https://pelgranepress.com/nas/content/live/pelgranepress/wp-content/uploads/2024/05/13th_Age_2E_preview_updated.pdf)
- **Miss-damage rationale (commentary only)**:
  - Rob Donoghue (Evil Hat designer, not a 13th Age designer), "Drama on a Miss" (6 February 2014) **[opened 2026-10-16]**:
    - "Damage on a Miss" is "an idea I first encountered in D&D 4e, which figures prominently in 13th Age". "When you make a d20 style to-hit roll and miss, you still inflict some fraction of your damage, usually just your stat mod."
    - He lists the case against it: "counterintuitive"; "it makes combat more boring... the emotional satisfaction of a good hit can be diminished by the fact that you know there's a consolation prize for missing"; "I can kill someone on a miss"; "an unearned reward".
    - He notes that multiple attacks per turn already reduce true whiffs.
    - In the comments, players report liking miss damage because players "always feel like they're making progress in the fight" and "don't often feel like they wasted a turn". One suggests renaming it so it reads as a "weak hit" rather than a miss.
    - — [Walking Mind: Drama on a Miss](https://walkingmind.evilhat.com/2014/02/06/drama-on-a-miss/)
  - His 2013 post "Combat in 13th Age" calls "most attacks do some damage on a miss" a distinguishing feature. **[search summary, page not opened]** — [Walking Mind: Combat in 13th Age](https://walkingmind.evilhat.com/2013/08/30/combat-in-13th-age)
  - An EN World poster argues the system has essentially "no such thing as a complete failure". **[search summary, page not opened]** — [EN World post 6274932](https://www.enworld.org/goto/post?id=6274932)
  - Heinsoo describes 13th Age as an attempt to "design the version of the D&D style game that we wanted to play together on Wednesday night". **[search summary, page not opened]** — [Wargamer: 13th Age is what happens when D&D designers get free rein](https://www.wargamer.com/13th-age/2nd-edition-dnd-designers)
- **13th Age 2E: "Changes from 1E Worth Mentioning" (Pelgrane, V1, June 2025)** **[opened 2026-10-16 via archive.org snapshot of 24 April 2026; pelgranepress.com itself returned 403]**:
  - "Despite many changes, the 13th Age 2E rules are compatible with the classes, treasures, and monsters of 1E."
  - Fighter: "As a rule, the fighter no longer uses flexible attacks. Its maneuvers build on its basic melee attack. But there's a talent that handles flexible attacks properly" (HH p. 118). The fighter also gains "a new feature called Momentum that's a pretty big deal", replacing the playtest's Combat Rhythm talent, which "didn't have good effects on play" (HH p. 114).
  - Rogue: "the rogue's version of Momentum is gone, replaced by Bravado, a resource that accumulates when you hit with an attack and does not go away when you're hit, the way Momentum did" (HH p. 151).
  - Barbarian rage "increases your crit range when you are raging instead of improving your accuracy by rolling a second d20" (HH p. 64).
  - Combat:
    - "Vulnerability... Attackers now add bonus damage equal to double the attacker's level against the vulnerable target, hit or miss, so there's always an impact when a target is vulnerable. (Unless the attacker rolls the dreaded 1.)"
    - "There's a combat assist action when you feel that your own actions aren't likely to succeed" (HH p. 298).
    - Two-weapon fighting "now automatically hits on a natural 2 instead of just allowing you to reroll the attack".
    - Building battles now uses a "battle level".
    - Monster stat blocks print "the expected baseline stats for defenses and hit points in small gray digits alongside each creature's actual stats".
    - Surprise rounds are dropped in favour of initiative bonuses.
  - The document lists **no change to miss damage or to the escalation die**.
  - — [13A Changes from 1E (archived PDF)](https://web.archive.org/web/20260424033424/https://pelgranepress.com/files/13th_Age/13A_2e/13A_Changes_from_1e.pdf)
- This resolves the first-pass conflict. The EN World claim that 2E flexible attacks "are now an optional/alternative system" matches the official document: the fighter no longer has them by default, and a talent restores them. — [EN World: 13th Age 2e update](https://www.enworld.org/threads/13th-age-2e-update.703833/post-9918532)
- 2E spell damage reportedly dropped "at least 10%" because spells now target PD and MD rather than AC, and was tuned with miss damage in mind. **[search summary, page not opened: pelgranepress.com 403, no archive snapshot]** — [Pelgrane: Converting 13 True Ways Classes to 13th Age 2E](https://pelgranepress.com/2025/07/31/converting-13-true-ways-classes-to-13th-age-2e)
- **Licensing**:
  - The SRD is OGL 1.0a Open Game Content (see the Legal finding above).
  - Toolkit13 also ships `licenses/OGL.txt` and the "13th Age Roleplaying Game Community Use Policy" (Fire Opal Media). — [13th-age README](https://github.com/asacolips-projects/13th-age/blob/main/README.md); [13th-age licenses](https://github.com/asacolips-projects/13th-age/tree/main/licenses)
  - I found no 2E SRD or ORC release. **[search, not confirmed either way]**

### Inferences
- "Miss damage = level" is the simplest whiff fix on record, and it is **not a near-miss band**. It applies to every miss except a natural 1, at a fixed amount.
  - **[computed]** At level 1 it is 1 damage, against an average hit of 1d8 + 4 = 8.5 for a Fighter with a one-handed martial weapon (12% of a hit). Graze's 3 of 10 is 30%.
  - 13th Age keeps it off the wizard and most basic ranged attacks, so it is a **budgeted class feature** rather than a universal rule.
  - The natural-1 exception ("not even miss damage") matches the brief's kept rule that a natural 1 misses.
- **Neither PF2e nor 13th Age uses a margin-based "missed by a little" band.** PF2e's ±10 covers almost every first-attack miss (Q4). 13th Age's partial results key off *every* miss (miss damage) or off the **natural die** (even or odd, 16+). The brief's "missed by no more than stat mod + half proficiency" is therefore a new design with no direct precedent in these two systems. The closest analogue is Hitting Cover (Q2), which keys off "would have hit without the cover bonus".
- **Defense mix, computed** **[computed]**: a level-1 PC with a +4 key modifier attacks at +5. Against a level-1 normal monster (AC 17, better defense 15, lesser 11) it hits **45% / 55% / 75%**.
  - The monster tables build a fixed **2-point gap** (10 percentage points) from AC to the better defense and a **6-point gap** (30 points) to the lesser one.
  - AC is always the hardest target, and PCs reach the soft defense by class and spell choice (weapons against AC; most spells against PD or MD), not by picking a target per turn.
  - The project's `defenses.py` finding (AC is the weakest defense for 84% of level-1 SRD foes) is the reverse of 13th Age's built-in shape. A 13th Age-style design would make weapons the reliable-but-hard option and paid in miss damage, with stat-based moves aimed at a weaker defense.
- **Momentum's form:** 13th Age's 1E rogue Momentum was binary (gained on a hit, lost when hit). In 2E Pelgrane replaced it with Bravado, which "accumulates" and "does not go away when you're hit". The design moved away from a fragile on/off state, which bears on the brief's question of how long momentum lasts. The new 2E fighter Momentum is unread (see Gaps).
- The escalation die answers whiff turns at the **fight** level rather than the *turn* level. Each round adds 5 percentage points to every PC's hit chance: by round 4 (die at 3) the +5 PC above hits AC 17 60% of the time instead of 45%. Heinsoo's stated reason for keeping it PC-only is the "dramatic curve": battles "start out stacked against the heroes but tip in their favor". This is a deliberate player-only tilt, like XCOM's aim assist, and it suits a kids' game. His "only when even" variant for monsters is a ready-made half-measure if foes ever need it.
- **Fail Forward is not a combat rule** in the 13th Age SRD. It is scoped "Outside of battle", for skill checks that would stall the story. In combat, 13th Age's equivalent is miss damage and miss lines.
- Flexible attacks give a miss a *choice*: something to do when the die comes up odd or even, or as any miss. That suits a Discord UI, where buttons could appear after the roll. 2E's move to make them a talent rather than the fighter default suggests they added complexity. That argues for keeping them off the simple presentation for ages 8+.
- 13th Age 2E's vulnerability rule ("hit or miss, so there's always an impact") is Pelgrane stating, in 2025, that impact on every attack is a design goal.

### Gaps
- **Resolved this pass**: the escalation-die wording, the basic-attack miss damage per class, PC defenses, monster defense tables, Fail Forward, Heinsoo's dramatic-curve rationale and the 2E change list now come from opened pages (the SRD, or Pelgrane pages via archive.org).
- **Blocked**: pelgranepress.com returned HTTP 403 to WebFetch and curl. I could not open the Archmage Engine v4.0 PDF, the 2E preview PDF, "Speeding Combat" or "Converting 13 True Ways" (no archive.org snapshots for the last three). site.pelgranepress.com failed TLS.
- **Unverified**: the "core book p. 48" page for Fail Forward (the SRD has no page numbers). The 2E fighter **Momentum** rules (only named in the change list). Whether 2E spells target PD/MD with lower damage (search summary only). Any first-party **fight-length target** in rounds: none appears on the SRD pages I opened, and "Speeding Combat" is the likely source.
- I still found **no first-person Heinsoo or Tweet statement explaining miss damage specifically**. The designer rationale on record concerns the escalation die. Rob Donoghue's essay is third-party commentary.
