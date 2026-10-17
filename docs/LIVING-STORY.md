# The living story

What replaces the fixed arc. The players' choices decide where the story goes; the world supplies the setting,
the people and the trouble, and the storyteller builds the plot around what the heroes actually do.

## What was wrong

- **The same story every time.** Three act files fixed every scene and its order. Choices only colored the
  narration; the plot never changed.
- **Every call re-sent everything.** The whole world (every place, faction, class and lore page), every rule and
  the full answer format went out on every turn and every retry, so every call was slow.
- **Gates nobody asked for.** A reviewer on every Classic/Epic turn and an AI safety check on every typed action
  each added a full round trip, and each could stop a turn.

## How it works now

### The world is a setting, not a script

A world keeps its places, factions (goals, methods, clocks), people (with secrets), temptations (shortcuts),
creatures, items, lore and the hidden hand's data. Two new kinds of file replace `arc/`:

- `seeds/*.yaml`: **campaign seeds.** Each is a different central trouble: a pitch, where it can begin, how it can
  start, what's at stake, its fronts (threats with ordered portents and a doom), the people it involves, its
  mysteries (a question, the truth, and at least three clues), and its decisive moments (the last one is the
  finale).
- `situations/*.yaml`: **set pieces.** Authored situations tied to a place: a thief caught in the lamp-house, the
  Fox's door, a toll bridge. The storyteller may use them when they fit where the heroes are and what they're
  doing, in any order, or invent its own.

### A campaign gets its own story

When a campaign starts, the director (one call, done once) builds the campaign's **story plan** from the
setting, a seed that suits the table's premise, and the heroes themselves (their people, classes, backgrounds,
keepsakes, roads and looks):

- the pitch and the stakes;
- **fronts**: the central threat and one or two others, each with portents that come true if the heroes don't
  stop them, and a doom;
- **the cast**: the people who matter in this story, each with an agenda, a voice, a secret and an attitude;
- **mysteries**, each with at least three clues, so no single missed roll hides the truth;
- a **personal hook** for each hero;
- **decisive moments**, ending in a finale;
- the opening scene.

The plan lives in the spoiler schema (`spoiler.story_plans`, a new version at every scene change). Players never
see it; a DM can, on the setup page's hidden-hand page behind the spoiler warning: the threats and how far they've
come, the decisive moments, the mysteries and their answers, and everyone's secrets.

The seed is the one whose words best match the table's premise ("smugglers and an auction" picks The Ledger's
Price), or one at random when the premise says nothing about it, so two tables rarely play the same trouble.

### Scenes are situations with a question

Each scene has a place, a situation as the heroes arrive, a **dramatic question**, the people present, the clues
that can be found there, any temptation on offer, and any foes. The scene ends when its question is answered and
the heroes move on, never on a count of turns.

When a scene ends, the director frames the next one from where the heroes said they're heading, what they did,
the fronts, the open mysteries and the people involved. At the same time it:

- writes a one-line summary of the scene and updates the story so far;
- advances a front when the heroes left it alone or time passed (at most one portent per scene), or marks it
  thwarted when they stopped it;
- brings a decisive moment when the story has earned it, and the finale when the heroes go after the central
  trouble and the story is long enough;
- marks a milestone (heroes level up) and a chapter break when something big was settled.

### Milestones and chapters

The director says when a scene settled something big. A decisive moment always counts; otherwise milestones are
never two scenes running. Each milestone is a level-up for every hero. A new chapter begins with a milestone (or
after a long stretch without one), and its recap for the journal is written from the director's own scene
summaries once the turn is out.

### What players can see

The journal shows the goals the heroes took up, their promises, **what they've found out** (each clue as they
found it), and the chapter recaps. Changes the storyteller describes reach the game only after the rules check
them: only the people present change how they feel or where they go, a person the hidden hand needs flees rather
than falls, only this scene's clues and loot can be found, a fight breaks out only with the foes the scene allows
(it starts next round), and a hazard hurts but never knocks a hero out.

### Each call gets only what it needs

- **The storyteller** gets its voice, the content rules and the writing rules (the same every turn, so a
  provider can cache them), then: the heroes, the story so far in a few sentences, the current scene, only the
  people present (their voice, attitude, agenda and secret, which shows in what they do but is never told), the
  clues findable here, promises involving them, this scene's turn-by-turn summary, the last narration, and this
  turn's actions and dice.
- **The director** gets the plan's summary, the scene that just ended, where the heroes are heading, the nearby
  places, a handful of fitting set pieces, temptations and creatures. It runs only when a scene changes.
- **The action reader** gets the scene and what was typed.

### What a turn costs

- A normal turn: the action reader (only when someone typed) and the storyteller.
- A turn that changes scene: the director, then the storyteller.
- The reviewer reads a passage only when the hidden hand acts in it or the story is told at Epic. The AI safety
  check on typed text runs at Light. The word checks run on everything.

### The storyteller's answer

Narration, lines for the people present, two to four choices (each with the roll it would need), whether the
scene is over, one sentence on what happened, and a short list of changes the engine checks before applying:
someone's attitude or whereabouts, a clue found, a promise made or settled, an item or gold from what the scene
allows, a new person, place or thing, a goal taken up or finished, a fight breaking out (from the foes the scene
allows), a hazard.

### Nothing stands in for the AI

If the director or the storyteller can't finish a turn, the turn goes to the DM room with everything: why, the
scene, every hero's action, every roll, what's settled, the hidden hand's notes and where the story could go next.
A person tells it, or asks the storyteller again. A scene a person opened is framed properly by the director at
the next chance, from what that person wrote.

### The hidden hand

The loom keeps its rules (threads from kindness and mercy, snares from shortcuts, detours, bearers, convergence
at decisive moments) but works on the campaign's own decisive moments instead of fixed beats. Story progress is
scenes finished, plus a bonus for each milestone.

### Campaigns from before

A campaign started on the fixed arc keeps playing its current scene. At its next scene change the director builds
its story plan from what has already happened (the chapter recaps and the last few turns) and frames the next
scene from where the heroes are heading. Hidden-hand threads kept for an old beat are freed, so the hand keeps
them for the new finale.

### Length

A campaign's story settings include a length: short (about 8 scenes, an evening or two), standard (about 20) or
long (about 40). The director paces fronts and moments to it; the finale never comes before 60% of it, and only
when the heroes go after the central trouble. Changing it mid-campaign paces the story to the new length from the
next scene on. The setup page sets the default for new campaigns.

### Checking the hidden hand

`pnpm sim` plays hundreds of campaigns the living-story way without an AI (a seed's set pieces as scenes, decisive
moments when the story reaches them, threats moving with time) and reports how often kindness carries the finale,
how often shortcuts come back around, and whether the people who matter are there when they're needed.
