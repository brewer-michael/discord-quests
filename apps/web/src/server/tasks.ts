import type { RouteTask } from "@dq/providers";

export const STORY_TASKS = [
  "narrator",
  "director",
  "writer",
  "intent",
  "safety",
  "judge",
  "summarizer",
] as const;
export const ALL_TASKS: readonly RouteTask[] = [...STORY_TASKS, "image"];
export const EFFORTS = ["none", "minimal", "low", "medium", "high", "xhigh", "max"] as const;

export const TASK_INFO: Record<RouteTask, { label: string; help: string }> = {
  narrator: { label: "Storyteller", help: "Writes every turn. Your best model belongs here." },
  director: {
    label: "Planner",
    help: "Plans where the story goes next. The story writer uses this service unless it has its own.",
  },
  writer: {
    label: "Story writer",
    help: "Writes chapters ahead of the table, in the background. A slow, strong model is fine.",
  },
  intent: { label: "Action reader", help: "Works out what a player's own words mean. Fast models are fine." },
  safety: { label: "Safety check", help: "Reads what players type, for stories told at Light." },
  judge: {
    label: "Secret keeper",
    help: "Double-checks turns where the hidden hand acted, the finale, every chapter recap, and every turn at Epic.",
  },
  summarizer: { label: "Chronicler", help: "Writes chapter recaps for the journal." },
  image: { label: "Scene art", help: "Paints a picture when the party reaches somewhere new." },
};

export function isTask(v: string): v is RouteTask {
  return (ALL_TASKS as readonly string[]).includes(v);
}
