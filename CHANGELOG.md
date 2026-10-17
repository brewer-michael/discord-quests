# Changelog

## dev (towards 1.0)

### Story
- Story settings: how dark it gets (Light, Classic, Epic), the storyteller's voice, humor, picture style, a premise,
  and topics to leave out or keep offscreen. Family campaigns need a guardian for Epic.
- No canned turns: a turn the AI can't tell goes to a person in the DM room with the dice, what's settled and why.
- Scenes end when their story does, never on a turn count.
- Fewer AI calls per turn: the reviewer reads hidden-hand turns and every turn at Epic; the AI read of typed text
  runs at Light. Word and personal-detail checks run on everything.

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
