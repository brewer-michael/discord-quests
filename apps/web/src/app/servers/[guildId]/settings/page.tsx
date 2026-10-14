import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { requireGuild } from "@/server/access";
import { services } from "@/server/db";
import { webEnv } from "@/server/env";
import { serverSettings } from "@/server/settings";
import { saveSettingsAction } from "../actions";

export const metadata = { title: "Settings & budget" };
export const dynamic = "force-dynamic";

export default async function Settings({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  await requireGuild(guildId);
  const { store } = services();
  const s = await serverSettings(services().handle.db, guildId);
  const env = webEnv();
  const platform = [...store.defaults.configs.values()].map((c) => c.name);
  const platformBudget = Number(env.DEFAULT_DAILY_BUDGET_USD ?? "5");
  const platformImages = Number(env.DEFAULT_DAILY_IMAGE_CAP ?? "30");

  return (
    <ActionForm action={saveSettingsAction.bind(null, guildId)} className="stack">
      <section className="card form">
        <h2>Spending</h2>
        <div className="fields-2">
          <div className="field">
            <label htmlFor="dailyBudgetUsd">Daily budget (US dollars)</label>
            <input
              id="dailyBudgetUsd"
              name="dailyBudgetUsd"
              type="number"
              min="0"
              step="0.01"
              defaultValue={s.dailyBudgetUsd ?? ""}
              placeholder="No limit"
            />
            <span className="hint">
              Covers your own keys. When it's used up, the story keeps going without AI until tomorrow (UTC).
            </span>
          </div>
          <div className="field">
            <label htmlFor="dailyImageCap">Pictures per day</label>
            <input
              id="dailyImageCap"
              name="dailyImageCap"
              type="number"
              min="0"
              step="1"
              defaultValue={s.dailyImageCap ?? ""}
              placeholder="No limit"
            />
            <span className="hint">After this, scenes reuse earlier pictures of the same place.</span>
          </div>
        </div>
        <label className="check-field">
          <input type="checkbox" name="usePlatformDefaults" defaultChecked={s.usePlatformDefaults} />
          <span>
            Use the bot's built-in services when this server hasn't chosen its own
            <br />
            <span className="hint">
              {platform.length > 0
                ? `Available: ${platform.join(", ")}. Shared limits apply: about $${platformBudget.toFixed(2)} and ${platformImages} pictures a day.`
                : "This bot's operator hasn't set up any built-in services."}
            </span>
          </span>
        </label>
      </section>

      <section className="card form">
        <h2>Defaults for new campaigns</h2>
        <div className="fields-2">
          <div className="field">
            <label htmlFor="imagePolicy">Scene art</label>
            <select id="imagePolicy" name="imagePolicy" defaultValue={s.game.imagePolicy}>
              <option value="new_scenes">For each new place or challenge</option>
              <option value="cruxes_only">Only for the big moments</option>
              <option value="off">Off</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="roundTimerSeconds">Time to choose each turn</label>
            <select
              id="roundTimerSeconds"
              name="roundTimerSeconds"
              defaultValue={String(s.game.roundTimerSeconds)}
            >
              <option value="60">1 minute</option>
              <option value="120">2 minutes</option>
              <option value="180">3 minutes</option>
              <option value="300">5 minutes</option>
              <option value="900">15 minutes</option>
              <option value="3600">1 hour</option>
              <option value="43200">12 hours (play by post)</option>
              <option value="86400">24 hours (play by post)</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="epilogueStyle">At the end of the story</label>
            <select id="epilogueStyle" name="epilogueStyle" defaultValue={s.game.epilogueStyle}>
              <option value="subtle">Hint at how earlier choices mattered</option>
              <option value="explicit">Spell out how earlier choices mattered</option>
              <option value="off">No looking back</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="loomMode">The hidden hand</label>
            <select id="loomMode" name="loomMode" defaultValue={s.game.loomMode}>
              <option value="auto">On: kindness and patience can quietly matter later</option>
              <option value="off">Off</option>
            </select>
            <span className="hint">In Assist mode the DM can also switch it off for one campaign.</span>
          </div>
        </div>
      </section>

      <div className="form-actions">
        <SubmitButton>Save settings</SubmitButton>
      </div>
    </ActionForm>
  );
}
