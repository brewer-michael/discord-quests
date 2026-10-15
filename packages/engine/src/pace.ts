/**
 * How fast a campaign plays. A game night wants quick rounds and no pings;
 * play by post wants long rounds, a ping when a new turn opens, and a
 * reminder before it closes. A campaign can switch between them any time.
 */
export type Pace = "live" | "post";

export interface PaceSettings {
  pace: Pace;
  /** How long players have to act before the round goes on without them. 0 waits for everyone. */
  roundTimerSeconds: number;
  /** Mention players when a turn opens and remind those who haven't acted. */
  pingPlayers: boolean;
}

export const PACES: Record<Pace, PaceSettings & { label: string; blurb: string }> = {
  live: {
    pace: "live",
    label: "Game night",
    blurb: "Everyone's here at once: quick rounds, no pings.",
    roundTimerSeconds: 180,
    pingPlayers: false,
  },
  post: {
    pace: "post",
    label: "Play by post",
    blurb: "Take turns over days: a ping when it's your turn, and a reminder before the round moves on.",
    roundTimerSeconds: 86_400,
    pingPlayers: true,
  },
};

export const MAX_ROUND_SECONDS = 7 * 86_400;

/** The timer choices offered in Discord and on the setup page. */
export const TIMER_CHOICES: Array<{ seconds: number; label: string }> = [
  { seconds: 120, label: "2 minutes" },
  { seconds: 180, label: "3 minutes" },
  { seconds: 300, label: "5 minutes" },
  { seconds: 600, label: "10 minutes" },
  { seconds: 43_200, label: "12 hours" },
  { seconds: 86_400, label: "1 day" },
  { seconds: 172_800, label: "2 days" },
  { seconds: 259_200, label: "3 days" },
  { seconds: 604_800, label: "1 week" },
  { seconds: 0, label: "No limit (wait for everyone)" },
];

export function validTimer(seconds: unknown): seconds is number {
  return (
    typeof seconds === "number" &&
    Number.isInteger(seconds) &&
    (seconds === 0 || (seconds >= 60 && seconds <= MAX_ROUND_SECONDS))
  );
}

/** Minutes suit game night, hours and days suit play by post. Waiting for everyone (0) suits both. */
export function timerFitsPace(pace: Pace, seconds: number): boolean {
  return seconds === 0 || (pace === "live" ? seconds <= 3600 : seconds >= 3600);
}

/** Reads a campaign's pace, filling gaps for campaigns made before pace existed. */
export function paceOf(settings: Record<string, unknown> | undefined): PaceSettings {
  const s = settings ?? {};
  const timer = validTimer(s.roundTimerSeconds) ? s.roundTimerSeconds : PACES.live.roundTimerSeconds;
  const pace: Pace =
    s.pace === "post" || s.pace === "live" ? s.pace : timer === 0 || timer > 3600 ? "post" : "live";
  return {
    pace,
    roundTimerSeconds: timer,
    pingPlayers: typeof s.pingPlayers === "boolean" ? s.pingPlayers : PACES[pace].pingPlayers,
  };
}

export function describeTimer(seconds: number): string {
  if (seconds === 0) return "no time limit";
  const known = TIMER_CHOICES.find((c) => c.seconds === seconds);
  if (known) return known.label;
  if (seconds % 86_400 === 0) return `${seconds / 86_400} days`;
  if (seconds % 3600 === 0) return `${seconds / 3600} hours`;
  return `${Math.round(seconds / 60)} minutes`;
}

const HOUR = 3_600_000;

/**
 * When to remind the players who haven't acted yet, or null for no reminder.
 * With a deadline: once, a while before it (a quarter of the round, between
 * one and twelve hours). Without one: a gentle nudge every day.
 */
export function reminderAt(
  pace: PaceSettings,
  round: { createdAt: Date; deadlineAt: Date | null; remindedAt: Date | null },
): Date | null {
  if (!pace.pingPlayers) return null;
  if (round.deadlineAt) {
    if (round.remindedAt) return null;
    const window = pace.roundTimerSeconds * 1000;
    if (window < 2 * HOUR) return null;
    const lead = Math.min(12 * HOUR, Math.max(HOUR, window / 4));
    return new Date(round.deadlineAt.getTime() - lead);
  }
  return new Date((round.remindedAt ?? round.createdAt).getTime() + 24 * HOUR);
}

/**
 * What happens when a round's time is up. Normally the story goes on, and
 * whoever didn't choose watches and waits. But if nobody chose anything,
 * going on would waste the turn: play by post gives everyone another round
 * of the timer, and game night simply waits until someone chooses.
 */
export function whenTimeIsUp(
  pace: PaceSettings,
  partySize: number,
  stillWaiting: number,
): "resolve" | "extend" | "wait" {
  if (partySize === 0 || stillWaiting < partySize) return "resolve";
  return pace.pace === "post" && pace.roundTimerSeconds > 0 ? "extend" : "wait";
}
