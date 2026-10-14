import { connect } from "./client";
import { parseMasterKeys } from "./crypto";
import { rotateSecrets } from "./rotate";

const url = process.env.DATABASE_URL;
if (!url || !process.env.MASTER_KEYS) {
  console.error("Set DATABASE_URL and MASTER_KEYS (newest key first, older keys after it).");
  process.exit(1);
}
const handle = connect(url, { max: 1 });
try {
  const keys = parseMasterKeys(process.env.MASTER_KEYS);
  const done = await rotateSecrets(handle.db, keys);
  console.log(
    `Re-encrypted ${done.secrets} API keys and ${done.sessions} sign-in tokens with ${keys[0]?.version}. The older keys can now be removed from MASTER_KEYS.`,
  );
} finally {
  await handle.close();
}
