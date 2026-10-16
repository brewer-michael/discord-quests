/**
 * Randomness, two kinds.
 *
 * The dice players see come from trueRng(): the platform's cryptographic
 * generator, so every roll is a real roll. Everything behind the scenes (the
 * loom, story choices, flavor) comes from an Rng derived from a campaign's
 * master seed plus a stream name and turn number, so it can be replayed
 * exactly. Streams are independent: tuning the loom never changes the story's
 * other draws. Tests can derive the "rules" stream too, to replay dice.
 */

export type RngStream = "rules" | "loom" | "story" | "flavor";

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max], inclusive. */
  int(min: number, max: number): number;
  /** True with probability p. */
  chance(p: number): boolean;
  /** One element, uniformly. Throws on an empty array. */
  pick<T>(items: readonly T[]): T;
  /** One element chosen by weight. Throws if all weights are zero. */
  weighted<T>(items: readonly T[], weight: (item: T) => number): T;
  /** A multiplier in [1 - fraction, 1 + fraction]. */
  jitter(fraction: number): number;
  /** Fisher-Yates shuffle into a new array. */
  shuffle<T>(items: readonly T[]): T[];
  /** Number of raw draws taken so far. */
  readonly draws: number;
}

/** cyrb128: a fast 128-bit string hash, returned as four 32-bit words. */
export function hash128(input: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < input.length; i++) {
    const k = input.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** Short hex digest of a string, for cache keys and input hashes. */
export function hashHex(input: string): string {
  return hash128(input)
    .map((n) => n.toString(16).padStart(8, "0"))
    .join("");
}

/** The helpers every Rng shares, built on one uniform draw. */
abstract class BaseRng implements Rng {
  protected count = 0;

  /** A uniform float in [0, 1). */
  protected abstract raw(): number;

  get draws(): number {
    return this.count;
  }

  protected resetDraws(): void {
    this.count = 0;
  }

  next(): number {
    this.count++;
    return this.raw();
  }

  int(min: number, max: number): number {
    checkBounds(min, max);
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number): boolean {
    if (p <= 0) return false;
    if (p >= 1) return true;
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError("pick() from an empty array");
    return items[this.int(0, items.length - 1)] as T;
  }

  weighted<T>(items: readonly T[], weight: (item: T) => number): T {
    const weights = items.map((item) => Math.max(0, weight(item)));
    const total = weights.reduce((sum, w) => sum + w, 0);
    if (total <= 0) throw new RangeError("weighted() needs at least one positive weight");
    let roll = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      roll -= weights[i] as number;
      if (roll < 0) return items[i] as T;
    }
    return items[items.length - 1] as T;
  }

  jitter(fraction: number): number {
    return 1 + (this.next() * 2 - 1) * fraction;
  }

  shuffle<T>(items: readonly T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [out[i], out[j]] = [out[j] as T, out[i] as T];
    }
    return out;
  }
}

class Sfc32Rng extends BaseRng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: [number, number, number, number]) {
    super();
    [this.a, this.b, this.c, this.d] = seed;
    // Warm up so that similar seeds diverge quickly.
    for (let i = 0; i < 12; i++) this.raw();
    this.resetDraws();
  }

  protected raw(): number {
    this.a >>>= 0;
    this.b >>>= 0;
    this.c >>>= 0;
    this.d >>>= 0;
    let t = (this.a + this.b) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.d = (this.d + 1) | 0;
    t = (t + this.d) | 0;
    this.c = (this.c + t) | 0;
    return (t >>> 0) / 4294967296;
  }
}

/** Real randomness from the platform's cryptographic generator, drawn a batch at a time. */
class CryptoRng extends BaseRng {
  private readonly buf = new Uint32Array(64);
  private at = this.buf.length;

  private word(): number {
    if (this.at >= this.buf.length) {
      globalThis.crypto.getRandomValues(this.buf);
      this.at = 0;
    }
    return this.buf[this.at++] as number;
  }

  protected raw(): number {
    // 53 random bits: as fine-grained as a double gets.
    return ((this.word() >>> 5) * 67108864 + (this.word() >>> 6)) / 9007199254740992;
  }

  /** Exactly uniform: draws that would favor some faces are thrown away and drawn again. */
  override int(min: number, max: number): number {
    checkBounds(min, max);
    const span = max - min + 1;
    if (span > 4294967296) return super.int(min, max);
    const limit = 4294967296 - (4294967296 % span);
    let w = this.word();
    while (w >= limit) w = this.word();
    this.count++;
    return min + (w % span);
  }
}

function checkBounds(min: number, max: number) {
  if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
    throw new RangeError(`int(${min}, ${max}): bounds must be integers with min <= max`);
  }
}

/** An Rng seeded from an arbitrary string key. */
export function createRng(key: string): Rng {
  return new Sfc32Rng(hash128(key));
}

/** Real dice: an Rng that nothing can predict or replay. */
export function trueRng(): Rng {
  return new CryptoRng();
}

/**
 * The canonical derivation: one independent Rng per (campaign seed, stream,
 * turn, sub-key). There is no shared mutable RNG state anywhere in the game.
 */
export function deriveRng(masterSeed: string, stream: RngStream, turnSeq: number, subKey = ""): Rng {
  return createRng(deriveKey(masterSeed, stream, turnSeq, subKey));
}

export function deriveKey(masterSeed: string, stream: RngStream, turnSeq: number, subKey = ""): string {
  return `${masterSeed}|${stream}|${turnSeq}|${subKey}`;
}

/** A fixed sequence of values, for tests that need exact rolls. Values must be in [0, 1). */
export function sequenceRng(values: readonly number[]): Rng {
  let i = 0;
  const base = createRng("sequence");
  const next = () => {
    if (i >= values.length) throw new RangeError("sequenceRng exhausted");
    const v = values[i++] as number;
    if (v < 0 || v >= 1) throw new RangeError(`sequenceRng value out of range: ${v}`);
    return v;
  };
  const rng: Rng = {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => (p <= 0 ? false : p >= 1 ? true : next() < p),
    pick: (items) => {
      if (items.length === 0) throw new RangeError("pick() from an empty array");
      return items[Math.floor(next() * items.length)] as (typeof items)[number];
    },
    weighted: (items, weight) => {
      const weights = items.map((it) => Math.max(0, weight(it)));
      const total = weights.reduce((s, w) => s + w, 0);
      let roll = next() * total;
      for (let k = 0; k < items.length; k++) {
        roll -= weights[k] as number;
        if (roll < 0) return items[k] as (typeof items)[number];
      }
      return items[items.length - 1] as (typeof items)[number];
    },
    jitter: (fraction) => 1 + (next() * 2 - 1) * fraction,
    shuffle: (items) => base.shuffle(items),
    get draws() {
      return i;
    },
  };
  return rng;
}

/** Value that makes a sequenceRng produce `face` on a die with `sides` sides. */
export function faceValue(face: number, sides: number): number {
  return (face - 1) / sides + 1 / (sides * 2);
}
