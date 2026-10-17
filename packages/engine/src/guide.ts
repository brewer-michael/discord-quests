/**
 * The getting-started guide, shared by the setup site's /guide page and the
 * bot's /help. Light markdown only: **bold** and `code`.
 */
export interface GuideSection {
  id: string;
  title: string;
  intro?: string;
  steps?: string[];
  notes?: string[];
}

export const GUIDE: GuideSection[] = [
  {
    id: "invite",
    title: "1. Invite the bot",
    steps: [
      "Use the **Add to server** link on the setup site, or the one your bot's host gave you. You need the **Manage Server** permission on the server.",
      "The invite already asks for everything the bot needs, so there's nothing to tick by hand. It never reads ordinary chat messages.",
    ],
  },
  {
    id: "rooms",
    title: "2. Make two rooms",
    intro:
      "The bot plays in one room that everyone can see, and keeps the storytellers' screens in a second, private room.",
    steps: [
      "**The table room**, for example `#quest-table`: a normal text channel. Everyone who plays must be able to see it and post in it. Each campaign gets its own thread here (or can be played right in the room).",
      "**The DM room**, for example `#dm-screen`: create a text channel and switch on **Private Channel**. Add the people (or the role) who will run games, and add the **Discord Quests** bot too. Nobody else should see it.",
      "When a person runs a campaign with the bot's help, their private screen appears as a thread in the DM room: every turn is drafted there for them to send, edit or redo before players see it.",
    ],
    notes: [
      "If you changed the bot's permissions, it needs these in both rooms: View Channel, Send Messages, Send Messages in Threads, Embed Links, Attach Files and Read Message History. In the table room it also needs Create Public Threads and Pin Messages; in the DM room, Create Private Threads.",
    ],
  },
  {
    id: "setup",
    title: "3. Tell the bot where they are",
    steps: [
      "Run `/setup table:#quest-table dm-room:#dm-screen` (you need **Manage Server**).",
      "The bot checks that it can post in both rooms and that the DM room really is private, and says exactly what to fix if not.",
      "Run `/setup` on its own any time to see how things stand.",
    ],
  },
  {
    id: "ai",
    title: "4. Choose the storyteller AI (optional)",
    steps: [
      "On the setup site, sign in with Discord and pick your server. Add a story service (OpenAI-compatible services, Gemini, models you run yourself and custom endpoints all work) and, if you like, a picture service for scene art.",
      "Set a daily budget there too. When the storyteller can't tell a turn (no service set, the budget used up, or the service down), the bot hands it to a person in the DM room with the dice already rolled.",
      "Added a picture service after the adventure began? The host or DM runs `/campaign pictures` in the campaign's thread to paint the places the story has already been. Anyone can look through them with `/campaign gallery`.",
    ],
  },
  {
    id: "play",
    title: "5. Start an adventure",
    steps: [
      "Type `/campaign new name:Lights Out` anywhere on the server. The campaign opens in the table room.",
      "A **Shape your adventure** card follows: how dark it may get (**Light**; **Classic**, like The Hobbit; **Epic**, like The Lord of the Rings), voice, humor, pictures and an optional premise. Never gory or sexual at any setting. `/campaign story` changes it.",
      "Everyone presses **Join** and **Make my hero** in the campaign's thread (and can say what their hero looks like with `/character describe`), then the host presses **Begin the adventure**.",
      "To run it yourself with the bot's help, choose **A person runs it** as the storyteller and pick yourself as the DM.",
    ],
  },
  {
    id: "pace",
    title: "Game night or play by post",
    intro:
      "Every campaign can play fast or slow, and switch whenever it suits the group with `/campaign pace`.",
    steps: [
      "**Game night**: everyone's online together. Rounds move on as soon as everyone has chosen, or after a few minutes. No pings.",
      "**Play by post**: turns stretch over days. When a turn opens, the bot mentions the players who need to act, reminds them before it closes, and waits up to a day (or longer, or until everyone has chosen: your choice).",
      "**No countdown at all:** the host or DM runs `/campaign pace timer:No limit (wait for everyone)` in the campaign's thread, and each turn waits until every player has chosen. Pick a time from the same list to bring the countdown back.",
      "`/campaign pause` stops the clock completely, for holidays or busy weeks. `/campaign resume` starts it again and lets everyone know.",
      "Anyone who doesn't choose in time just watches and waits that turn. The host or DM can press **Continue the story** to move on early.",
    ],
  },
  {
    id: "family",
    title: "Playing with younger kids",
    steps: [
      "Discord accounts are for people 13 and older. Players aged 8 to 12 should play with a parent or guardian, on the grown-up's account or at the same table.",
      "A grown-up can run `/campaign guardian` in the campaign to watch over it: they can pause the game any time and see what the safety checks stopped (never the words themselves).",
      "On a family campaign, only a guardian can choose **Epic**. Without one, the story plays at **Classic**.",
      "Anyone can press **Not this** to quietly steer the story away from something. Nobody sees who pressed it.",
    ],
  },
];

export function guideSection(id: string): GuideSection | undefined {
  return GUIDE.find((s) => s.id === id);
}
