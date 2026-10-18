export * from "./appearance";
export * from "./campaign-service";
export * from "./character-rules";
export * from "./character-service";
export * from "./deps";
export * from "./director";
export * from "./dm-service";
export * from "./guide";
export * from "./logger";
export * from "./loom-store";
export * from "./narrator";
export * from "./pace";
export * from "./story-profile";
export * from "./story-state";
export * from "./story-writer";
export * from "./turn-service";
export * from "./views";
export * from "./world-cache";

import { CampaignService } from "./campaign-service";
import { CharacterService } from "./character-service";
import type { EngineDeps } from "./deps";
import { DmService } from "./dm-service";
import { StoryJobs } from "./story-writer/jobs";
import { TurnService } from "./turn-service";

export interface Engine {
  campaigns: CampaignService;
  characters: CharacterService;
  turns: TurnService;
  dm: DmService;
  /** The story writer's queue: what it's writing, and retries from the DM room. */
  storyJobs: StoryJobs;
  deps: EngineDeps;
}

export function createEngine(deps: EngineDeps): Engine {
  return {
    campaigns: new CampaignService(deps),
    characters: new CharacterService(deps),
    turns: new TurnService(deps),
    dm: new DmService(deps),
    storyJobs: new StoryJobs(deps.db, deps.now),
    deps,
  };
}
