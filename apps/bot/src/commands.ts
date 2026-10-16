import { TIMER_CHOICES } from "@dq/engine";
import { ChannelType, InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";

const GUILD = InteractionContextType.Guild;
const PACE_CHOICES = [
  { name: "Game night: quick rounds, everyone here at once", value: "live" },
  { name: "Play by post: take turns over days, with pings", value: "post" },
];
const TIMER_OPTION_CHOICES = TIMER_CHOICES.map((c) => ({ name: c.label, value: c.seconds }));

export const COMMANDS = [
  new SlashCommandBuilder()
    .setName("campaign")
    .setDescription("Start and manage adventures")
    .setContexts(GUILD)
    .addSubcommand((s) =>
      s
        .setName("new")
        .setDescription("Start a new campaign (in the table room, if the server has one)")
        .addStringOption((o) =>
          o.setName("name").setDescription("What's the adventure called?").setMaxLength(60).setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("audience")
            .setDescription("Who is playing?")
            .addChoices(
              { name: "Family (ages 8+, gentle)", value: "family" },
              { name: "Teens (13+, more peril)", value: "teen" },
            ),
        )
        .addStringOption((o) =>
          o
            .setName("storyteller")
            .setDescription("Who runs the story?")
            .addChoices(
              { name: "The bot tells the story", value: "ai_dm" },
              { name: "A person runs it, the bot helps", value: "assist" },
            ),
        )
        .addUserOption((o) =>
          o.setName("dm").setDescription("The human DM (for the 'a person runs it' option)"),
        )
        .addStringOption((o) =>
          o
            .setName("pace")
            .setDescription("How fast do you play? You can change it any time.")
            .addChoices(...PACE_CHOICES),
        )
        .addStringOption((o) =>
          o
            .setName("place")
            .setDescription("Where the game is played")
            .addChoices(
              { name: "Its own thread in the table room (recommended)", value: "thread" },
              { name: "Right in the table room (one campaign at a time)", value: "room" },
            ),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("pace")
        .setDescription("Switch between game night and play by post, or change the turn timer (host or DM)")
        .addStringOption((o) =>
          o
            .setName("pace")
            .setDescription("Game night or play by post")
            .addChoices(...PACE_CHOICES),
        )
        .addIntegerOption((o) =>
          o
            .setName("timer")
            .setDescription("How long players have each turn")
            .addChoices(...TIMER_OPTION_CHOICES),
        )
        .addBooleanOption((o) =>
          o
            .setName("pings")
            .setDescription("Mention players when it's their turn, and remind them before it closes"),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("pictures")
        .setDescription("Paint pictures of the places the story has already been (host or DM)"),
    )
    .addSubcommand((s) =>
      s
        .setName("gallery")
        .setDescription("Look through the pictures of places the story has been")
        .addStringOption((o) =>
          o
            .setName("search")
            .setDescription("Only pictures that mention these words, like a place or what happened there")
            .setMaxLength(100),
        ),
    )
    .addSubcommand((s) => s.setName("join").setDescription("Join the campaign in this thread"))
    .addSubcommand((s) => s.setName("leave").setDescription("Leave the campaign in this thread"))
    .addSubcommand((s) => s.setName("start").setDescription("Begin the adventure (host or DM)"))
    .addSubcommand((s) => s.setName("status").setDescription("Who's playing and where the story is"))
    .addSubcommand((s) =>
      s
        .setName("guardian")
        .setDescription("Watch over this table as a grown-up: pause it and see the safety log"),
    )
    .addSubcommand((s) =>
      s.setName("safety").setDescription("What the safety checks stopped (host, DM or guardian)"),
    )
    .addSubcommand((s) => s.setName("pause").setDescription("Pause the adventure (host, DM or guardian)"))
    .addSubcommand((s) => s.setName("resume").setDescription("Resume the adventure (host, DM or guardian)"))
    .addSubcommand((s) => s.setName("end").setDescription("End the adventure (host or DM)"))
    .addSubcommand((s) =>
      s
        .setName("delete")
        .setDescription("Permanently delete this campaign and its history (host or DM)")
        .addBooleanOption((o) =>
          o.setName("confirm").setDescription("Yes, delete it forever").setRequired(true),
        ),
    ),
  new SlashCommandBuilder()
    .setName("character")
    .setDescription("Your hero")
    .setContexts(GUILD)
    .addSubcommand((s) => s.setName("create").setDescription("Make (or keep making) your hero"))
    .addSubcommand((s) => s.setName("sheet").setDescription("See your hero's sheet"))
    .addSubcommand((s) =>
      s.setName("levelup").setDescription("Grow stronger after a big moment in the story"),
    )
    .addSubcommand((s) =>
      s
        .setName("describe")
        .setDescription("Say what your hero looks like, for the story and its pictures")
        .addStringOption((o) =>
          o
            .setName("look")
            .setDescription("A sentence or two: their build, hair, clothes, anything people notice")
            .setMaxLength(200)
            .setRequired(true),
        ),
    ),
  new SlashCommandBuilder()
    .setName("act")
    .setDescription("Say what your hero does this turn")
    .setContexts(GUILD)
    .addStringOption((o) =>
      o.setName("what").setDescription("What does your hero do?").setMaxLength(500).setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("pass")
    .setDescription("Let your hero watch and wait this turn")
    .setContexts(GUILD),
  new SlashCommandBuilder()
    .setName("roll")
    .setDescription("Roll some dice for everyone to see")
    .setContexts(GUILD)
    .addStringOption((o) =>
      o.setName("dice").setDescription("Like 1d20+3 or 2d6").setMaxLength(30).setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("map")
    .setDescription("See the map of everywhere your party knows about")
    .setContexts(GUILD),
  new SlashCommandBuilder()
    .setName("journal")
    .setDescription("Quests, promises, and the story so far")
    .setContexts(GUILD),
  new SlashCommandBuilder()
    .setName("xcard")
    .setDescription("Quietly steer the story away from something. Nobody sees who used it.")
    .setContexts(GUILD),
  new SlashCommandBuilder()
    .setName("dm")
    .setDescription("Tools for the human DM of an Assist-mode campaign")
    .setContexts(GUILD)
    .addSubcommand((s) =>
      s
        .setName("say")
        .setDescription("Post your own words to the table")
        .addStringOption((o) =>
          o.setName("text").setDescription("What the table hears").setMaxLength(1500).setRequired(true),
        ),
    ),
  new SlashCommandBuilder()
    .setName("loom")
    .setDescription("The hidden hand (DM only, Assist mode)")
    .setContexts(GUILD)
    .addSubcommand((s) => s.setName("view").setDescription("See what the hidden hand is holding"))
    .addSubcommand((s) =>
      s
        .setName("plant")
        .setDescription("Plant a good deed that will matter later")
        .addStringOption((o) =>
          o
            .setName("kind")
            .setDescription("What kind of deed")
            .setRequired(true)
            .addChoices(
              { name: "Mercy", value: "mercy" },
              { name: "Honesty that cost something", value: "honesty_at_cost" },
              { name: "Patience (refused a shortcut)", value: "patience" },
              { name: "A promise kept", value: "promise_kept" },
              { name: "Kindness to someone small", value: "kindness_to_lowly" },
              { name: "Giving something up for others", value: "self_sacrifice" },
              { name: "A keepsake kept", value: "keepsake_kept" },
              { name: "Making amends", value: "amends" },
            ),
        )
        .addStringOption((o) =>
          o
            .setName("what")
            .setDescription("What happened, in a few words")
            .setMaxLength(200)
            .setRequired(true),
        )
        .addStringOption((o) =>
          o.setName("who").setDescription("A named character it's tied to (optional)").setMaxLength(60),
        )
        .addStringOption((o) =>
          o
            .setName("weight")
            .setDescription("How much it should matter")
            .addChoices(
              { name: "A little", value: "small" },
              { name: "Some", value: "medium" },
              { name: "A lot", value: "large" },
            ),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("mode")
        .setDescription("Turn the hidden hand on or off for this campaign")
        .addStringOption((o) =>
          o
            .setName("mode")
            .setDescription("On or off")
            .setRequired(true)
            .addChoices({ name: "On", value: "auto" }, { name: "Off (I'll handle it)", value: "off" }),
        ),
    ),
  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Choose the table room and the private DM room, and see how setup is going")
    .setContexts(GUILD)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((o) =>
      o
        .setName("table")
        .setDescription("The room where everyone plays (each campaign gets a thread here)")
        .addChannelTypes(ChannelType.GuildText),
    )
    .addChannelOption((o) =>
      o
        .setName("dm-room")
        .setDescription("A private room for the DMs and the bot, where DM screens live")
        .addChannelTypes(ChannelType.GuildText),
    ),
  new SlashCommandBuilder()
    .setName("help")
    .setDescription("How to play, and how to set the bot up")
    .addStringOption((o) =>
      o
        .setName("topic")
        .setDescription("What do you need help with?")
        .addChoices(
          { name: "How to play", value: "play" },
          { name: "Setting up the bot on this server", value: "setup" },
          { name: "Game night or play by post", value: "pace" },
        ),
    ),
  new SlashCommandBuilder().setName("about").setDescription("About Discord Quests"),
  new SlashCommandBuilder().setName("privacy").setDescription("What the bot remembers"),
];

export function commandsJson() {
  return COMMANDS.map((c) => c.toJSON());
}
