# How narrative and non-d20 RPGs handle failure, partial success, momentum and armor

*How I got the sources: the session's network proxy blocked every publisher and SRD website (bladesinthedark.com, dungeonworldsrd.com, fate-srd.com, ironswornrpg.com, Wikipedia, Reddit, roll20 and the rest returned DNS errors or 403). Only raw.githubusercontent.com and registry.npmjs.org could be reached. So every "opened" citation below is either (a) the official open text as published to GitHub or npm by the rights holder or by the SRD's maintainer, or (b) a licensed or community Foundry VTT system file that reproduces rules text or implements the rules in code. Each one is labelled. Material that came only from search-engine summaries (pages I did not open) or from memory is kept in separate "Unverified" sub-lists. All probabilities are my own exact enumerations of the published dice rules.*

## 1. Blades in the Dark: action roll outcomes, position and effect, consequences, resistance, armor

### Takeaway
In Blades a 4-5 is defined as "you do what you were trying to do, but there are consequences". One player roll settles both the PC's action and the NPC's action, and NPCs never roll. Armor and resistance do not change whether you hit. They let the player shrink or cancel a consequence after the fact, paying with stress or a spent armor box. Position (controlled, risky or desperate) sets how bad the consequences get. Effect (zero, limited, standard, great) sets how much a success accomplishes.

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

### Gaps
- The verbatim position table in the SRD mirror is marked "@TODO". I used the Foundry localization strings, which match the rulebook as I remember it but are a secondary source.
- The effect-to-clock tick table is also "@TODO" in the mirror. From memory (unverified): limited = 1 segment, standard = 2, great = 3.
- From memory (unverified): 9 stress boxes, trauma when they fill, 4 traumas retires a PC.

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

### Gaps
- I could not open the rulebook's own "Burning Momentum / Resetting / Negative / Max Momentum" pages (ironswornrpg.com and dokk.org were blocked). The numbers above come from the Foundry implementation and official asset wording.
- From memory (unverified): the core text says "cancel any challenge die whose value is less than your momentum"; the action score is capped at 10; progress tracks have 10 boxes × 4 ticks; a "match" (both challenge dice equal) amplifies a strong hit or miss.
- A search summary (rulebook not opened) gives the default reset as +2 and says burning means "you must reset" — [cannibalhalflinggaming review, search summary only](https://cannibalhalflinggaming.com/2019/08/09/bargain-bin-gaming-ironsworn-ennie-gold-winner/)

## 4. Genesys / FFG Star Wars narrative dice: success vs advantage on separate axes, failure with advantage, triumph/despair

### Takeaway
Genesys puts success/failure and advantage/threat on two independent axes. A failed attack can still generate Advantage, which buys useful side effects (recover strain, give an ally a boost die, take a free maneuver), so a miss can still do something. None of this could be verified from an opened page. The system is proprietary with no SRD, and every page I could have used was blocked.

### Cited Findings
- No primary or official page could be opened (the proxy blocked fantasyflightgames.com, edge-studio and others). Every Genesys statement below is therefore unverified.

#### Unverified (search-engine summaries, pages not opened)
- A failed task can still generate Advantage, so something good can come of a failure. Advantage does not change success or failure, only side effects. The player controlling the active character decides how to spend Advantage and Triumph unless the GM has a reason to decide. These summaries quote the Core Rulebook through hosts I did not open and will not cite; the closest non-pirate pages are — [Genesys Combat Summary (tekeli.li), search summary only](https://tekeli.li/firefly-genesys/combat.html); [CitizenKeen Genesys write-up, search summary only](https://writeups.letsyouandhimfight.com/citizenkeen/genesys/)
- Triumph and Despair do not cancel each other the way Advantage and Threat do. The combat spending table is "Table I.6–2" around p. 103 of the printed core book (not verified) — same search summary as above.
- Forum report: on a failed attack, Critical Injuries and weapon qualities cannot be triggered, so GMs narrate Advantage as disarm or knock prone; a player spent Advantage on a miss to "shove them back... out of engaged range" — [FFG forum archive "Handling 'Odd' Results", search summary only](https://ffg-forum-archive.entropicdreams.com/topic/265644-handling-odd-results)
- A reviewer's criticism: in combat Advantage "was a metacurrency with specific spends", but outside combat it became "hand-wavy", and Advantage or Threat appeared on nearly every roll, which felt tedious — [EN World "Grading the Genesys System", search summary only](https://www.enworld.org/threads/grading-the-genesys-system.702979/post-9282732)

#### From memory (unverified, needs checking against the Genesys Core Rulebook)
- **Dice.** Ability d8 (green), Proficiency d12 (yellow), Difficulty d8 (purple), Challenge d12 (red), Boost d6 (blue), Setback d6 (black). Successes cancel Failures and Advantages cancel Threats. You need at least 1 net success to succeed. Triumph counts as a Success plus a special effect. Despair counts as a Failure plus a special effect.
- **Damage.** Weapon base damage + 1 per net success, minus soak (Brawn + armor soak). Strain is a separate track. A Critical Injury needs a hit plus Advantage equal to the weapon's Critical rating, or a Triumph.
- **Spending table (combat).**
  - 1 Advantage: recover 1 strain; add a Boost die to the next allied active character's check; notice a vital detail.
  - 2 Advantage: perform a free maneuver (max two per turn); add a Setback die to the target's next check; give a Boost die to any ally.
  - 3 Advantage: negate the target's defensive bonuses; ignore environmental penalties; +1 defense until the end of your next turn; disarm the target.
  - Triumph: upgrade the difficulty of the target's next check, or upgrade an ally's next check; destroy a piece of the target's equipment; do something vital such as shooting the controls.
- **Lineage.** The narrative dice began in WFRP 3e (FFG, 2009) by Jay Little. No published design-rationale quote was verified.

### Inferences
- The separate "side-effect" axis is the cleanest published answer to "a miss does nothing". The game can tell a child "you missed, but you get 2 sparks: shove the goblin back, or give your friend a bonus". It needs a short, fixed spend menu or it becomes slow (the reviewer's complaint).
- Custom symbol dice are a poor fit for a Discord bot UI. The two-axis idea can be emulated on a d20: for example, a miss by 1-4 earns 1 "spark".

### Gaps
- Exact Table I.6-2 entries and costs, and whether each spend works on a failed check, are unverified.
- No designer rationale was found or opened.
- License: proprietary (Fantasy Flight Games, now Edge Studio/Asmodee); no SRD known (memory).

## 5. Savage Worlds: raises, Shaken vs Wounds, damage vs Toughness, Soak, near misses

### Takeaway
Savage Worlds pays out in steps of 4 ("raises") over a target number. Damage that meets Toughness makes the target Shaken, which costs them tempo. Each raise above that adds a Wound. Soak rolls (spend a Benny, roll Vigor) cancel Wounds. A hit that meets Toughness exactly still does something (Shaken). A hit that falls short of Toughness does nothing. Nothing here could be verified from an opened page: the system is proprietary and peginc.com was blocked.

### Cited Findings
- No primary page could be opened (peginc.com was blocked). Every statement below is unverified.

#### Unverified (search-engine summaries, pages not opened)
- Damage equal to Toughness makes the target Shaken. Each raise (every 4 over Toughness) on the damage roll adds a Wound. A forum post: "To wound an enemy, you have to meet or exceed the enemy's toughness by 4 or more, after subtracting damage for armor. If you meet the enemy's toughness, or exceed the enemy's toughness by 3 or less, the enemy is not wounded, but is 'shaken'" — [Gamers Plane SW thread, search summary only](https://gamersplane.com/forums/thread/18586); [Samhaine "Savage Worlds Rules Summary", search summary only](https://samhaine.wordpress.com/2020/04/06/savage-worlds-rules-summary/)
- Soak: spend a Benny after damage is rolled and before Wounds are applied, then roll Vigor. Each success and raise removes one Wound. "If all wounds are soaked, remove Shaken." — [SWADE Quick Reference on Scribd, search summary only](https://www.scribd.com/document/641603669/SWADE-Quick-Reference)
- Older editions: a hit on an already-Shaken target causes a Wound. Edition differences exist — [Samhaine summary, search summary only](https://samhaine.wordpress.com/2020/04/06/savage-worlds-rules-summary/)
- One analysis estimates a strong fighter hitting with a raise one-shots an unarmored Toughness-5 person about 1 time in 6 — [Gaming Ballistic "Violent Resolution", search summary only](https://gamingballistic.com/2015/05/17/violent-resolution-thats-going-to-leave/)

#### From memory (unverified, SWADE)
- **Trait rolls.** Die type d4-d12; Wild Cards also roll a d6 Wild Die and keep the best; dice "ace" (explode). TN 4, with a raise per +4.
- **Attacks.** Melee is Fighting vs Parry (2 + half the Fighting die). Ranged is Shooting vs TN 4 at short range. Damage is Strength die + weapon die (melee) or fixed weapon dice; +1d6 damage on a raise on the attack roll.
- **Toughness.** 2 + half Vigor + armor.
- **Shaken.** In SWADE a Shaken character rolls Spirit at the start of their turn; success clears Shaken and they act normally. A Benny clears it at any time.
- **Wounds.** Extras (mooks) are Incapacitated by any Wound. Wild Cards can take 3 Wounds at -1 each, and the next one Incapacitates them.
- **Tests.** Non-damaging Tests (e.g. Intimidation or Taunt vs Spirit/Smarts) inflict Distracted or Vulnerable, or Shaken on a raise. This gives a non-damage action that still accomplishes something.

### Inferences
- "Shaken" is a middle band between "no effect" and "real damage". It is the Savage Worlds version of a graze: the hit costs the enemy tempo without needing a damage number.
- Mook handling (any Wound takes out an Extra) cuts down long low-damage slogs. This is relevant for keeping Discord fights to few turns.

### Gaps
- Exact SWADE text for Shaken recovery, Soak, Wound caps, and the double-Shaken rule is unverified.
- No designer rationale was opened.
- License: proprietary (Pinnacle Entertainment Group); fan-license terms not checked.

## 6. Armor as damage reduction: RuneQuest/Mythras, WFRP 4e, and the open systems; effects on hit rates and feel

### Takeaway
Under damage-reduction armor, armor no longer makes you harder to hit; it makes hits weaker. That raises the share of attacks that connect, but a fully absorbed hit can become a new kind of whiff. The published fixes are a floor or a consolation: WFRP 4e's "Minimum 1 Wound", Fate's optional Armor rating (a hit reduced to 0 shifts gives a boost), Dungeon World's "a blow is turned away completely—that's fine", and Blades' armor as a spendable box. Mythras/RuneQuest and WFRP 4e details came only from search summaries, memory, or WFRP Foundry system strings.

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

#### Unverified (search-engine summaries, pages not opened)
- **WFRP 4e damage.** Any armour at the hit location and the target's Toughness Bonus are subtracted from total damage, and the rest is suffered as Wounds. "If all the damage is soaked by armour and/or toughness bonus, an attack will still deal a minimum of 1 wound." The same summary says this is unchanged from 1e/2e. Melee is an opposed test (WS); the side with more SL wins — [d20radio WFRP 4e Review Part 5 – Combat, search summary only](https://www.d20radio.com/main/wfrp-4th-edition-review-part-5-combat/)
- **WFRP 4e Advantage.** +10 per Advantage to combat tests. You lose Advantage when you lose an opposed test, suffer a condition, or take Wounds. You gain +1 Advantage for winning an opposed test or defeating an opponent. Fan sources disagree on the details — [tekeli.li PbP WFRP thread, search summary only](https://discussion.tekeli.li/t/pbp-warhammer-fantasy-roleplay-discussion-thread/833); [WFRP4 GM Screen copy, search summary only](https://pdfcoffee.com/wfrp4-game-master-screen-pdf-free.html)
- **Mythras parry by weapon size.** "A parry will absorb all damage if the parrying weapon is the same size or greater... one size smaller... will absorb half of the damage... two or more sizes smaller... will absorb no damage, but will prevent a special effect if a successful parry is made."
- **Mythras armor and special effects.** Weapon damage after parry is applied against the location's Armour Points. Special effects are chosen before damage, so "a defender can have armour absorb all the damage and still suffer the chosen effect". Forum posters disagree about whether AP degrades.

— [BRP Central "Spear?" thread, search summary only](https://basicroleplaying.org/topic/15988-spear/page/3/); [Design Mechanism forum "Unarmed Parries", search summary only](https://www.tapatalk.com/groups/designmechanism/unarmed-parries-t1934.html)
- **Designer and blog commentary on DR armor exists but was not opened:** [Armor as Damage Reduction (Goodreads author blog)](https://www.goodreads.com/author_blog_posts/23566241-armor-as-damage-reduction); [Armour as Wound Reduction (itch devlog)](https://eucatastrophic.itch.io/blog/devlog/867454/armour-as-wound-reduction)

#### From memory (unverified)
- **Mythras.** d100 roll-under with opposed attack and parry. The difference in success levels grants Special Effects (e.g. Bleed, Trip Opponent, Disarm, Choose Location, Stun Location; Bypass Armour needs a critical). Each hit location has HP. Armour Points per location subtract from damage. Even a failed attack can hand the defender special effects, and an absorbed hit can still apply its effect.
- **RuneQuest: Roleplaying in Glorantha.** Armor points per hit location. Parrying weapons and shields absorb damage up to their HP and the excess passes through.
- **Licenses.** Both are proprietary (The Design Mechanism; Chaosium). Chaosium's Basic Roleplaying SRD was released under the ORC license around 2023, and a free "Mythras Imperative" quick-start exists; neither license was checked.
- **WFRP 4e.** Proprietary (Games Workshop / Cubicle 7).

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
- Opposed rolls with Advantage (WFRP) create momentum: winning an exchange makes the next one easier even without damage. But losing all Advantage on taking a Wound can feel punishing for young players.

### Gaps
- No opened primary source for Mythras, RuneQuest or WFRP 4e rule text. The Advantage gain and loss triggers and the exact armor wording for each are unverified.
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

**Probabilities** (my enumeration). 4dF gives -4..+4 with 0 at 23.5%, ±1 at 19.8% each, ±2 at 12.3%, ±3 at 4.9%, ±4 at 1.2%. With skill equal to opposition:
- fail 38.3%
- tie 23.5%
- succeed 32.1%
- succeed with style 6.2%

### Inferences
- Fate's "succeed at a serious cost" option on a failure, which is the GM's to offer, is the most direct published version of "the player can choose to make it happen anyway, for a price". It maps well to a Discord button: "Miss — or hit anyway and take 1 damage?"
- A tie on an attack still earns a boost, so roughly a quarter of evenly matched attacks still do something without dealing harm.
- Invoking after the roll is a "fortune in the middle" decision point. A daily or per-scene token ("Hero Point: +2 after you see the roll") is simple enough for ages 8+ and directly cuts whiffs.

### Gaps
- I did not open the fate-srd.com HTML pages themselves (blocked). The text comes from the SRD maintainers' GitHub markdown conversion. Its README notes that Fate Core was processed by hand ("not done" in its snowflake list), so formatting may differ from the official source, though the quoted wording matches the rules as I know them.
- Default stress box counts and consequence values (memory, unverified): 2 physical + 2 mental boxes by default; mild/moderate/severe consequences absorb 2/4/6 shifts.
