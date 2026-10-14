import { connect, type DbHandle } from "@dq/db";
import { type MasterKey, parseMasterKeys } from "@dq/db/crypto";
import { BudgetGuard, ProviderStore } from "@dq/providers";
import { webEnv } from "./env";

interface Services {
  handle: DbHandle;
  keys: MasterKey[];
  store: ProviderStore;
  budget: BudgetGuard;
}

const g = globalThis as typeof globalThis & { __dqWeb?: Services };

/** One pool per server process (and per dev hot-reload). */
export function services(): Services {
  if (g.__dqWeb) return g.__dqWeb;
  const env = webEnv();
  const handle = connect(env.DATABASE_URL, { max: 5 });
  g.__dqWeb = {
    handle,
    keys: parseMasterKeys(env.MASTER_KEYS),
    store: new ProviderStore(handle.db, env),
    budget: new BudgetGuard(handle.db, env),
  };
  return g.__dqWeb;
}
