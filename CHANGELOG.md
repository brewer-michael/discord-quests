# Changelog

## dev (towards 1.0)

### Story
- Story settings: how dark it gets (Light, Classic, Epic), the storyteller's voice, humor, picture style, a premise,
  and topics to leave out or keep offscreen. Family campaigns need a guardian for Epic.
- No canned turns: a turn the AI can't tell goes to a person in the DM room with the dice, what's settled and why.
- Scenes end when their story does, never on a turn count.
- Fewer AI calls per turn: the reviewer reads hidden-hand turns and every turn at Epic; the AI read of typed text
  runs at Light. Word and personal-detail checks run on everything.

### Story writer
- A separate service writes the story ahead of the table, so turns never wait for it: each chapter's plan
  (drafted, then checked against what has happened) and each chapter's recap, from every turn of the chapter.
- Jobs are saved step by step in a Postgres queue: a restart or a crash carries on where it stopped, one job per
  campaign at a time, retries after 1, 4 and 16 minutes, the next day if the spending limit stopped it.
- The DM room hears what it's writing and why a job failed, with a Try again button. The hidden-hand page lists
  each campaign's jobs.
- Its own job on the setup page, "Story writer"; it uses the Planner's service until set. `WRITER_JOB_TOKENS`,
  `WRITER_WORKERS`.
- No stand-in plans or recaps: a job the AI couldn't do is retried, then the DM room is told and can ask for
  another go.

### Playing without Discord
- `pnpm play`: the game in a terminal. You play the heroes and the DM room (drafts, turns the storyteller couldn't
  tell, the story writer's notices), with the scripted storyteller, a local stand-in that goes through the real
  provider code, the environment's AI keys, or your own OpenAI-compatible endpoint.

### Combat
- Real dice, every roll shown, foe health as a bar.
- 250 SRD creatures with their real stat blocks, chosen by where the story is and how dark it may get; encounters
  balanced for the party's levels and size, then test-fought before they start.
- Foes' conditions wear off on time; crumbling and fading foes leave.
- Optional new fight rules from the DM room: grazes, Courage, and a weak spot for every foe found by what players try.

### DM room
- Rewind turns, mend the party, rebuild a fight, switch the fight rules: mention the bot in the DM room.

### AI services
- Each service is called the way its documentation says: reasoning levels, answer limits, structured output.
- A new service no longer takes over every job on the setup page.
- Logging: an `ai call` line for every AI request (time, tokens, reasoning, effort and limit sent, the server's own
  timings) and a line for every turn with its outcome and where the time went. `LOG_LEVEL`, `LOG_AI_OUTPUT`.

## v0.1 Alpha (`alpha`)

The first proof of concept: a fixed story arc in the Lanternreach starter world, heroes with guided creation, turns
told by the AI storyteller, the hidden hand, turn-based fights, scene pictures, game night and play by post, Assist
mode for a human DM, family guardian controls, and the web setup page.
