/**
 * Button, select and modal ids. Ids carry only public references (round,
 * campaign, character ids and a small action); hidden story data never goes in
 * an id. Discord limits custom ids to 100 characters.
 */
export type CustomId =
  | { kind: "choice"; roundId: string; index: number }
  | { kind: "freeform"; roundId: string }
  | { kind: "freeform-modal"; roundId: string }
  | { kind: "pass"; roundId: string }
  | { kind: "resolve"; roundId: string }
  | { kind: "sheet"; campaignId: string }
  | { kind: "map"; campaignId: string }
  | { kind: "map-focus"; campaignId: string }
  | { kind: "xcard"; campaignId: string }
  | { kind: "join"; campaignId: string }
  | { kind: "create"; campaignId: string }
  | { kind: "start"; campaignId: string }
  | { kind: "wizard"; campaignId: string; page: number; action: string }
  | { kind: "wizard-name"; campaignId: string }
  | { kind: "levelup"; characterId: string };

const CODES: Record<CustomId["kind"], string> = {
  choice: "ch",
  freeform: "ff",
  "freeform-modal": "ffm",
  pass: "ps",
  resolve: "rs",
  sheet: "sh",
  map: "mp",
  "map-focus": "mpf",
  xcard: "xc",
  join: "jn",
  create: "cr",
  start: "st",
  wizard: "wz",
  "wizard-name": "wzn",
  levelup: "lv",
};
const KINDS = Object.fromEntries(Object.entries(CODES).map(([k, v]) => [v, k])) as Record<
  string,
  CustomId["kind"]
>;

export function encodeId(id: CustomId): string {
  const parts: Array<string | number> = ["dq", CODES[id.kind]];
  switch (id.kind) {
    case "choice":
      parts.push(id.roundId, id.index);
      break;
    case "freeform":
    case "freeform-modal":
    case "pass":
    case "resolve":
      parts.push(id.roundId);
      break;
    case "wizard":
      parts.push(id.campaignId, id.page, id.action);
      break;
    case "levelup":
      parts.push(id.characterId);
      break;
    default:
      parts.push(id.campaignId);
  }
  const out = parts.join(":");
  if (out.length > 100) throw new Error(`custom id too long: ${out}`);
  return out;
}

const UUID = /^[0-9a-f-]{36}$/;

export function decodeId(raw: string): CustomId | null {
  const parts = raw.split(":");
  if (parts[0] !== "dq") return null;
  const kind = KINDS[parts[1] ?? ""];
  if (!kind) return null;
  const a = parts[2] ?? "";
  if (!UUID.test(a)) return null;
  switch (kind) {
    case "choice": {
      const index = Number(parts[3]);
      return Number.isInteger(index) && index >= 0 && index < 10 ? { kind, roundId: a, index } : null;
    }
    case "freeform":
    case "freeform-modal":
    case "pass":
    case "resolve":
      return { kind, roundId: a };
    case "wizard": {
      const page = Number(parts[3]);
      const action = parts.slice(4).join(":");
      return Number.isInteger(page) && action ? { kind, campaignId: a, page, action } : null;
    }
    case "levelup":
      return { kind, characterId: a };
    default:
      return { kind, campaignId: a } as CustomId;
  }
}
