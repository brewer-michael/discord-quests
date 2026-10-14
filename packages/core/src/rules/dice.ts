import type { Rng } from "../rng/index";

/** One term of a dice expression, e.g. 2d6, 4d6kh3, or a flat +3. */
export type DiceTerm =
  | { kind: "dice"; sign: 1 | -1; count: number; sides: number; keep?: { highest: boolean; n: number } }
  | { kind: "flat"; sign: 1 | -1; value: number };

export interface DiceExpression {
  notation: string;
  terms: DiceTerm[];
}

export interface TermResult {
  term: DiceTerm;
  rolls: number[];
  kept: number[];
  subtotal: number;
}

export interface DiceResult {
  notation: string;
  total: number;
  terms: TermResult[];
  critical: boolean;
}

const TERM_RE = /^(\d*)d(\d+)(?:(kh|kl)(\d+))?$/i;
const MAX_DICE = 100;
const MAX_SIDES = 1000;

/** Parses expressions like "1d20+5", "2d6 - 1", "4d6kh3", "d8". Throws on invalid input. */
export function parseDice(notation: string): DiceExpression {
  const compact = notation.replace(/\s+/g, "");
  if (compact.length === 0 || compact.length > 64)
    throw new SyntaxError(`Invalid dice notation: "${notation}"`);
  const pieces = compact.match(/[+-]?[^+-]+/g);
  if (!pieces || pieces.join("") !== compact) throw new SyntaxError(`Invalid dice notation: "${notation}"`);
  const terms: DiceTerm[] = pieces.map((piece) => {
    const sign: 1 | -1 = piece.startsWith("-") ? -1 : 1;
    const body = piece.replace(/^[+-]/, "");
    if (/^\d+$/.test(body)) return { kind: "flat", sign, value: Number(body) };
    const m = TERM_RE.exec(body);
    if (!m) throw new SyntaxError(`Invalid dice term: "${piece}"`);
    const count = m[1] === "" ? 1 : Number(m[1]);
    const sides = Number(m[2]);
    if (count < 1 || count > MAX_DICE) throw new RangeError(`Dice count must be 1-${MAX_DICE}`);
    if (sides < 2 || sides > MAX_SIDES) throw new RangeError(`Dice sides must be 2-${MAX_SIDES}`);
    const term: DiceTerm = { kind: "dice", sign, count, sides };
    if (m[3]) {
      const n = Number(m[4]);
      if (n < 1 || n > count) throw new RangeError(`Keep count must be 1-${count}`);
      term.keep = { highest: m[3].toLowerCase() === "kh", n };
    }
    return term;
  });
  return { notation: compact, terms };
}

export function rollDie(sides: number, rng: Rng): number {
  return rng.int(1, sides);
}

/**
 * Rolls an expression. On a critical hit, the number of dice in each dice term
 * is doubled (flat modifiers are not), following the SRD.
 */
export function rollDice(
  expr: DiceExpression | string,
  rng: Rng,
  opts: { critical?: boolean } = {},
): DiceResult {
  const parsed = typeof expr === "string" ? parseDice(expr) : expr;
  const critical = opts.critical ?? false;
  const terms: TermResult[] = parsed.terms.map((term) => {
    if (term.kind === "flat") {
      return { term, rolls: [], kept: [], subtotal: term.sign * term.value };
    }
    const count = critical && !term.keep ? term.count * 2 : term.count;
    const rolls = Array.from({ length: count }, () => rollDie(term.sides, rng));
    let kept = rolls;
    if (term.keep) {
      const sorted = [...rolls].sort((a, b) => (term.keep?.highest ? b - a : a - b));
      kept = sorted.slice(0, term.keep.n);
    }
    const sum = kept.reduce((s, r) => s + r, 0);
    return { term, rolls, kept, subtotal: term.sign * sum };
  });
  const total = terms.reduce((s, t) => s + t.subtotal, 0);
  return { notation: parsed.notation, total, terms, critical };
}

/** Average result, rounded down, as used for fixed hit points and monster damage. */
export function averageDice(expr: DiceExpression | string): number {
  const parsed = typeof expr === "string" ? parseDice(expr) : expr;
  let total = 0;
  for (const term of parsed.terms) {
    if (term.kind === "flat") total += term.sign * term.value;
    else {
      const n = term.keep ? term.keep.n : term.count;
      total += term.sign * n * ((term.sides + 1) / 2);
    }
  }
  return Math.floor(total);
}

export function formatDiceResult(result: DiceResult): string {
  const parts = result.terms.map((t) => {
    const sign = t.term.sign < 0 ? "-" : "+";
    if (t.term.kind === "flat") return `${sign}${t.term.value}`;
    return `${sign}[${t.rolls.join(",")}]`;
  });
  const body = parts.join(" ").replace(/^\+/, "");
  return `${result.notation}: ${body} = ${result.total}`;
}
