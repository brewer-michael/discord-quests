/**
 * Shared vocabulary for the loom (the hidden "Swift Sure Hand"). World files
 * refer to these names, so they are part of the world format.
 */

/** Deeds that plant threads. */
export const VIRTUE_TAGS = [
  "mercy",
  "honesty_at_cost",
  "patience",
  "promise_kept",
  "kindness_to_lowly",
  "self_sacrifice",
  "keepsake_kept",
  "amends",
] as const;

/** Deeds that tie snares. */
export const SHORTCUT_TAGS = [
  "cheat",
  "deceive",
  "break_promise",
  "fox_bargain",
  "trade_keepsake",
  "abandon_ally",
  "steal",
] as const;

export type VirtueTag = (typeof VIRTUE_TAGS)[number];
export type ShortcutTag = (typeof SHORTCUT_TAGS)[number];
export type DeedTag = VirtueTag | ShortcutTag;
export const DEED_TAGS: readonly DeedTag[] = [...VIRTUE_TAGS, ...SHORTCUT_TAGS];

export function isVirtueTag(tag: string): tag is VirtueTag {
  return (VIRTUE_TAGS as readonly string[]).includes(tag);
}

export function isShortcutTag(tag: string): tag is ShortcutTag {
  return (SHORTCUT_TAGS as readonly string[]).includes(tag);
}

/**
 * Payoff "sockets": the shapes a hidden payoff can take at a decisive moment
 * or at the end of a quiet-hand detour.
 */
export const SOCKET_TYPES = [
  "spared_one_acts",
  "ally_arrives",
  "knowledge_given",
  "trusted_at_need",
  "hidden_way",
  "object_reveals",
  "enemy_blunder",
  "ambush_avoided",
] as const;

export type SocketType = (typeof SOCKET_TYPES)[number];

export const SNARE_EFFECTS = [
  "withhold_socket",
  "borrowed_luck_recalled",
  "trust_lost",
  "fox_collects",
  "longer_way",
] as const;

export type SnareEffect = (typeof SNARE_EFFECTS)[number];

export const ANCHOR_KINDS = ["npc", "item", "place", "faction"] as const;
export type AnchorKind = (typeof ANCHOR_KINDS)[number];
