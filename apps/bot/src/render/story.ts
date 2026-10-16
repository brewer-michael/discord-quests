/**
 * The story settings card ("Shape your adventure"), shown to the host after /campaign new and by /campaign story:
 * how dark the story gets, how it's told, what its pictures look like, and what the table wants in it or left out.
 */
import {
  ART_INFO,
  ART_STYLES,
  type ArtStyle,
  describeProfile,
  HUMOR_INFO,
  HUMORS,
  INTENSITIES,
  INTENSITY_INFO,
  type Intensity,
  PROFILE_LIMITS,
  type StoryProfile,
  VOICE_INFO,
  VOICES,
} from "@dq/core/narration";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  LabelBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { encodeId, type StoryAction } from "../ids";
import { COLORS, clip, divider, esc, prefill, text, V2_EPHEMERAL } from "./common";

export interface StoryCardInfo {
  campaignId: string;
  campaignName: string;
  profile: StoryProfile;
  /** The intensity it's told at right now (Epic without a guardian plays at Classic on family campaigns). */
  told: Intensity;
  audience: "family" | "teen";
  /** A problem with the last change, shown at the top. */
  problem?: string;
}

function select(campaignId: string, action: StoryAction, placeholder: string) {
  return new StringSelectMenuBuilder()
    .setCustomId(encodeId({ kind: "story", campaignId, action }))
    .setPlaceholder(placeholder);
}

const option = (value: string, label: string, description: string, selected: boolean) =>
  new StringSelectMenuOptionBuilder()
    .setValue(value)
    .setLabel(clip(label, 100))
    .setDescription(clip(description, 100))
    .setDefault(selected);

const button = (campaignId: string, action: StoryAction) =>
  new ButtonBuilder().setCustomId(encodeId({ kind: "story", campaignId, action }));

export function renderStoryCard(info: StoryCardInfo) {
  const { profile, campaignId } = info;
  const c = new ContainerBuilder().setAccentColor(COLORS.lantern);
  c.addTextDisplayComponents(
    text(
      `## Shape your adventure\n-# ${esc(info.campaignName)}: how the story is told. Change it any time with \`/campaign story\`.`,
    ),
  );
  if (info.problem) c.addTextDisplayComponents(text(`⚠️ ${info.problem}`));
  c.addTextDisplayComponents(text(`**Now:** ${describeProfile(profile, info.told)}`));

  c.addTextDisplayComponents(
    text(
      "**How dark can it get?** Every setting stays free of gore, anything sexual, and dark magic shown in detail.",
    ),
  );
  c.addActionRowComponents(
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      select(campaignId, "intensity", "Intensity").addOptions(
        INTENSITIES.map((i) =>
          option(
            i,
            `${INTENSITY_INFO[i].label}: like ${INTENSITY_INFO[i].like}`,
            i === "epic" && info.audience === "teen"
              ? "War, truly menacing villains, sacrifice and slow dread."
              : INTENSITY_INFO[i].blurb,
            profile.intensity === i,
          ),
        ),
      ),
    ),
  );
  c.addActionRowComponents(
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      select(campaignId, "voice", "Storyteller voice").addOptions(
        VOICES.map((v) =>
          option(v, `Voice: ${VOICE_INFO[v].label}`, VOICE_INFO[v].blurb, profile.voice === v),
        ),
      ),
    ),
  );
  c.addActionRowComponents(
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      select(campaignId, "humor", "Humor").addOptions(
        HUMORS.map((h) =>
          option(h, `Humor: ${HUMOR_INFO[h].label}`, HUMOR_INFO[h].prompt, profile.humor === h),
        ),
      ),
    ),
  );
  c.addActionRowComponents(
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      select(campaignId, "art", "Picture style").addOptions(
        ART_STYLES.map((a: ArtStyle) =>
          option(
            a,
            `Pictures: ${ART_INFO[a].label}`,
            a === "custom" ? profile.artCustom || "Describe it under Premise & topics" : ART_INFO[a].prompt,
            profile.art === a,
          ),
        ),
      ),
    ),
  );

  const wishes = [
    profile.premise ? `**Premise:** ${esc(clip(profile.premise, 300))}` : "",
    profile.lines.length > 0 ? `**Left out:** ${esc(profile.lines.join(", "))}` : "",
    profile.veils.length > 0 ? `**Kept offscreen:** ${esc(profile.veils.join(", "))}` : "",
  ].filter(Boolean);
  c.addSeparatorComponents(divider());
  c.addTextDisplayComponents(
    text(
      wishes.length > 0
        ? wishes.join("\n")
        : "-# Optional: a premise for this table's story (names, mood, villains), and topics to leave out or keep offscreen.",
    ),
  );
  c.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      button(campaignId, "wishes")
        .setLabel("Premise & topics…")
        .setEmoji("✍️")
        .setStyle(ButtonStyle.Secondary),
      button(campaignId, "done").setLabel("Done").setEmoji("✅").setStyle(ButtonStyle.Success),
    ),
  );
  return { components: [c], flags: V2_EPHEMERAL };
}

/** The card once the host is done: what was chosen, in a line. */
export function renderStoryDone(info: StoryCardInfo) {
  const c = new ContainerBuilder()
    .setAccentColor(COLORS.forest)
    .addTextDisplayComponents(
      text(
        `✅ **Story settings saved.** ${describeProfile(info.profile, info.told)}\n-# \`/campaign story\` changes them any time.`,
      ),
    );
  return { components: [c], flags: V2_EPHEMERAL };
}

export function storyModal(campaignId: string, profile: StoryProfile) {
  return new ModalBuilder()
    .setCustomId(encodeId({ kind: "story-modal", campaignId }))
    .setTitle("Premise & topics")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("What should this story feel like?")
        .setDescription("Names, mood, villains, motifs. It colors the world; the main story stays.")
        .setTextInputComponent(
          prefill(
            new TextInputBuilder()
              .setCustomId("premise")
              .setStyle(TextInputStyle.Paragraph)
              .setMaxLength(PROFILE_LIMITS.premise)
              .setRequired(false)
              .setPlaceholder("A dragon has taken the mountain, and the dwarves want their home back."),
            profile.premise,
          ),
        ),
      new LabelBuilder()
        .setLabel("Leave out entirely")
        .setDescription("Separate topics with commas.")
        .setTextInputComponent(
          prefill(
            new TextInputBuilder()
              .setCustomId("lines")
              .setStyle(TextInputStyle.Short)
              .setMaxLength(300)
              .setRequired(false)
              .setPlaceholder("spiders, drowning"),
            profile.lines.join(", "),
          ),
        ),
      new LabelBuilder()
        .setLabel("Keep offscreen")
        .setDescription("It may happen, but is never shown. Separate with commas.")
        .setTextInputComponent(
          prefill(
            new TextInputBuilder()
              .setCustomId("veils")
              .setStyle(TextInputStyle.Short)
              .setMaxLength(300)
              .setRequired(false)
              .setPlaceholder("being lost in the dark"),
            profile.veils.join(", "),
          ),
        ),
      new LabelBuilder()
        .setLabel("Your own picture style (optional)")
        .setDescription("Filling this in switches pictures to your style.")
        .setTextInputComponent(
          prefill(
            new TextInputBuilder()
              .setCustomId("art")
              .setStyle(TextInputStyle.Short)
              .setMaxLength(PROFILE_LIMITS.artCustom)
              .setRequired(false)
              .setPlaceholder("ink and watercolor, like an old map"),
            profile.artCustom,
          ),
        ),
    );
}
