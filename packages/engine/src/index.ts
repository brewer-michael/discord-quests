export * from "./campaign-service";
export * from "./character-rules";
export * from "./character-service";
export * from "./deps";
export * from "./director";
export * from "./loom-store";
export * from "./narrator";
export * from "./story-state";
export * from "./turn-service";
export * from "./views";
export * from "./world-cache";

import { CampaignService } from "./campaign-service";
import { CharacterService } from "./character-service";
import type { EngineDeps } from "./deps";
import { TurnService } from "./turn-service";

export interface Engine {
  campaigns: CampaignService;
  characters: CharacterService;
  turns: TurnService;
  deps: EngineDeps;
}

export function createEngine(deps: EngineDeps): Engine {
  return {
    campaigns: new CampaignService(deps),
    characters: new CharacterService(deps),
    turns: new TurnService(deps),
    deps,
  };
}
