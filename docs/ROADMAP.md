# Roadmap to 1.0

## Releases and branches

| Branch | What it is |
|---|---|
| `alpha` | **v0.1 Alpha, frozen.** The first proof of concept: a fixed story arc in Lanternreach, cute, shallow and whimsical, but every piece working end to end (heroes, turns, the hidden hand, fights, pictures, the setup page). |
| `dev` | **The road to 1.0.** Alpha plus story settings (Light, Classic, Epic), the combat engine (real dice, the SRD bestiary, balanced encounters, partial hits and the defense mix), rewinds from the DM room, turns the AI can't tell going to a person, provider settings as each service documents them, and logging of every AI call and turn. |
| `feature/story-writer` | The asynchronous story writer (below). Merges into `dev` first. **Built:** the queue, the `apps/writer` service, the whole story (outline, bible, spine, chapters, side quests) written ahead and checked, its five triggers, reworks and recaps, DM-room notices; stress tests in [`reports/story-writer-stress.md`](../reports/story-writer-stress.md) and [`reports/story-writer-processes.md`](../reports/story-writer-processes.md). PR readiness: [MILESTONE-story-writer.md](MILESTONE-story-writer.md). |
| `feature/dice` | Players roll; the DM does the math (below). |
| `feature/storytelling` | Archetypes, a plot spine, side quests, continuity and DM corrections (below). Built on the story writer. |
| `release/1.0-beta` | Cut from `dev` once all three are in; tagged `v1.0.0-beta.1`. |
| `master` | 1.0 and later. Protected once it exists. |

Each feature branch merges into `dev` by pull request when CI is green and its stress-test report is in
`reports/`. Every stress test reads the logs described in [RUNNING.md](RUNNING.md#reading-the-logs).

## The story writer

The table should never wait on deep story writing, and the story should never run dry.

- A background job, run by a separate writer service, so bot restarts and deploys don't interrupt it. Jobs live in
  a Postgres queue; each step is saved as it finishes, so a crash resumes where it stopped.
- It writes ahead of play: the world for the table's premise, the plot spine, each chapter in detail, side quests
  and recaps. Everything is checked before it's handed over (content rules, real places and creatures, no
  contradictions with what's already happened).
- The bot calls it when a campaign is created (while the heroes are being made), when prepared material runs low,
  when the party goes somewhere nothing is prepared for, when a chapter marker is reached, and when a DM correction
  changes something already written.
- **On `feature/story-writer` now:** the queue and the `apps/writer` service, with the plan's job kinds: the whole
  story when a campaign is created (outline → bible → spine → chapter detail → side quests → self-check), the next
  chapter when a marker is reached, more of a chapter when its material runs low, side quests when the party goes
  off course, a rework when the DM tells a turn their own way, and recaps. Everything is checked before it's
  published. What must land before it merges is in [MILESTONE-story-writer.md](MILESTONE-story-writer.md).
- Its own job on the setup page ("Story writer"), so a server can give it a slow, strong model while turns use a
  fast one. It counts against the server's daily spending limit.
- The DM room hears what it's doing ("preparing chapter 3, about 20 minutes"), and why if it fails. Meanwhile the DM
  keeps the table busy with what's already written.

## Dice: the player rolls, the DM does the math

- When an action needs a check, that player gets a 🎲 Roll button and their die goes to the table at once:
  `🎲 Wren rolls 14 (sneaking past the guard)`. The roll is saved the moment it's made and never rolled again.
- The DM adds the modifiers and compares the difficulty in the DM room; the table sees the dice and what happens.
  In Assist campaigns the DM can change an outcome before the turn is told.
- In fights, players roll their attacks when they choose them; the foes' rolls are the DM's.
- `/roll` works the way players expect from dice bots: instant, with the reason echoed back, advantage,
  keep/drop, rerolls, exploding dice, labels, every die shown.
- Nothing players feel comes from a hashed seed.

## Storytelling: a plot that's planned, and a table that's free

- **Archetypes.** Story shapes (quest, rescue, heist, rebellion, mystery, siege...), roles (villain, mentor,
  tempter, the overlooked one...) and settings (high seas, frozen north, desert kingdom...) let the DM build a world
  for whatever the table asks for and still tell a cohesive story. The theme stays: the long road and the quick way.
- **A spine set at the start.** A seed, chapter markers, fork points, and endings decided up front; which ending the
  story reaches depends on the choices made at the forks.
- **Side quests are welcome.** Chapters have no clock. Side quests are built from the campaign's own people and
  places and lead back to the plot; the next chapter's hook stays on offer wherever the party goes.
- **Continuity.** Pronouns for every hero and character, established facts, and a memory of each scene so the story
  never circles back on itself.
- **DM corrections.** Written in the DM room in plain words ("Wren is he/him", "move the plot on") and kept on every
  turn until removed.
- **`pnpm playtest`.** Plays whole campaigns against a real AI service with different kinds of players and scores
  plot progress, circling, pronoun consistency and whether the story follows the dice.

## After the beta

A staging playtest with real tables, then a storyboard of candidate features to choose from (including a
`/bestiary` command).
