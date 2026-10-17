# Discord Quests

A Discord bot that runs tabletop adventures in a brand-new world, for families and players aged 8 and up.
It can be the dungeon master itself (**AI-DM mode**) or help a human dungeon master run the table
(**Assist mode**), chosen per campaign.

- **A story of its own.** Each campaign grows its own story from one of the world's seeds and the heroes
  themselves: threats that move when nobody stops them, people who want things and remember what the heroes did,
  mysteries with more than one way in, and decisive moments that come when the story has earned them. The next
  scene is wherever the heroes chose to go. Short, standard or long, chosen with the other story settings.
- **Two roads.** Heroes on *The Long Road* do things the right way, even when it is slow and hard.
  Heroes who take *The Quick Way* grab fast advantages by cutting corners or striking bargains with a
  trickster fox. Shortcuts really do help at first.
- **A hidden hand.** Some choices quietly matter more than anyone at the table can see. Players never see
  how it works, but late in the story they may notice that something beyond their own strength carried
  them through.
- **Stats tracked for you.** Rules are based on the fifth-edition System Reference Document (see
  [NOTICE.md](NOTICE.md)). Young players can choose *Guided* mode and pick story options instead of
  spending points by hand.
- **Your story, your way.** When a campaign starts, the host chooses how dark it may get (*Light*, a fireside
  tale; *Classic*, like The Hobbit; or *Epic*, like The Lord of the Rings), how long it runs, the storyteller's
  voice, humor and picture style, plus an optional premise (which also picks the kind of story) and topics to
  leave out. Every setting stays free of gore, anything
  sexual, and dark magic shown in detail, and on family campaigns only a guardian can choose Epic.
- **Battles that fit the story.** Turn-based fights with initiative, spells and potions, with every roll
  shown: yours, the foes', and the damage each one does. Dice are real random rolls. Foes come from the SRD's
  bestiary (250 creatures, chosen by where the story is and how dark it may get). Each fight is budgeted for the
  party's levels and size with the SRD's encounter XP budget, then played out against your heroes' own sheets
  before it starts and toned down until they can win it. How fierce fights read depends on the story's
  intensity, but they never turn gory: heroes at zero are only Dazed, and a beaten foe can be spared.
- **No canned story.** The AI tells every turn. When it can't, the turn goes to a person in the private DM room
  with the dice already rolled and everything needed to tell it; the table waits for them, never for filler.
- **Undo for grown-ups.** If a turn goes wrong, the host or DM mentions the bot in the private DM room ("rewind 2
  turns") and the game goes back to how it stood, hit points, packs and all. The table just sees the scene again.
- **New fight rules, if the table wants them.** Switched on from the DM room: an attack that misses by 1 or 2
  still grazes, a miss earns Courage (a second try on the hero's next miss), and every foe has a weak spot that
  players find by what they try: shove it, trick it or scare it. Off, fights play as the SRD has them.
- **Game night or play by post.** Quick rounds with everyone online, or turns over days with pings and
  reminders. A campaign can switch whenever it suits the group, and pausing stops the clock.
- **Two rooms per server.** Play happens in a table room everyone can see; human DMs get private screens in a
  DM room only they and the bot can see. The bot welcomes each new server and links to a setup guide.
- **Scene art** when the party reaches a new place or challenge, in the campaign's picture style and with the
  heroes as their players described them, from the image provider you choose.
- **Your choice of AI.** Story and image providers are configured on the web setup page: OpenAI-compatible
  services, Gemini, local models, or your own custom endpoint. Picking one shows what its documentation says about
  each model: context, longest answer, reasoning levels and structured output, and the bot calls it that way.

## Young players and Discord

Discord's Terms of Service require users to be **13 or older** (older in some countries). Players aged
8 to 12 should play **with a parent or guardian**: on the guardian's account, or at the same table with a
grown-up running the game in Assist mode. The bot asks for no names, ages, emails or locations, and a
campaign can be permanently deleted at any time.

## Project layout

```
packages/core        Pure game logic: dice, rules, world format, story, the loom, safety
packages/providers   AI story and image provider adapters
packages/db          Postgres schema and migrations
packages/engine      Turn pipeline and services shared by the bot and the simulator
packages/map-render  World map renderer
apps/bot             The Discord bot
apps/web             The setup page
apps/sim             Terminal simulator: play or stress-test a campaign without Discord
worlds/lanternreach  The starter world (editable YAML and Markdown)
docs/PLAN.md         The design plan
```

## Development

Requires Node 22 and pnpm 10.

```sh
pnpm install
pnpm check            # lint + typecheck + tests
pnpm world:validate   # check the starter world files
```

To run the bot on your own server, see [docs/RUNNING.md](docs/RUNNING.md).

To try the story engine without Discord:

```sh
pnpm sim transcript --policy merciful   # a whole campaign, turn by turn
pnpm sim -- --runs 500                  # how different play styles fare
```

See [docs/PLAN.md](docs/PLAN.md) for the full design and build phases.
