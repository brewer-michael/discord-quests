# Discord Quests

A Discord bot that runs tabletop adventures in a brand-new world, for families and players aged 8 and up.
It can be the dungeon master itself (**AI-DM mode**) or help a human dungeon master run the table
(**Assist mode**), chosen per campaign.

- **Two roads.** Heroes on *The Long Road* do things the right way, even when it is slow and hard.
  Heroes who take *The Quick Way* grab fast advantages by cutting corners or striking bargains with a
  trickster fox. Shortcuts really do help at first.
- **A hidden hand.** Some choices quietly matter more than anyone at the table can see. Players never see
  how it works, but late in the story they may notice that something beyond their own strength carried
  them through.
- **Stats tracked for you.** Rules are based on the fifth-edition System Reference Document (see
  [NOTICE.md](NOTICE.md)). Young players can choose *Guided* mode and pick story options instead of
  spending points by hand.
- **Gentle battles.** Turn-based fights with initiative, spells and potions, where nobody is ever badly
  hurt: foes faint, run off or pop into smoke, heroes at zero are only Dazed, and a beaten foe can be spared.
- **Game night or play by post.** Quick rounds with everyone online, or turns over days with pings and
  reminders. A campaign can switch whenever it suits the group, and pausing stops the clock.
- **Two rooms per server.** Play happens in a table room everyone can see; human DMs get private screens in a
  DM room only they and the bot can see. The bot welcomes each new server and links to a setup guide.
- **Scene art** when the party reaches a new place or challenge, from the image provider you choose.
- **Your choice of AI.** Story and image providers are configured on the web setup page: Claude (the
  default), OpenAI-compatible services, Gemini, local models, or your own custom endpoint.

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
