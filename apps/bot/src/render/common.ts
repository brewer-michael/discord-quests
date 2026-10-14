import {
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from "discord.js";

export const COLORS = {
  lantern: 0xf2b84b,
  forest: 0x6aa36f,
  dusk: 0x5b6fb3,
  crux: 0xc0503a,
  calm: 0x8a9aa5,
  quick: 0xb5651d,
};

export const SCENE_COLOR: Record<string, number> = {
  exploration: COLORS.forest,
  social: COLORS.lantern,
  combat: COLORS.dusk,
  travel: COLORS.calm,
  rest: COLORS.calm,
  crux: COLORS.crux,
  choice: COLORS.quick,
};

export const V2: MessageFlags.IsComponentsV2 = MessageFlags.IsComponentsV2;
export const V2_EPHEMERAL: readonly [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral] = [
  MessageFlags.IsComponentsV2,
  MessageFlags.Ephemeral,
];

export const text = (content: string) => new TextDisplayBuilder().setContent(content.slice(0, 3900));
export const divider = (big = false) =>
  new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(big ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small);

/** Escapes Discord markdown in names players typed, so "**Bob**" stays literal. */
export function esc(s: string): string {
  return s.replace(/([\\*_`~|>#[\]()-])/g, "\\$1");
}

export function clip(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

export function notice(content: string, color = COLORS.calm) {
  return {
    components: [new ContainerBuilder().setAccentColor(color).addTextDisplayComponents(text(content))],
    flags: V2_EPHEMERAL,
  } as const;
}

/** Counts every component in a Components V2 payload (Discord allows 40). */
export function countComponents(json: unknown): number {
  let n = 0;
  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== "object") return;
    const o = node as Record<string, unknown>;
    if (typeof o.type === "number") n += 1;
    if (o.components) walk(o.components);
    if (o.accessory) walk(o.accessory);
    if (o.items && o.type === 12) n += (o.items as unknown[]).length;
    if (o.component) walk(o.component);
  };
  walk(json);
  return n;
}

export function textLength(json: unknown): number {
  let n = 0;
  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== "object") return;
    const o = node as Record<string, unknown>;
    if (o.type === 10 && typeof o.content === "string") n += o.content.length;
    for (const v of Object.values(o)) if (typeof v === "object") walk(v);
  };
  walk(json);
  return n;
}
