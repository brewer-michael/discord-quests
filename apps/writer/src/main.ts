/**
 * The story writer service: its own process, in the same Docker image as the bot with a different command, working
 * through the story writer's queue (see docs/RUNNING.md, "The story writer"). It shares the bot's service code and
 * dependencies; apps/writer becomes a workspace package of its own once pnpm-lock.yaml may be regenerated for it
 * (docs/MILESTONE-story-writer.md).
 */
import "../../bot/src/writer";
