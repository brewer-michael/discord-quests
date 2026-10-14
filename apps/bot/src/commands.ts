import { InteractionContextType, SlashCommandBuilder } from "discord.js";

const GUILD = InteractionContextType.Guild;

export const COMMANDS = [
  new SlashCommandBuilder()
    .setName("campaign")
    .setDescription("Start and manage adventures")
    .setContexts(GUILD)
    .addSubcommand((s) =>
      s
        .setName("new")
        .setDescription("Start a new campaign in this channel")
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
        ),
    )
    .addSubcommand((s) => s.setName("join").setDescription("Join the campaign in this thread"))
    .addSubcommand((s) => s.setName("leave").setDescription("Leave the campaign in this thread"))
    .addSubcommand((s) => s.setName("start").setDescription("Begin the adventure (host or DM)"))
    .addSubcommand((s) => s.setName("status").setDescription("Who's playing and where the story is"))
    .addSubcommand((s) => s.setName("pause").setDescription("Pause the adventure (host or DM)"))
    .addSubcommand((s) => s.setName("resume").setDescription("Resume the adventure (host or DM)"))
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
    .setName("setup")
    .setDescription("Set up story and image providers for this server")
    .setContexts(GUILD),
  new SlashCommandBuilder().setName("help").setDescription("How to play"),
  new SlashCommandBuilder().setName("about").setDescription("About Discord Quests"),
  new SlashCommandBuilder().setName("privacy").setDescription("What the bot remembers"),
];

export function commandsJson() {
  return COMMANDS.map((c) => c.toJSON());
}
