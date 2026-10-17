# How narrative and non-d20 RPGs handle failure, partial success, momentum and armor

*How I got the sources (first pass): the session's network proxy blocked every publisher and SRD website (bladesinthedark.com, dungeonworldsrd.com, fate-srd.com, ironswornrpg.com, Wikipedia, Reddit, roll20 and the rest returned DNS errors or 403). Only raw.githubusercontent.com and registry.npmjs.org could be reached. So every "opened" citation from that pass is either (a) the official open text as published to GitHub or npm by the rights holder or by the SRD's maintainer, or (b) a licensed or community Foundry VTT system file that reproduces rules text or implements the rules in code. Each one is labelled. Material that came only from search-engine summaries (pages I did not open) or from memory is kept in separate "Unverified" sub-lists. All probabilities are my own exact enumerations of the published dice rules.*

*Second pass (accessed 2026-10-16, open network): I opened bladesinthedark.com (Effect, Licensing, Consequences & Harm, Stress & Trauma, Progress Clocks); the Ironsworn Rulebook PDF (publisher's itch.io page, the free download linked from tomkinpress.com, formerly ironswornrpg.com); tomkinpress.com/pages/licensing; Pinnacle's official free SWADE Test Drive as published by Pinnacle on GitLab (the Foundry VTT module, whose journal pages carry the Test Drive rules text); the Mythras Imperative PDF (The Design Mechanism's itch.io page); the Fate Core SRD markdown again for concession rules; the archived Genesys FAQ/errata and GenCon adventure from FFG's CDN via the Wayback Machine; and the WFRP 4e Foundry system source. Blocked or unusable: cubicle7games.com (403), edge-studio.net (403), images-cdn.fantasyflightgames.com live (403; reached only through archive.org), FFG's Genesys product page (now redirects to a product-line index), peginc.com's Test Drive store page (free, but delivered only through a Shopify checkout), and the archived WFRP errata PDF (archive.org's capture is truncated at 1 MB). PDFs were downloaded to the session scratchpad and read with pdftotext.*

## 1. Blades in the Dark: action roll outcomes, position and effect, consequences, resistance, armor

### Takeaway
In Blades a 4-5 is defined as "you do what you were trying to do, but there are consequences". One player roll settles both the PC's action and the NPC's action, and NPCs never roll. Armor and resistance do not change whether you hit. They let the player shrink or cancel a consequence after the fact, paying with stress or a spent armor box. Position (controlled, risky or desperate) sets how bad the consequences get. Effect (zero, limited, standard, great) sets how much a success accomplishes; on a progress clock that is 1, 2 or 3 ticks for limited, standard or great. A PC who runs out of stress is "taken out of action" and comes back later, not killed.

### Cited Findings
**License.** The SRD is "licensed for our use under the Creative Commons Attribution 3.0 Unported license" (One Seven Design, John Harper) — [Blades SRD content repo README](https://raw.githubusercontent.com/amazingrando/blades-in-the-dark-srd-content/master/README.md)

**Core roll, verbatim from the SRD.** "You roll several at once and read the single highest result." — [Blades SRD markdown](https://raw.githubusercontent.com/amazingrando/blades-in-the-dark-srd-content/master/Blades-in-the-Dark-SRD.md)
- "If the highest die is a **6**, it's a **full success**—things go well. If you roll more than one **6**, it's a **critical success**—you gain some additional advantage." — [Blades SRD](https://raw.githubusercontent.com/amazingrando/blades-in-the-dark-srd-content/master/Blades-in-the-Dark-SRD.md)
- "If the highest die is a **4 or 5**, that's a **partial success**—you do what you were trying to do, but there are consequences: trouble, harm, reduced effect, etc." — [Blades SRD](https://raw.githubusercontent.com/amazingrando/blades-in-the-dark-srd-content/master/Blades-in-the-Dark-SRD.md)
- "If the highest die is **1-3**, it's a **bad outcome**. Things go poorly. You probably don't achieve your goal and you suffer complications, too." — [Blades SRD](https://raw.githubusercontent.com/amazingrando/blades-in-the-dark-srd-content/master/Blades-in-the-Dark-SRD.md)
- Zero dice: "roll two dice and take the single lowest result. You can't roll a critical when you have zero dice." The SRD also says: "Even one die is pretty good in this game—a 50% chance of success." — [Blades SRD](https://raw.githubusercontent.com/amazingrando/blades-in-the-dark-srd-content/master/Blades-in-the-Dark-SRD.md)
- A 1-3 can still have some effect: "On a 1-3, it's up to the GM to decide if the PC's action has any effect or not... Usually, the action just fails completely, but in some circumstances, it might make sense or be more interesting for the action to have some effect even on a 1-3 result." — [Blades SRD](https://raw.githubusercontent.com/amazingrando/blades-in-the-dark-srd-content/master/Blades-in-the-Dark-SRD.md)
- **Double-duty rolls.** "Since NPCs don't roll for their actions, an action roll does double-duty: it resolves the action of the PC as well as any NPCs that are involved... On a 6, the PC wins and has their effect. On a 4/5, it's a mix—both the PC and the NPC have their effect. On a 1-3, the NPC wins and has their effect as a consequence on the PC." — [Blades SRD](https://raw.githubusercontent.com/amazingrando/blades-in-the-dark-srd-content/master/Blades-in-the-Dark-SRD.md)

**Position.** "By default, an action roll is risky. You wouldn't be rolling if there was no risk involved. If the situation seems more dangerous, make it desperate. If it seems less dangerous, make it controlled." — [Blades SRD](https://raw.githubusercontent.com/amazingrando/blades-in-the-dark-srd-content/master/Blades-in-the-Dark-SRD.md)

**Position-by-result table.** The SRD mirror leaves this table out ("@TODO add Action Roll table p21"). The text below comes from the Foundry VTT Blades system's localization strings, a secondary source — [foundryvtt-blades-in-the-dark en.json](https://raw.githubusercontent.com/megastruktur/foundryvtt-blades-in-the-dark/master/lang/en.json)
- Critical: "You do it with increased effect." 6: "You do it."
- Controlled 4/5: "You hesitate. Withdraw and try a different approach, or else do it with a minor consequence: a minor complication occurs, you have reduced effect, you suffer lesser harm, you end up in a risky position."
- Controlled 1-3: "You falter. Press on by seizing a risky opportunity, or withdraw and try a different approach."
- Risky 4/5: "You do it, but there's a consequence: you suffer harm, a complication occurs, you have reduced effect, you end up in a desperate position."
- Risky 1-3: "Things go badly. You suffer harm, a complication occurs, you end up in a desperate position, you lose this opportunity."
- Desperate 4/5: "You do it, but there's a consequence: you suffer severe harm, a serious complication occurs, you have reduced effect."
- Desperate 1-3: "It's the worst outcome. You suffer severe harm, a serious complication occurs, you lose this opportunity for action."
- XP for risk: "Every time you roll a desperate action, mark xp in that action's attribute."

**Effect.** Effect levels are great, standard and limited, plus "zero effect" and "extreme effect" after factors are applied. The factors are potency, scale and quality/Tier. "Fine items count as +1 bonus in quality." Pushing yourself (2 stress) gives +1 effect. Trading position for effect: a player can accept "a desperate roll but with great effect" instead of risky/standard — [Blades SRD](https://raw.githubusercontent.com/amazingrando/blades-in-the-dark-srd-content/master/Blades-in-the-Dark-SRD.md)

**Bonus dice.** Assistance: a teammate takes 1 stress and gives +1d. Push yourself (2 stress) OR accept a Devil's Bargain for another +1d. "The Devil's Bargain occurs regardless of the outcome of the roll." — [Blades SRD](https://raw.githubusercontent.com/amazingrando/blades-in-the-dark-srd-content/master/Blades-in-the-Dark-SRD.md)

**The five consequence types.** — [Blades SRD](https://raw.githubusercontent.com/amazingrando/blades-in-the-dark-srd-content/master/Blades-in-the-Dark-SRD.md)
- Reduced Effect: "You hit him, but it's only a flesh wound... reduces the effect level of the PC's action by one."
- Complication: fill "one tick on a clock for a minor complication or two ticks for a standard complication". A serious complication fills three ticks. **"Don't inflict a complication that negates a successful roll."** (Example: on a 4/5 to corner an enemy, "don't say that the enemy escapes".)
- Lost Opportunity: "To try again, you need a new approach."
- Worse Position: "You haven't failed, but you haven't succeeded yet, either. You can try again, re-rolling at the new, worse position."
- Harm: levels are Lesser (1), Moderate (2), Severe (3) and Fatal (4). Harm overflows to the next row up. A full top row means a "catastrophic, permanent consequence".

**Resistance and armor.** — [Blades SRD](https://raw.githubusercontent.com/amazingrando/blades-in-the-dark-srd-content/master/Blades-in-the-Dark-SRD.md)
- "Resistance is always automatically effective—the GM will tell you if the consequence is reduced in severity or if you avoid it entirely."
- "Your character suffers 6 stress when they resist, minus the highest die result from the resistance roll... If you get a critical result, you also clear 1 stress."
- "You may only roll against a given consequence once." "By adjusting which consequences are reduced vs. which are avoided, the GM establishes the overall tone of your game."
- Armor: "If you have a type of armor that applies to the situation, you can mark an armor box to reduce or avoid a consequence, instead of rolling to resist." The example: level 2 harm becomes level 1, and heavy armor lets you mark a second box to reduce it again, to zero. "All of your armor is restored when you choose your load for the next score." There are three boxes: standard, heavy and special.
- Pre-emptive resistance: "When the enemy has a big advantage, you'll need to make a resistance roll before you can take your own action."

**Probabilities** (my exact enumeration of the highest-d6 rule):

| Dice | Critical | 6 | 4-5 | 1-3 |
|---|---|---|---|---|
| 0d (lowest of 2) | — | 2.8% | 22.2% | 75.0% |
| 1d | — | 16.7% | 33.3% | 50.0% |
| 2d | 2.8% | 27.8% | 44.4% | 25.0% |
| 3d | 7.4% | 34.7% | 45.4% | 12.5% |
| 4d | 13.2% | 38.6% | 42.0% | 6.2% |

### Inferences
- Blades never removes whiffs entirely: a 1-3 is still common at 1 die. What it guarantees is that every roll produces a change in the fiction: a consequence on a 1-3, or success plus a cost on a 4-5. Nothing ever comes back as "nothing happened".
- The double-duty roll is a strong fit for play-by-post. One player message resolves the hero's attack and the enemy's response together, so the enemy needs no separate attack-roll round trip.
- "Don't inflict a complication that negates a successful roll" is a good rule to hand an AI game master directly. It stops the "partial success" from quietly turning back into a miss.
- Armor that is spent to downgrade harm, instead of making hits less likely, keeps hit rates high. It also gives the player an active choice ("use my armor?") rather than passive invisibility.

**Effect-to-clock ticks (opened, official SRD site).** "Each effect level indicates the questions that should be answered for that effect, as well as how many segments to tick if you're using a progress clock." The table gives **Great 3, Standard 2, Limited 1** ("You achieve a partial or weak effect. How is your impact diminished? What effort remains to achieve your goal?"). Zero and extreme effect exist ("effect level might be reduced below limited, resulting in zero effect—or increased beyond great, resulting in an extreme effect") but the table gives no tick count for either. A +1 effect ability applies after the GM's assessment, so it lifts zero effect to limited. Trading position for effect: "they might instead want to push their luck and make a desperate roll but with great effect." — [Blades SRD: Effect](https://bladesinthedark.com/effect), accessed 2026-10-16
- Clock sizes: "A complex obstacle is a 4-segment clock... A more complicated obstacle is a 6-clock... A daunting obstacle is an 8-segment clock." Danger clocks tick "one, two, or three segments... depending on the consequence level." Tug-of-war clocks "can be filled and emptied by events". Linked clocks example: a veteran warrior with linked "Defense" and "Vulnerable" clocks. — [Blades SRD: Progress Clocks](https://bladesinthedark.com/progress-clocks), accessed 2026-10-16

**License (opened).** "The contents of the SRD are available for use under the Creative Commons Attribution (CC-BY) license", described as "not 'viral'". — [Blades: Licensing](https://bladesinthedark.com/licensing), accessed 2026-10-16

**How a PC leaves a fight (opened).** Harm level 3 (severe): "your character is incapacitated and can't do anything unless you have help from someone else or push yourself". Overflow past the top row: "a catastrophic, permanent consequence (loss of a limb, sudden death, etc., depending on the circumstances)"; level 4 is "Fatal" — [Blades SRD: Consequences & Harm](https://bladesinthedark.com/consequences-harm). Stress: "When a PC marks their last stress box, they suffer a level of trauma... When you suffer trauma, you're taken out of action. You're 'left for dead' or otherwise dropped out of the current conflict, only to come back later, shaken and drained. When you return, you have zero stress." A fourth trauma retires the character. Pushing yourself costs 2 stress for +1d, +1 effect, or to act while incapacitated — [Blades SRD: Stress & Trauma](https://bladesinthedark.com/stress-trauma). All accessed 2026-10-16.

### Gaps
- The verbatim position table in the SRD mirror is marked "@TODO". I used the Foundry localization strings, which match the rulebook as I remember it but are a secondary source. (Not re-checked this pass.)
- Effect table: resolved above (1/2/3). Zero and extreme effect have no published tick count on the SRD page.
- The number of stress boxes (9, from memory) is not stated on the Stress & Trauma page; still unverified. Trauma taking a PC out of action and the fourth trauma retiring them are now verified.

## 2. Powered by the Apocalypse / Dungeon World: 10+ / 7-9 / 6-, Hack and Slash, GM moves, failing forward

### Takeaway
Dungeon World's Hack and Slash does damage on both a 10+ and a 7-9. The 7-9 band means "you deal your damage... and the enemy makes an attack against you". A miss is never a blank. The GM makes a move, which can be a soft move such as a threat the player can still react to, and the player always marks XP. Armor subtracts from damage. Monsters do not roll to hit; the PC's roll decides whether the monster's attack lands.

### Cited Findings
**License.** "This work is licensed under the Creative Commons Attribution 3.0 Unported License." The current LICENSE file also notes that it "includes material taken from the System Reference Document 5.1" — [Dungeon World LICENSE](https://raw.githubusercontent.com/Sagelt/Dungeon-World/master/LICENSE); README: "you're free to use this text any way you like so long as you credit the authors" — [Dungeon World README](https://raw.githubusercontent.com/Sagelt/Dungeon-World/master/README.md)

**Outcome bands.** "A total of 10 or higher (written 10+) is the best outcome. A total of 7–9 is still a success but it comes with compromises or cost. A 6 or lower is trouble, but you also get to mark XP." "Most moves won't say what happens on a 6-, that's up to the GM but you also always mark XP." — [Dungeon World, Playing the Game](https://raw.githubusercontent.com/Sagelt/Dungeon-World/master/text/Playing_the_Game.xml)

**Hack and Slash (verbatim).** "When you attack an enemy in melee, roll+Str. On a 10+ you deal your damage to the enemy and avoid their attack. At your option, you may choose to do +1d6 damage but expose yourself to the enemy's attack. On a 7–9, you deal your damage to the enemy and the enemy makes an attack against you." The move has no miss clause; the general 6- rule applies — [Dungeon World, Moves](https://raw.githubusercontent.com/Sagelt/Dungeon-World/master/text/Moves.xml)

**Volley.** "On a 10+ you have a clear shot—deal your damage. On a 7–9, choose one (whichever you choose you deal your damage): You have to move to get the shot placing you in danger of the GM's choice / You have to take what you can get: -1d6 damage / You have to take several shots, reducing your ammo by one." — [Dungeon World, Moves](https://raw.githubusercontent.com/Sagelt/Dungeon-World/master/text/Moves.xml)

**Defy Danger.** "On a 10+, you do what you set out to, the threat doesn't come to bear. On a 7–9, you stumble, hesitate, or flinch: the GM will offer you a worse outcome, hard bargain, or ugly choice." — [Dungeon World, Moves](https://raw.githubusercontent.com/Sagelt/Dungeon-World/master/text/Moves.xml)

**Defend.** "On a 10+, hold 3. On a 7–9, hold 1." Hold is spent 1 for 1 when you or your charge is attacked: "Redirect an attack from the thing you defend to yourself / Halve the attack's effect or damage / Open up the attacker to an ally giving that ally +1 forward against the attacker / Deal damage to the attacker equal to your level" — [dungeonworld-data npm package (source/moves/defend.md)](https://registry.npmjs.org/dungeonworld-data/-/dungeonworld-data-0.0.8.tgz)

**GM moves (full list).** "Use a monster, danger, or location move / Reveal an unwelcome truth / Show signs of an approaching threat / Deal damage / Use up their resources / Turn their move back on them / Separate them / Give an opportunity that fits a class' abilities / Show a downside to their class, race, or equipment / Offer an opportunity, with or without cost / Put someone in a spot / Tell them the requirements or consequences and ask" — [Dungeon World, GM chapter](https://raw.githubusercontent.com/Sagelt/Dungeon-World/master/text/GM.xml)

**When the GM moves.** "When everyone looks to you to find out what happens / When the players give you a golden opportunity / When they roll a 6-." — [DW GM chapter](https://raw.githubusercontent.com/Sagelt/Dungeon-World/master/text/GM.xml)

**Soft and hard moves.** "A soft move is one without immediate, irrevocable consequences... like having the goblin archers loose their arrows (show signs of an approaching threat) with a chance for them to dodge out of danger." "A soft move ignored becomes a golden opportunity for a hard move." "Dealing damage is almost always a hard move." "When you have a chance to make a hard move you can opt for a soft one instead." — [DW GM chapter](https://raw.githubusercontent.com/Sagelt/Dungeon-World/master/text/GM.xml)

**Narrating a move.** "No matter what move you make, always follow up with 'What do you do?'" "Never speak the name of your move." Example of a miss narrated as a move: "As you dodge the hulking ogre's club, you slip and land hard. Your sword goes sliding away into the darkness... What do you do?" "Make sure you're making use of moves beyond deal damage, even in a fight." — [DW GM chapter](https://raw.githubusercontent.com/Sagelt/Dungeon-World/master/text/GM.xml)

**Armor and damage.** "Armor mitigates damage; if a character has armor they subtract its value from the damage dealt. This might mean a blow is turned away completely—that's fine, it's what armor is for! Damage can never take a character below 0 HP." Cover is "1 armor for partial cover, 2 armor for major cover". Big, magic or poison sources get "ignores armor". Several attackers at once: "roll the highest damage among them and add +1 damage for each monster beyond the first." — [DW Playing the Game](https://raw.githubusercontent.com/Sagelt/Dungeon-World/master/text/Playing_the_Game.xml)

**Damage beyond HP.** "When the harm is specific, like an orc pulling your arm from its socket, HP should be part of the effect but not the entirety of it." — [DW Playing the Game](https://raw.githubusercontent.com/Sagelt/Dungeon-World/master/text/Playing_the_Game.xml)

**Probabilities** (my enumeration of 2d6+modifier):

| Modifier | 10+ | 7-9 | 6- |
|---|---|---|---|
| -1 | 8.3% | 33.3% | 58.3% |
| 0 | 16.7% | 41.7% | 41.7% |
| +1 | 27.8% | 44.4% | 27.8% |
| +2 | 41.7% | 41.7% | 16.7% |
| +3 | 58.3% | 33.3% | 8.3% |

### Inferences
- With Hack and Slash, a typical +1 or +2 attacker deals damage 72-83% of the time, compared with about 50-65% for a 5e attack. The price is that roughly 44% of attacks are trades (both sides hit).
- Because only the player rolls, one roll covers the whole exchange: my attack plus the monster's counterattack on a 7-9 or 6-. That removes the separate monster attack roll and message, which matters for Discord turn latency.
- "Mark XP on a miss" is a simple consolation reward that suits an 8+ audience.
- The soft-move concept ("show signs of an approaching threat... with a chance to dodge") gives an AI game master a ready way to make a miss interesting without punishing a child harshly.

### Gaps
- The longer designer commentary on Hack and Slash (when it triggers against a prepared enemy versus a helpless one) appears in the book but is not in Moves.xml. I did not locate the file that holds it.
- "Fail forward" is not a term the Dungeon World text uses (my grep found nothing). Its origin is unverified. A search summary of an EN World forum post (not opened) credits 13th Age (Jonathan Tweet) as the first self-conscious use, with Ron Edwards and Luke Crane as champions — [EN World "Failing Forward" thread, search summary only](https://www.enworld.org/goto/post?id=6782145)
- Apocalypse World itself is proprietary (Vincent and Meguey Baker). From memory (unverified), "Powered by the Apocalypse" is a naming permission, not an open license.

## 3. Ironsworn: action roll vs challenge dice, strong/weak/miss, momentum, progress tracks, Strike/Clash

### Takeaway
Ironsworn rolls an action die (d6 + stat + adds) against two d10 challenge dice. Beating both is a strong hit, one is a weak hit, neither is a miss. A miss always triggers "Pay the Price", so something happens. Momentum is a meter from -6 to +10 (start and reset +2) built up from successes. You can "burn" it to cancel challenge dice lower than your momentum, turning a miss into a hit after the roll. Combat damage fills a progress track instead of HP. The fight ends with a "decisive" progress roll in which momentum is ignored.

### Cited Findings
**Source and license.** The Datasworn JSON of the "Ironsworn Rulebook", author Shawn Tomkin, dated 2019-06-05, license https://creativecommons.org/licenses/by/4.0 — [@datasworn/ironsworn-classic 0.0.10 (json/classic.json)](https://registry.npmjs.org/@datasworn/ironsworn-classic/-/ironsworn-classic-0.0.10.tgz). The repo README: "The rulebook text and images fall under Creative Commons licenses, specifically CC-BY-4.0 or CC-BY-NC-4.0" — [Datasworn README](https://raw.githubusercontent.com/rsek/datasworn/main/README.md)
- **Correction (opened).** The full rulebook is *not* CC-BY. Its colophon: "Copyright ©2018 Shawn Tomkin. The text of this work is licensed under the Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International license... Updated June 9, 2019." — [Ironsworn Rulebook PDF, itch.io](https://shawn-tomkin.itch.io/ironsworn). The publisher's licensing page splits it: the complete rulebook text is CC BY-NC-SA 4.0 (non-commercial only), while the SRD and the asset-card and oracle text are CC BY 4.0 for commercial use (SRD at http://bit.ly/Ironsworn-srd) — [Tomkin Press: Licensing](https://tomkinpress.com/pages/licensing). Both accessed 2026-10-16. For Discord Quests, cite the rule ideas; don't copy rulebook prose beyond short quotes unless it comes from the CC BY SRD.

**Momentum, verbatim from the rulebook (opened, pp. 11-14).** — [Ironsworn Rulebook PDF](https://shawn-tomkin.itch.io/ironsworn), accessed 2026-10-16
- Range and feel: "Your momentum value ranges from a -6 to +10 and represents how you are faring in your quests." Positive momentum: "things are going your way. You have the advantage." "Momentum persists through scenes and between gaming sessions."
- Gaining: "In general, taking +1 momentum represents a minor advantage. Taking +2 momentum (or more) represents a major advantage."
- Losing: momentum is lost "as a choice when making moves, or as an outcome of a move--particularly on a weak hit or miss." For an undefined narrative loss (e.g. Pay the Price): "For a minor disadvantage or complication, suffer -1 momentum. For a major disadvantage or complication, suffer -2 momentum."
- **Burning:** "When you have positive momentum, after you roll your move, you may cancel any challenge dice that are less than your current momentum value. This gives you an automatic hit. If both challenge dice are less than your momentum value, you may cancel them both for a strong hit. If you burn momentum when only one of the challenge dice is less than your momentum value, the result of the other die stands--giving you a weak hit." Worked example: momentum +6, action score 4, challenge dice 5 and 8: burn cancels the 5, "This shifts your result from a miss to a weak hit."
- "Burning momentum is never required. Even if you score a miss on a move and have enough momentum to cancel the challenge dice, you can choose to suffer the failure and save your momentum for a more crucial moment."
- **Resetting:** "After you burn momentum, you must adjust your momentum track to your momentum reset value. The default reset is +2." One marked debility: reset +1; more than one: reset 0.
- **Negative:** "When your momentum is less than 0, and it matches the value of your action die, you must cancel your action die."
- **Minimum:** "Your momentum cannot drop lower than -6." A further loss at -6 triggers Face a Setback (lose health, spirit or supply, or progress, instead).
- **Max:** "Your max momentum starts at +10, and is reduced by 1 for every marked debility... If you are at your max and a move gives you an option to increase your momentum, you can't take that benefit."

**Other core rules (opened).** — [Ironsworn Rulebook PDF](https://shawn-tomkin.itch.io/ironsworn), accessed 2026-10-16
- Action score cap: "Your action score is never greater than 10--anything over that is ignored." (p. 8)
- Matches (both challenge dice equal): on a strong hit "a twist in the narrative, something interesting, or a new opportunity"; on a miss "a heightened negative outcome, a complication, or new danger." (p. 9)
- Progress tracks are "a row of ten boxes"; End the Fight counts "Only... fully filled boxes (those with four ticks)." (pp. 14, 82)
- **Initiative, not turns:** "Initiative is a special mechanic in combat. It reflects who is in control." Default: "When you score a strong hit, you take or retain initiative. When you score a weak hit or miss, you lose initiative." Even a suffer move (e.g. Endure Harm) on a strong hit takes initiative back. "Keep in mind that initiative doesn't represent who goes next." (p. 53)
- **Foes don't roll:** "NPCs do not make moves. When an NPC has initiative, they take actions in the fiction of the scene which force you to react." (p. 53)
- **End the Fight commentary:** "This is the all-or-nothing moment where the fight is decided." "You may not burn momentum on this roll, and you are not affected by negative momentum." "You can End the Fight only after you score a strong hit on a preceding move." "If you find yourself struggling against a tide of weak hits and misses, unable to make this move, consider building and then burning momentum to get back control." "End the Fight is not the only way to resolve a combat scene. You can flee. You can give up. You can negotiate or force a surrender." Allies fighting one foe "share a progress track. Any of you may attempt to End the Fight." (pp. 82-83)
- **Compel as a way out:** "Compel can be used as a shortcut to ending a combat." Force a surrender (+iron), surrender or negotiate (+heart), trick the foe into giving up (+shadow). "If there's no upside for them, you can't make this move." "Offering to surrender is a reactive response, and can be done when you don't have initiative." (p. 88)
- **Endure Harm at 0 health** (miss): roll on a table whose outcomes run from "The harm is mortal. Face Death" through "You are unconscious and out of action. If left alone, you come back to your senses in an hour or two" to "You are battered but still standing." (p. 90; the PDF's text layer scrambles which d100 band goes with which line, so the bands are not recorded here.)

**Outcome definitions.** "Miss: The score beats neither challenge die. Weak hit: The score beats one challenge die. Strong hit: The score beats both challenge dice." The challenge dice are 2 × d10 (`CHALLENGE_DIE_SIDES = 10`, `CHALLENGE_DICE_ROLLED = 2`) — [foundry-ironsworn ironsworn-roll.ts](https://raw.githubusercontent.com/ben/foundry-ironsworn/main/src/module/rolls/ironsworn-roll.ts)

**Momentum numbers, as implemented in code.** `MomentumField.MAX = 10`, `MIN = -6`, `INITIAL = 2`, `RESET_MIN = 0` — [foundry-ironsworn MeterField.ts](https://raw.githubusercontent.com/ben/foundry-ironsworn/main/src/module/fields/MeterField.ts)
- momentumReset = resetValue (2) − impact count, minimum 0.
- momentumMax = 10 − impact count, clamped to [-6, 10].
- Burning is allowed only when "momentum.value > momentumReset", and a burn sets momentum to the reset value. — [foundry-ironsworn character.ts](https://raw.githubusercontent.com/ben/foundry-ironsworn/main/src/module/actor/subtypes/character.ts)
- The Datasworn rules text agrees: "As with all debilities, conditions impact your max momentum and momentum reset." — [Datasworn classic.json](https://registry.npmjs.org/@datasworn/ironsworn-classic/-/ironsworn-classic-0.0.10.tgz)

**Negative momentum.** The action die is cancelled (counts as 0) when its value equals the absolute value of negative momentum: `momentum === -actionDie.value` → the action-die term becomes 0 — [foundry-ironsworn ironsworn-roll.ts](https://raw.githubusercontent.com/ben/foundry-ironsworn/main/src/module/rolls/ironsworn-roll.ts). UI strings: "Negative momentum canceled action die"; "Burn {value} momentum and reset to {resetValue}" — [foundry-ironsworn en.json](https://raw.githubusercontent.com/ben/foundry-ironsworn/main/system/lang/en.json)

**Burn condition, as worded in official asset text.** "you may burn momentum to cancel one (not both) of the challenge dice if your momentum is greater than the value of that die." This is an asset that restricts the normal rule to one die on End the Fight. Another asset: "Once per fight, you also take initiative when burning momentum to improve a miss to a weak hit." — [Datasworn classic.json](https://registry.npmjs.org/@datasworn/ironsworn-classic/-/ironsworn-classic-0.0.10.tgz)

**Enter the Fray (sets foe rank and harm-to-progress).** — [Datasworn classic.json](https://registry.npmjs.org/@datasworn/ironsworn-classic/-/ironsworn-classic-0.0.10.tgz)
- Ranks: "Troublesome foe: 3 progress per harm; inflicts 1 harm. Dangerous foe: 2 progress per harm; inflicts 2 harm. Formidable foe: 1 progress per harm; inflicts 3 harm. Extreme foe: 2 ticks per harm; inflicts 4 harm. Epic foe: 1 tick per harm; inflicts 5 harm."
- Strong hit: "+2 momentum. You have initiative."
- Weak hit: choose +2 momentum or take initiative.
- Miss: "combat begins with you at a disadvantage. Pay the Price. Your foe has initiative."

**Strike (you have initiative).** "On a strong hit, inflict +1 harm. You retain initiative. On a weak hit, inflict your harm and lose initiative. On a miss, your attack fails and you must Pay the Price. Your foe has initiative." — [Datasworn classic.json](https://registry.npmjs.org/@datasworn/ironsworn-classic/-/ironsworn-classic-0.0.10.tgz)

**Clash (foe has initiative).** "On a strong hit, inflict your harm and choose one. You have the initiative. [+1 momentum, or +1 harm]. On a weak hit, inflict your harm, but then Pay the Price. Your foe has initiative. On a miss, you are outmatched and must Pay the Price. Your foe has initiative." — [Datasworn classic.json](https://registry.npmjs.org/@datasworn/ironsworn-classic/-/ironsworn-classic-0.0.10.tgz)

**Other combat moves.** — [Datasworn classic.json](https://registry.npmjs.org/@datasworn/ironsworn-classic/-/ironsworn-classic-0.0.10.tgz)
- Turn the Tide: "Once per fight, when you risk it all, you may steal initiative from your foe to make a move... add +1 and take +1 momentum on a hit. If you fail to score a hit on that move, you must suffer a dire outcome."
- End the Fight: "When you make a move to take decisive action, and score a strong hit, you may resolve the outcome of this fight. If you do, roll the challenge dice and compare to your progress. Momentum is ignored on this roll." A strong hit means the foe is "killed, out of action, flee, or surrender". A weak hit gives the same result plus one cost, e.g. "Your victory is short-lived", "You suffer collateral damage", "Others won't forget". A miss: "you have lost this fight. Pay the Price."
- Battle (whole fight in one roll): strong hit "achieve your objective unconditionally. Take +2 momentum". Weak hit "achieve your objective, but not without cost. Pay the Price". Miss "defeated... Pay the Price."

**Momentum sources and costs in other moves.** — [Datasworn classic.json](https://registry.npmjs.org/@datasworn/ironsworn-classic/-/ironsworn-classic-0.0.10.tgz)
- Face Danger: strong hit "+1 momentum". Weak-hit costs include "Suffer -1 momentum" or 1 harm, 1 stress or -1 supply.
- Secure an Advantage: strong hit gives +2 momentum or "Make another move now... and add +1". Weak hit gives +1 momentum.
- Endure Harm: "If your health is 0, suffer -momentum equal to any remaining -health."

**Pay the Price.** "Make the most obvious negative outcome happen", or ask the Oracle between two outcomes, or roll on the table — [Datasworn classic.json](https://registry.npmjs.org/@datasworn/ironsworn-classic/-/ironsworn-classic-0.0.10.tgz)

**Starforged parallel.** "you may burn momentum to zero out one (not both) of the challenge dice if your momentum is greater than the value of that die" — [@datasworn/starforged](https://registry.npmjs.org/@datasworn/starforged)

**Probabilities** (my enumeration, d6+stat vs 2d10, strictly beat, score capped at 10, no adds):

| Stat | Strong | Weak | Miss |
|---|---|---|---|
| 1 | 15.2% | 39.7% | 45.2% |
| 2 | 23.2% | 43.7% | 33.2% |
| 3 | 33.2% | 43.7% | 23.2% |
| 4 | 45.2% | 39.7% | 15.2% |

### Inferences
- Momentum is a direct anti-whiff design. Small successes bank a resource that later converts a miss into a weak hit, or a weak hit into a strong one, after the dice are seen. A kid-friendly version could be "Courage points: +1 on a good roll, spend to turn a miss into a graze."
- Strike and Clash plus initiative mean a miss costs tempo (the foe acts next) as well as triggering Pay the Price. Every outcome moves the fight forward.
- Progress tracks (harm becomes progress boxes scaled by foe rank) let small hits always count toward ending the fight. The decisive End the Fight roll gives a clear "finisher" beat that suits Discord.

- The rulebook's two framing lines are the cleanest statement of the design: burning is "a powerful option to build on your success and deliver a decisive result or avoid dire failure", and it is "never required". It is a spend-after-the-roll resource, not a band. Its power scales with how much was banked: at +2 (the reset) it can only cancel a challenge die of 1, while at +6 it cancels any die of 5 or less.
- End the Fight bans burning, so momentum rescues ordinary exchanges but never the finishing roll. That keeps the climax uncertain, a useful guardrail if Discord Quests lets momentum rescue misses.
- "Initiative doesn't represent who goes next" plus "NPCs do not make moves" is a turn structure without foe turns: a miss hands the foe the initiative, and the foe's action is narrated as something the hero must react to.

### Gaps
- Resolved: the rulebook momentum pages were opened (above). They agree with the Foundry constants (max +10, min -6, reset +2, debility reductions) and correct one earlier claim: the rulebook is CC BY-NC-SA 4.0; only the SRD is CC BY 4.0.
- The Endure Harm table's d100 bands could not be read reliably from the PDF text layer.
- No designer commentary on *why* momentum resets to +2 (rather than 0) was found in the rulebook.

## 4. Genesys / FFG Star Wars narrative dice: success vs advantage on separate axes, failure with advantage, triumph/despair

### Takeaway
Genesys puts success/failure and advantage/threat on two independent axes. A failed attack can still generate Advantage, which buys useful side effects (recover strain, give an ally a boost die, take a free maneuver), so a miss can still do something. The two-axis rule is now confirmed by an opened review, and the combat spending table by an opened (unofficial) transcription of the FFG Star Wars RPG table, which Genesys inherits. The Genesys Core Rulebook itself still could not be opened: it is proprietary with no SRD, edge-studio.net returns 403, and FFG's Genesys product page no longer exists.

### Cited Findings
**Official FFG material reachable (opened, but no dice rules).** Genesys FAQ & Errata v1.1 and the Genesys GenCon adventure, both from FFG's CDN via archive.org. Neither contains the dice or spending rules; the adventure confirms the combat profile of a foe: "Soak Value 3 Wound Threshold 5 M/R Defense 0/0" for a minion-level foe and armor as "+1 soak". — [genesys_faq_and_errata_v11.pdf (archived)](https://web.archive.org/web/2022id_/https://images-cdn.fantasyflightgames.com/filer_public/36/48/364883c8-3f06-4821-9126-f50e4bec36c9/genesys_faq_and_errata_v11.pdf); [genesys_gencon_adventure_lowres.pdf (archived)](https://web.archive.org/web/2022id_/https://images-cdn.fantasyflightgames.com/filer_public/56/75/5675bba2-a5a2-4161-b4c0-eaed85a3d0b7/genesys_gencon_adventure_lowres.pdf). Accessed 2026-10-16. © Fantasy Flight Games, all rights reserved.

**Two axes, failure with advantage (opened review, secondary).** "The two cancel out, but it's important for newcomers to note that they work independently of Success and Failure. You are going to have successful rolls with leftover Threat, and rolls that failed with leftover Advantage." Triumph is on the Proficiency die and Despair on the Challenge die; "while those aspects of the symbols can be canceled out nothing can get rid of the Triumph or Despair aspects." — Seamus Conneely, [Genesys Review: Part One, Cannibal Halfling Gaming, 2017-12-01](https://cannibalhalflinggaming.com/2017/12/01/genesys-review-part-one/), accessed 2026-10-16

**Combat spending table (opened, unofficial transcription of the FFG *Star Wars Roleplaying Game* table; it cites "Table 6-10: Critical Injury Result", the Star Wars core-book numbering, not Genesys's).** Vendored in the Star Wars FFG Foundry system as `lib/@swrpg-online/dice/dist/hints.js` (MIT-licensed code; the rules text it reproduces is FFG's) — [StarWarsFoundryVTT/StarWarsFFG](https://github.com/StarWarsFoundryVTT/StarWarsFFG), accessed 2026-10-16. Short paraphrase of the entries:
- **1 Advantage or 1 Triumph:** recover one strain (repeatable); add a boost die to the next allied active character's check; notice a single important point; inflict a Critical Injury "with a successful attack that deals damage past soak" (cost varies); activate a weapon quality (cost varies).
- **2 Advantage or 1 Triumph:** "Perform an immediate free maneuver that does not exceed the two maneuver per turn limit"; add a setback die to the target's next check; add a boost die to any ally's next check.
- **3 Advantage or 1 Triumph:** negate the target's defensive bonuses until the end of the round; ignore environmental penalties; disable the opponent or a piece of gear instead of dealing wounds (temporary, agreed with the GM); +1 melee or ranged defense until the end of your next turn; "Force the target to drop a melee or ranged weapon".
- **1 Triumph:** upgrade the difficulty of the target's next check; "Do something vital"; upgrade any ally's next check. **2 Triumph:** destroy a piece of the target's equipment.
- **Threat side:** 1 Threat: the active character suffers 1 strain, or loses the benefit of a prior maneuver (such as cover). 2 Threat: an opponent may take a free maneuver; the active character or an ally gets a setback die. (The file's comment puts "add a boost die to the targeted character's next check" under 2 Threat, but its data entry costs it at 1 Threat.) 3 Threat: fall prone; give the enemy "a significant advantage". Despair: the ranged weapon runs out of ammunition; upgrade an ally's next check; the tool or melee weapon is damaged.
- Only the Critical Injury entry says it needs a *successful* attack. The others carry no success condition, which fits "rolls that failed with leftover Advantage" can still be spent.

**Turn economy (opened review).** "You get an Action and a Maneuver a turn, and can spend Strain to get another Maneuver." — [Cannibal Halfling Gaming review](https://cannibalhalflinggaming.com/2017/12/01/genesys-review-part-one/)

**Fan combat summary (opened).** "If you do at least one Wound, you may spend [Advantage] equal to the Crit rating to get a Critical Injury"; "when you exceed your Wound Threshold you're unconscious, and suffer a Critical Injury"; for strain, "you're probably unconscious, or perhaps severely dazed and staggered." Other spends "as on p. 104" (book not named). By RogerBW, no license — [Genesys Combat Summary (tekeli.li)](https://www.tekeli.li/firefly-genesys/combat.html), accessed 2026-10-16

#### Unverified (search-engine summaries, pages not opened)
- The player controlling the active character decides how to spend Advantage and Triumph unless the GM has a reason to decide — [CitizenKeen Genesys write-up, search summary only](https://writeups.letsyouandhimfight.com/citizenkeen/genesys/)
- The Genesys combat spending table is "Table I.6–2" around p. 103-104 of the core book; tekeli.li's "p. 104" points the same way, but the book was not opened.
- Forum report: on a failed attack, Critical Injuries and weapon qualities cannot be triggered, so GMs narrate Advantage as disarm or knock prone; a player spent Advantage on a miss to "shove them back... out of engaged range" — [FFG forum archive "Handling 'Odd' Results", search summary only](https://ffg-forum-archive.entropicdreams.com/topic/265644-handling-odd-results)
- A reviewer's criticism: in combat Advantage "was a metacurrency with specific spends", but outside combat it became "hand-wavy", and Advantage or Threat appeared on nearly every roll, which felt tedious — [EN World "Grading the Genesys System", search summary only](https://www.enworld.org/threads/grading-the-genesys-system.702979/post-9282732)

#### Still from memory (unverified)
- Dice sizes and colors (Ability d8 green, Proficiency d12 yellow, Difficulty d8 purple, Challenge d12 red, Boost d6 blue, Setback d6 black); at least 1 net success needed; damage = weapon base + 1 per net success, minus soak (Brawn + armor).
- Lineage: the narrative dice began in WFRP 3e (FFG, 2009), designed by Jay Little.
- Corrections to the earlier memory list: "destroy a piece of the target's equipment" costs **2** Triumph in the transcribed table, not 1. The table also has a 3-Advantage "disable the opponent instead of dealing wounds" entry, which the memory list lacked.

### Inferences
- The separate "side-effect" axis is the cleanest published answer to "a miss does nothing". The game can tell a child "you missed, but you get 2 sparks: shove the goblin back, or give your friend a bonus". It needs a short, fixed spend menu or it becomes slow (the reviewer's complaint).
- Custom symbol dice are a poor fit for a Discord bot UI. The two-axis idea can be emulated on a d20: for example, a miss by 1-4 earns 1 "spark".
- The table is priced in tiers of 1/2/3. The cheapest spends help *allies* or the next roll (boost die, recover strain); 2 buys tempo (a free maneuver); 3 buys a condition on the foe (disarm, lose cover, disable). For a kids' game that maps to a three-button menu on a near-miss: "help a friend", "move", "knock their weapon away".
- The Threat side mirrors it, so the same menu run backwards gives the foe's side effects on a hero's lucky hit or a foe's miss. That only matters if foes get the feature too (design question 3).

### Gaps
- The Genesys Core Rulebook's own Table I.6-2 is still unopened; the spending table above is the Star Wars RPG version, transcribed by a third party. The two are believed to be near-identical, but that is not verified.
- Whether each spend works on a failed check is supported only by a reviewer ("rolls that failed with leftover Advantage") and by the transcription marking only the Critical Injury spend as needing success.
- No designer rationale was found or opened.
- License: proprietary (© Fantasy Flight Games; the line is now with Edge Studio/Asmodee); no SRD. Blocked: edge-studio.net (403), images-cdn.fantasyflightgames.com live (403).

## 5. Savage Worlds: raises, Shaken vs Wounds, damage vs Toughness, Soak, near misses

### Takeaway
Savage Worlds pays out in steps of 4 ("raises") over a target number. Damage that meets Toughness makes the target Shaken, which costs them tempo. Each raise above that adds a Wound. Soak rolls (spend a Benny, roll Vigor) cancel Wounds. A hit that meets Toughness still does something (Shaken). A hit that falls short of Toughness does nothing ("beaten up a bit but there's no game effect"). All of this is now verified from Pinnacle's own free Test Drive rules. Foes take real turns: initiative is a card deal, and a group of foes shares one card.

### Cited Findings
**Source.** *Deadlands the Weird West: Blood on the Range (Savage Worlds Test Drive #SWADE)*, Pinnacle's free Test Drive, in the official Foundry VTT module that Pinnacle publishes (author "Pinnacle Entertainment Group", v3.0.0). Its journal pages "Basics" and "Combat" hold the Test Drive rules text. — [gitlab.com/peginc/dlww-blood-on-the-range (module.json, swade-test-drive-v3.0.0.zip)](https://gitlab.com/peginc/dlww-blood-on-the-range), linked from [foundryvtt.com/packages/swade-test-drive](https://foundryvtt.com/packages/swade-test-drive); PDF store page (free, checkout-only, not downloaded): [peginc.com Test Drive](https://peginc.com/store/deadlands-the-weird-west-blood-on-the-range-savage-worlds-test-drive-swade/). Accessed 2026-10-16. **License:** "Deadlands, Savage Worlds, all unique characters, creatures, artwork, logos, trademarks, and the Pinnacle logo are © 2020 Pinnacle Entertainment Group. All Rights Reserved." Free to download, not open-licensed; short quotes only.

**Trait tests (opened).**
- "Each Trait is rated from d4 to d12, with d6 being average and d12 being world class." "The usual target number for most tasks is 4."
- **Raises:** "A roll that's 4 points over the TN is called a 'raise.'"
- Wild Die: Wild Cards roll an extra d6 and use the higher. Critical Failure is a 1 on both; it "cannot be rerolled, even with Bennies". Aces: dice that roll their maximum are rolled again and added. Unskilled: d4 − 2.
- Opposed rolls: "A basic success (4) is still required for success, and every four points over the target's total is a raise."

**Derived stats (opened).** "Parry is equal to 2 plus half of the character's Fighting die." "Toughness is equal to 2 plus half the character's Vigor die. Add the bonus granted by armor worn on the torso to this value."

**Attacks and damage (opened).**
- Melee: roll Fighting against the opponent's Parry as the TN; "With a raise, you add an additional +1d6 bonus damage". Ranged: Shooting at TN 4 at short range, −2 medium, −4 long; cover −2/−4/−6.
- Melee damage is the Strength die plus the weapon die; ranged damage is fixed (a Peacemaker does 2d6+1). Damage can Ace. "Don't add additional dice for more than one raise."
- **Resolving damage:** "If the damage roll is less than the target's Toughness, the victim is beaten up a bit but there's no game effect. If the damage is equal to or greater than Toughness, he's Shaken and might be wounded as well."
- **Shaken:** "If the damage of an attack is a simple success (0–3 points over Toughness), the target is Shaken... If the target was already Shaken, she remains so and takes a Wound as well."
- **Wounds:** "Each raise (every 4 full points over the target's Toughness) on the damage roll means the victim suffers a wound. Extras only have one wound and are Incapacitated (out of the fight). Wild Cards can take three Wounds. If they take more than that, they're out of the fight as well." Each Wound gives −1 to Pace and all Trait rolls, "up to a maximum penalty of −3."
- Worked example: Toughness 5. Damage 5-8 means Shaken; 9-12 means a Wound plus Shaken.
- **Shaken effects:** a Shaken character "may only take free actions, such as moving". At the start of their turn they roll Spirit as a free action; on a success "she's no longer Shaken and may act normally." A Benny removes Shaken "at any time (even when it's not her turn)."
- **Soaking:** "Immediately after determining Wounds from a single attack, a character may spend a Benny to make a Vigor roll. Each success and raise on the roll reduces the number of wounds suffered from that attack by one... If the character Soaks all the Wounds, she's also no longer Shaken."
- **Incapacitation:** an immediate Vigor roll. Critical Failure: dies. Failure: Bleeding Out (a Vigor roll each turn; a raise stabilizes, a failure dies). Success: stabilizes, unconscious for 2d6 hours.

**Bennies (opened).** Player Wild Cards start each session with three; the GM gets one per player character, plus two for each of her Wild Cards. The GM "should occasionally award a player a Benny for roleplaying her character's Hindrances, trying something heroic, telling a cool story, or simply making everyone laugh." Uses: reroll a Trait ("keeping the best total rolled", except a Critical Failure); recover from Shaken; Soak; draw a new Action Card; reroll damage; regain 5 Power Points; influence the story.

**How foes act (opened).** "Every Wild Card is dealt an 'Action Card' face up... Every villain or each general type of Game Master character share a card." The GM counts down from Ace to Deuce. A Joker lets you act at any time this round and "add +2 to all your Trait and damage rolls this round! All players also receive a Benny." Multi-actions: up to three actions, −2 to all for each action beyond the first.

#### Unverified (search-engine summaries, pages not opened)
- One analysis estimates a strong fighter hitting with a raise one-shots an unarmored Toughness-5 person about 1 time in 6 — [Gaming Ballistic "Violent Resolution", search summary only](https://gamingballistic.com/2015/05/17/violent-resolution-thats-going-to-leave/)

#### Still from memory (unverified)
- **Tests.** Non-damaging Tests (e.g. Intimidation or Taunt vs Spirit/Smarts) inflict Distracted or Vulnerable, or Shaken on a raise. The Test Drive doesn't include the Test rules (its "Additional Rules" page covers only setting rules), so this needs the SWADE core book.

### Inferences
- "Shaken" is a middle band between "no effect" and "real damage". It is the Savage Worlds version of a graze: the hit costs the enemy tempo without needing a damage number. Its band is a fixed 4 wide (0-3 over Toughness), the same step as a raise, so the near-miss question gets a fixed answer in this system: 4 points, regardless of the attacker's stats.
- Savage Worlds layers both answers to design question 1. The band (Shaken) is fixed, and the resource (a Benny reroll, three per session, more for heroics) is spent after the roll. The Benny reroll keeps the better result, so it works like a one-off advantage bought after seeing the dice.
- Being Shaken twice becomes a Wound, so repeated "graze" results add up to real damage. That is a ready-made rule for partial hits stacking.
- The Joker's "+2 to all Trait and damage rolls this round", handed out at random, is a published case of a flat +2 momentum bonus rather than an extra die.
- Mook handling (any Wound takes out an Extra) cuts down long low-damage slogs. This is relevant for keeping Discord fights to few turns.

### Gaps
- Resolved from the Test Drive: Shaken recovery, Soak, the Wound cap, and double-Shaken. Correction: the earlier note filed "a hit on an already-Shaken target causes a Wound" under older editions only. The SWADE Test Drive has it too.
- The Test rules (Distracted/Vulnerable) and the full core book are not covered by the Test Drive. No designer rationale was opened.
- License: proprietary (Pinnacle Entertainment Group, all rights reserved); fan-license terms not checked.

## 6. Armor as damage reduction: RuneQuest/Mythras, WFRP 4e, and the open systems; effects on hit rates and feel

### Takeaway
Under damage-reduction armor, armor no longer makes you harder to hit; it makes hits weaker. That raises the share of attacks that connect, but a fully absorbed hit can become a new kind of whiff. The published fixes are a floor or a consolation: WFRP 4e's "Minimum 1 Wound", Fate's optional Armor rating (a hit reduced to 0 shifts gives a boost), Dungeon World's "a blow is turned away completely—that's fine", and Blades' armor as a spendable box. Mythras is now verified from the free Mythras Imperative: a successful parry cuts damage by relative weapon size, Armour Points per location subtract what gets through, and Special Effects are won from the difference in success levels whether or not damage lands. A defender can even parry a *missed* attack to win effects. WFRP 4e's Advantage gain and loss rules are still unverified: cubicle7games.com is blocked. Only the Foundry system's code and strings were opened.

### Cited Findings
**Fate Core, optional Weapon/Armor ratings** (open, verified).
- "An Armor value reduces the shifts of a successful hit. So, Armor:2 makes any hit worth 2 less than usual. If you hit, but the target's Armor reduces the shift value to 0 or below, you get a boost to use on your target but don't do any harm."
- "A Weapon value adds to the shift value of a successful hit... This counts for ties, so when you're using a weapon, you inflict stress on a tie instead of getting a boost."
- Scale: Weapon 1-4. Armor:1 is padded clothes, Armor:2 padding and mail, Armor:3 mail and plate, Armor:4 full plate.

— [Fate Core SRD markdown](https://raw.githubusercontent.com/fate-srd/fate-srd-content/main/docs/markdown/fate-core.md)

**Dungeon World** (open, verified). "if a character has armor they subtract its value from the damage dealt. This might mean a blow is turned away completely—that's fine, it's what armor is for!" Cover gives 1-2 armor. The "ignores armor" tag covers big, magic or poison sources — [DW Playing the Game](https://raw.githubusercontent.com/Sagelt/Dungeon-World/master/text/Playing_the_Game.xml)

**Blades** (open, verified). Armor never prevents a hit. You mark an armor box to drop harm by a level; heavy armor gives a second box. Boxes refresh per score — [Blades SRD](https://raw.githubusercontent.com/amazingrando/blades-in-the-dark-srd-content/master/Blades-in-the-Dark-SRD.md)

**WFRP 4e, from the Foundry VTT system's strings.** That system is officially licensed by Cubicle 7 according to my memory, unverified.
- The damage breakdown includes "Minimum 1 Wound", "Opposed SL", "Defender SL", and AP-ignoring weapon traits (Penetrating, Weakpoints, "Undamaging: {originalAP} AP * 2").
- Settings: "Instead of +10 per Advantage, you gain +1 SL per Advantage on successful tests" (a house-rule option, which implies the default is +10 per Advantage). "Advantage Cap... such as 2, 4 or more". "Cap Advantage at IB" (Initiative Bonus). "Group Player and Enemy Advantage together (as described in Up in Arms)".

— [WFRP4e-FoundryVTT en.json](https://raw.githubusercontent.com/moo-man/WFRP4e-FoundryVTT/master/static/lang/en.json)

**WFRP 4e, from the Foundry system's code (opened, shallow clone, accessed 2026-10-16).** The README says Cubicle 7 "was open to supporting Foundry officially". The code itself is not rules text.
- The `advantagemax` setting ("Advantage Cap... Cap Advantage at a pre-arranged limit, such as 2, 4 or more") defaults to **10**. `capAdvantageIB` ("Sets the max value of Advantage as the character's Initiative Bonus") defaults to **false** — `src/hooks/init.js`.
- `advantageBonus` defaults to **10** (i.e. +10 to tests per Advantage) — `src/apps/homebrew-settings.js`.
- Advantage is zeroed for every combatant when combat ends (`clearCombatantAdvantage`) — `src/system/combat.js`.
- The current system does **not** automate gaining or losing Advantage; the actor only exposes `setAdvantage` / `modifyAdvantage`. The gain/loss triggers can't be read from code.
- Group Advantage (players vs enemies, "as described in Up in Arms") is an optional setting.
— [moo-man/WFRP4e-FoundryVTT](https://github.com/moo-man/WFRP4e-FoundryVTT)

**WFRP 4e errata (opened, partial).** Only an archive.org copy could be reached, and its capture is truncated at 1 MB. The readable part has one Advantage-related change, to the Unstable creature trait: "Whenever it ends a Round engaged with any opponents with higher Advantage, the creature is driven back... It loses as many Wounds as the difference." — [WFRP_Errata_28_Feb.pdf (archived)](https://web.archive.org/web/20200925175912id_/https://www.cubicle7games.com/wp-content/uploads/2019/08/WFRP_Errata_28_Feb.pdf), accessed 2026-10-16

**Mythras Imperative (opened).** *Mythras Imperative*, 3rd edition PDF (file "TDM110 Mythras Imperative 3rd Edition 310721.pdf"), free from [design-mechanism.itch.io/mythras-imperative](https://design-mechanism.itch.io/mythras-imperative), accessed 2026-10-16. **License:** that PDF says "This edition of Mythras Imperative is copyright © 2019" and that its contents "can also be used as the basis for your own game variations under the MYTHRAS Gateway License." The publisher's store now lists a $0 Mythras Imperative PDF as an "ORC-licensed d100 game system" (SKU TDMORC002-PDF; [thedesignmechanism.com/mythras-imperative](https://thedesignmechanism.com/mythras-imperative/)). That is probably a newer edition; I did not download it, because the store delivers it through a cart.
- **Attack and parry sequence (p. 20, verbatim steps):** "1. On his turn the attacker spends an Action Point, rolls against his Combat Style... 2. If desired, the defender spends an Action Point, rolls against his Combat Style... 3. The success level of the results are compared as per a Differential Roll... 4. Any difference grants the successful combatant with the superior roll one or more Special Effects. 5. If the attacker achieved a success or critical, he may roll weapon damage... 6. If the defender achieved a success or critical, reduce any damage inflicted according to the comparative sizes of the weapons involved. 7. Reduce any remaining damage by the Armour Points of natural or worn protection." "Note that any Special Effects generated by the exchange are independent of whether or not damage is inflicted. It is quite possible for a defender to gain the higher success level, yet still suffer injury."
- **Parry by size:** "Parrying an attack with a weapon or shield of equal or greater Size deflects all damage. Parrying with a weapon or shield of one Size less only deflects half damage. Parrying with a weapon or shield two or more Sizes less fails to deflect any damage." Sizes: Small, Medium, Large, Huge, Enormous.
- **Armour:** "Any damage which penetrates the defender's parry, is further reduced by the Armour Points of any natural protection (such as scales or a shell) or worn armour they possess. If the defender has both, then the two stack together." Armour table, ancient and medieval column, as far as the two-column layout can be read: furs and hides 1 AP, through brigandine 4, mail 6, plated mail 7, Gothic plate 8. Humanoid hit locations on 1d20: legs 1-3/4-6, abdomen 7-9, chest 10-12, arms 13-15/16-18, head 19-20. "The highest Armour Point value of armour worn by a character acts as a penalty to their Strike Rank."
- **Action Points:** "All characters get 2 Action Points per round", spent on attacks *and* parries; "Unusued Action Points do not carry over".
- **Parrying a missed attack:** "If the attacker misses his initial attack roll, the defender has the option of whether or not to spend an Action Point to parry... a skilled defender can use this to his advantage to gain one or more Special Effects, potentially weakening or incapacitating a foe." Not parrying: the defender "is treated as having automatically rolled a failure", which grants a successful attacker Special Effects.
- **Special Effects:** "Fighting is far more than simply injuring or killing an opponent. Combative arts teach many methods of defeating a foe, perhaps rendering them helpless or forcing them into situations where they must capitulate, without necessarily needing to actually cause them harm." Effects "must be selected before Damage and Hit Location". Examples: Bypass Armour ("On a critical the attacker finds a gap in the defender's natural or worn armour"), Trip Opponent (an opposed Brawn, Evade or Acrobatics roll, or the target falls prone), Disarm, Stun Location ("If the blow overcomes Armour Points"), Withdraw ("The defender may automatically withdraw out of reach, breaking off engagement"), Sunder (damage beyond the armour's AP permanently reduces that armour's AP).
- **Differential levels:** critical vs failure = 2 levels; success vs failure = 1; critical vs fumble = 3; both fail = "No Benefit" (Differential Roll Results table, p. 16).
- **Wounds and leaving the fight:** a location at 0 HP or below is a Serious Wound (the victim "cannot attack (but can still parry or evade) for their next 1d3 turns", plus an Endurance roll or the limb is useless, or unconsciousness for the abdomen, chest or head). A location at minus its starting HP is a Major Wound: "The character is immediately incapacitated, unable to continue fighting." A Luck Point can downgrade a Major Wound to Serious.

#### Unverified (search-engine summaries, pages not opened)
- **WFRP 4e damage.** Any armour at the hit location and the target's Toughness Bonus are subtracted from total damage, and the rest is suffered as Wounds. "If all the damage is soaked by armour and/or toughness bonus, an attack will still deal a minimum of 1 wound." The same summary says this is unchanged from 1e/2e. Melee is an opposed test (WS); the side with more SL wins — [d20radio WFRP 4e Review Part 5 – Combat, search summary only](https://www.d20radio.com/main/wfrp-4th-edition-review-part-5-combat/)
- **WFRP 4e Advantage.** +10 per Advantage to combat tests. You lose Advantage when you lose an opposed test, suffer a condition, or take Wounds. You gain +1 Advantage for winning an opposed test or defeating an opponent. Fan sources disagree on the details — [tekeli.li PbP WFRP thread, search summary only](https://discussion.tekeli.li/t/pbp-warhammer-fantasy-roleplay-discussion-thread/833); [WFRP4 GM Screen copy, search summary only](https://pdfcoffee.com/wfrp4-game-master-screen-pdf-free.html)
- **Mythras forum claims, now checked against the Imperative:** the size rule matches the opened text. The forum's extra clause, that an undersized parry "will prevent a special effect", is not in the Imperative text I read. The "does AP degrade?" disagreement: in the Imperative, AP drops only through the Sunder special effect. — [BRP Central "Spear?" thread, search summary only](https://basicroleplaying.org/topic/15988-spear/page/3/); [Design Mechanism forum "Unarmed Parries", search summary only](https://www.tapatalk.com/groups/designmechanism/unarmed-parries-t1934.html)
- **Designer and blog commentary on DR armor exists but was not opened:** [Armor as Damage Reduction (Goodreads author blog)](https://www.goodreads.com/author_blog_posts/23566241-armor-as-damage-reduction); [Armour as Wound Reduction (itch devlog)](https://eucatastrophic.itch.io/blog/devlog/867454/armour-as-wound-reduction)

#### Still from memory (unverified)
- **RuneQuest: Roleplaying in Glorantha.** Armor points per hit location. Parrying weapons and shields absorb damage up to their HP and the excess passes through. (Chaosium; not opened. Chaosium's BRP SRD under ORC was not checked.)
- **WFRP 4e Advantage (core rulebook).** Gain +1 for winning an opposed test, charging, or defeating a foe. Lose all of it on losing an opposed test or taking a Wound. +10 per Advantage to tests. The core cap and the end-of-round rule are not pinned down. Proprietary (Games Workshop / Cubicle 7).

#### Comparison baseline (my computation)
5e attack, d20+5 vs AC:

| AC | Hit chance |
|---|---|
| 12 | 70% |
| 13 | 65% |
| 14 | 60% |
| 15 | 55% |
| 16 | 50% |
| 17 | 45% |
| 18 | 40% |

At typical AC 13-16, 35-50% of attacks do nothing.

### Inferences
- Moving defense from to-hit to damage reduction raises the share of turns where the attack connects. But if DR can absorb a whole hit, "clang, no damage" is just a whiff with different flavor text. Every DR system above that is designed for momentum adds a floor (WFRP minimum 1 Wound), a consolation (Fate boost on a 0-shift hit), or a side effect that ignores armor (Mythras special effects).
- For a 5e-SRD-based game, a hybrid is the smallest change. Keep AC to hit, but convert near misses (miss by 1-4, mirroring the Savage Worlds raise size) into a "graze": a minimum of 1 damage or a small condition. Or keep AC as the damage threshold, as armor does in Blades and Dungeon World.
- Opposed rolls with Advantage (WFRP) create momentum: winning an exchange makes the next one easier even without damage. But losing all Advantage on taking a Wound (if the unverified summaries are right) can feel punishing for young players. Every implementation I opened adds a cap (a default of 10 in Foundry, or the Initiative Bonus as an option) and wipes Advantage when the fight ends.
- Mythras' "parrying a missed attack" is the inverse of a near-miss consolation: the *defender* profits from the attacker's miss. A kids' game should probably not copy that for heroes, but it is a clean model for a hero's defensive move against a foe's miss (design question 3).
- Mythras splits each exchange into two independent outputs, effects from the success-level gap and damage from the hit. That is the same separation as Genesys's two axes, built on a single d100 roll. It suggests that the "partial hit" payoff can be an effect (trip, disarm, push back) rather than reduced damage.

### Gaps
- WFRP 4e: the core rulebook's Advantage rules (gain triggers, loss triggers, cap) remain unverified. cubicle7games.com returns 403, no free official quick-start was found, the archived errata is truncated, and the Foundry system no longer automates Advantage.
- Mythras: the newer ORC-licensed Imperative was not downloaded (cart delivery). RuneQuest was not opened.
- No quantitative study of DR-vs-AC effects on "feel" was found or opened.

## 7. Fate Core: four outcomes, succeed at a cost, ties, invoking after the roll

### Takeaway
Fate has four bands relative to the opposition. Fail (below) gives the GM the choice of failure, success at a serious cost, or a mechanical consequence. A tie gives success at a minor cost or a lesser version. Succeed is +1-2 shifts. Succeed with style is +3 or more. On attacks, a tie still earns a boost. Players can invoke aspects after seeing the dice for +2 or a reroll, so they can save a bad roll before it lands.

### Cited Findings
**License.** The Fate SRD files come from Evil Hat. Licensing is CC-BY or OGL per fate-srd.com/official-licensing-fate ("You can make a language translation for Fate under both the CC-BY or the OGL licenses") — [fate-srd-content README](https://raw.githubusercontent.com/fate-srd/fate-srd-content/main/README.md)

**The four outcomes (verbatim).** — [Fate Core SRD markdown](https://raw.githubusercontent.com/fate-srd/fate-srd-content/main/docs/markdown/fate-core.md)
- Fail: "If you roll lower than your opposition, you fail. This means one of several things: you don't get what you want, you get what you want at a serious cost, or you suffer some negative mechanical consequence."
- Tie: "you get what you want, but at a minor cost, or you get a lesser version of what you wanted."
- Succeed: "higher than your opposition by 1 or 2 shifts... you get what you want at no cost."
- Succeed with Style: "higher than your opposition by 3 or more shifts... you also get an added benefit on top of that."

**Serious vs minor cost (GM guidance).** "A serious cost should make the current situation worse somehow... Bring in another source of opposition... or ask the player to take a consequence at their lowest free level, or give someone who opposes the PC an advantage with a free invocation." "A minor cost should add a story detail that's problematic or bad for the PC, but doesn't necessarily endanger progress. You could also ask the PC to take stress or give someone who opposes the PCs a boost." — [Fate Core SRD](https://raw.githubusercontent.com/fate-srd/fate-srd-content/main/docs/markdown/fate-core.md)

**Overcome.** "When you fail an overcome action, you have two options. You can simply fail... or you can succeed at a serious cost." "When you tie an overcome action, you attain your goal... but at a minor cost." — [Fate Core SRD](https://raw.githubusercontent.com/fate-srd/fate-srd-content/main/docs/markdown/fate-core.md)

**Attack.** — [Fate Core SRD](https://raw.githubusercontent.com/fate-srd/fate-srd-content/main/docs/markdown/fate-core.md)
- Fail: "you don't cause any harm to your target."
- Tie: "you don't cause any harm, but you gain a boost."
- Succeed: "you inflict a hit on your target equal to the number of shifts you got", which the target must "buy off" with stress or consequences, or be taken out.
- Succeed with style: you may "reduce the value of your hit by one to gain a boost as well."

**Defend.** Tie: "you grant your opponent a boost." Succeed with style: "you also gain a boost as you turn the tables momentarily." — [Fate Core SRD](https://raw.githubusercontent.com/fate-srd/fate-srd-content/main/docs/markdown/fate-core.md)

**Invoking after the roll.** Spend a fate point to invoke an aspect: "reroll the dice or add +2 to your roll." "It doesn't matter when you invoke the aspect, but usually it's best to wait until after you've rolled the dice to see if you're going to need the benefit." You can invoke multiple different aspects, but not the same one twice. Free invocations (from Create an Advantage) stack with paid ones for +4. Succeeding with style on Create an Advantage gives two free invocations — [Fate Core SRD](https://raw.githubusercontent.com/fate-srd/fate-srd-content/main/docs/markdown/fate-core.md)

**Stress and consequences** (absorb hits; armor-like). Physique and Will add stress boxes. "An extreme consequence will absorb up to 8-shifts of a hit, but at a very serious cost" (you replace one of your aspects) — [Fate Core SRD](https://raw.githubusercontent.com/fate-srd/fate-srd-content/main/docs/markdown/fate-core.md)

**Stress defaults (opened).** "By default, all characters get a 1-point and a 2-point box. You may get additional, higher-value stress boxes depending on some of your skills (usually Physique and Will)." A moderate consequence absorbs 4 and a severe one 6 (worked example), and a mild one is "worth two shifts". Nameless NPCs "only have one or two stress boxes, if any... they're no match for a typical PC." — [Fate Core SRD](https://raw.githubusercontent.com/fate-srd/fate-srd-content/main/docs/markdown/fate-core.md), accessed 2026-10-16

**Conceding and being taken out (opened).** — [Fate Core SRD](https://raw.githubusercontent.com/fate-srd/fate-srd-content/main/docs/markdown/fate-core.md), accessed 2026-10-16
- Concede: "you can interrupt any action at any time before the roll is made to declare that you concede the conflict... once dice hit the table, what happens happens." "Concession gives the other person what they wanted from you... You're out of the conflict, period." "You get a fate point for choosing to concede" plus one per consequence taken in the conflict. "You get to avoid the worst parts of your fate."
- Taken out: "If you don't have any stress or consequences left to buy off all the shifts of a hit, that means you're taken out", and then "the person who took you out gets to decide what your loss looks like".
- Character death: "We recommend the latter approach [not killing PCs on bad luck], mainly for the following reason: most of the time, sudden character death is a pretty boring outcome when compared to putting the character through hell."
- NPCs: "Supporting NPCs should not fight to the bitter end, given the option. Instead, have them concede conflicts often, especially early in a story, and especially if the concession is something like 'They get away.'"

**Probabilities** (my enumeration). 4dF gives -4..+4 with 0 at 23.5%, ±1 at 19.8% each, ±2 at 12.3%, ±3 at 4.9%, ±4 at 1.2%. With skill equal to opposition:
- fail 38.3%
- tie 23.5%
- succeed 32.1%
- succeed with style 6.2%

### Inferences
- Fate's "succeed at a serious cost" option on a failure, which is the GM's to offer, is the most direct published version of "the player can choose to make it happen anyway, for a price". It maps well to a Discord button: "Miss — or hit anyway and take 1 damage?"
- A tie on an attack still earns a boost, so roughly a quarter of evenly matched attacks still do something without dealing harm.
- Invoking after the roll is a "fortune in the middle" decision point. A daily or per-scene token ("Hero Point: +2 after you see the roll") is simple enough for ages 8+ and directly cuts whiffs.
- Concession is a published, rewarded way to lose without dying: the loser picks a softer outcome and gets fate points to spend later. With "supporting NPCs... concede conflicts often", it gives an 8+ game a stock ending: foes run away or give up, and a hero who would drop instead "gets away" with a bonus token.

### Gaps
- I did not open the fate-srd.com HTML pages themselves (blocked). The text comes from the SRD maintainers' GitHub markdown conversion. Its README notes that Fate Core was processed by hand ("not done" in its snowflake list), so formatting may differ from the official source, though the quoted wording matches the rules as I know them.
- Resolved: stress defaults (a 1-point and a 2-point box) and consequence values (2/4/6) are now verified from the SRD text above.

## 8. Across systems: momentum economies, how foes act, how fights end

### Takeaway
Of the opened systems, the momentum-type resources fall into three shapes. Ironsworn's is a **banked meter spent after the roll** to cancel dice, then reset. Fate fate points and Savage Worlds Bennies are **discrete tokens spent after the roll** for +2, a reroll, or a soak. Genesys Advantage, Mythras Special Effects and Blades effect are **side effects generated by the roll itself**. Foes either take no turns at all (Blades, Dungeon World, Ironsworn: the player's roll decides what the foe does) or take card-dealt turns as a group (Savage Worlds). Every opened system offers a way out of a fight other than death: taken out and back later (Blades), concede for a reward (Fate), flee, surrender or negotiate (Ironsworn), or incapacitated and stabilizing (Savage Worlds, Mythras).

### Cited Findings
All from sources opened above; see each section for the URL and quote.

| System | Momentum or advantage form | Spent or applied when | Limit | How foes act | Ways a fight ends |
|---|---|---|---|---|---|
| Ironsworn | Momentum meter, -6 to +10; +1 minor / +2 major gains | After the roll: cancel challenge dice lower than momentum | Max +10 minus debilities; reset to +2 after a burn; no burning on End the Fight | "NPCs do not make moves"; initiative swaps on strong hit vs weak hit/miss | End the Fight (killed, out of action, flee, surrender); Compel to force or offer surrender; flee or give up |
| Blades | Push yourself (2 stress: +1d or +1 effect); assist (+1d for 1 stress) | Before the roll | 9 stress boxes (count unverified) | NPCs never roll; the PC's roll settles both sides | Trauma: "taken out of action... come back later"; level 3 harm incapacitates; 4 traumas retire |
| Fate | Fate points (invoke: +2 or reroll); boosts from ties | After the roll | Fate points; same aspect once per roll | Opposition rolls against the PC; GM-run NPCs | Concede before the roll (fate points as a reward); taken out (opponent narrates); designers advise against PC death |
| Savage Worlds | Bennies (3 per session; reroll keeping the best, soak, un-Shake); Joker: +2 to all Trait and damage rolls that round | After the roll (reroll, soak) or any time (un-Shake) | Benny supply; GM awards more for heroics | Card-dealt turns; each type of foe shares a card | Extras out at 1 Wound; Wild Cards at more than 3; Incapacitation Vigor roll |
| Genesys / FFG | Advantage and Triumph, generated by the roll | Same roll, spent from a 1/2/3-cost menu | Two maneuvers per turn | Foes get turns; Threat can give an opponent a free maneuver | Over wound threshold: unconscious plus Critical Injury (fan summary) |
| Mythras | Special Effects from the success-level gap; Luck Points (reroll, downgrade a wound) | Same exchange; Luck Point after the roll | 2 Action Points per round; Luck Points refresh each session | Foes act on Strike Rank and spend Action Points to parry | Major Wound incapacitates; Special Effects can force capitulation; Withdraw breaks off |
| WFRP 4e | Advantage, +10 per point (Foundry default) | Before the roll (bonus to the next test) | Foundry default cap 10, or Initiative Bonus as an option; cleared at combat end | Opposed tests | — (not verified) |

### Inferences
- **Design question 1 (near-miss band vs resource).** Systems that lean on resources keep the band *fixed and small*, or have none. Savage Worlds' Shaken band is a fixed 4 wide, and Fate's "tie earns a boost" is a single point. They then give a *player-controlled* spend after the roll (Bennies, fate points, momentum burns). None of the opened systems scales the band with the attacker's stats. That supports a fixed band (or none) plus a resource, over "missed by stat modifier + half proficiency", which the brief notes favors strong heroes.
- **Design question 2 (momentum's form).** Ironsworn's "cancel challenge dice below your momentum" works like a rescue whose odds grow with the bank. The nearest d20 equivalent is "spend momentum to turn a miss by up to N into a hit", not +2 on the next attack. Systems that *hand out* a bonus pick either a flat +2 for a round (the Savage Worlds Joker, a Fate invoke) or an extra die (Blades +1d, a Genesys boost die, a Bennies reroll keeping the best). Advantage on the next attack is the d20 analogue of the extra-die family. Ironsworn and Fate both let the player *hold* the resource, Ironsworn's "never required... save your momentum for a more crucial moment". On Discord that means a stored token, not an automatic next-turn buff.
- **Duration and carry-over.** Ironsworn momentum persists between scenes and sessions. Fate points and Bennies last the session. WFRP Advantage (as implemented) is wiped when combat ends. Genesys boosts and setbacks apply to the *next* check only, by an ally or the target. None of the opened texts ties the resource to a specific foe, so carrying over to another foe is the published norm.
- **Foes' turns.** On a turn-latency-bound Discord game, the Blades/Ironsworn model (the hero's roll also settles the foe's action; a miss hands the foe the initiative) cuts round trips. Savage Worlds' shared card per foe type is the lighter fallback if foes keep their own turns.
- **Ends of fights for ages 8+.** The opened texts give a ready vocabulary: "taken out of action" and back later (Blades), "concede" with a reward (Fate), "flee... give up... negotiate or force a surrender" (Ironsworn), and foes who concede often and "get away" (Fate GM advice). Fate's explicit advice against sudden PC death is the closest first-party designer statement for a kids' tone.

### Gaps
- No opened system publishes a study of how often its momentum resource is spent, or of how it feels. These are design claims, not measurements.
- The WFRP 4e and Genesys rows rest on secondary sources (Foundry code, a third-party transcription, reviews), not the core books.
