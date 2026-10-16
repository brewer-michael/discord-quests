import {
  ART_INFO,
  HUMOR_INFO,
  HUMORS,
  INTENSITIES,
  INTENSITY_INFO,
  VOICE_INFO,
  VOICES,
} from "@dq/core/narration";
import { describeTimer, PACES, TIMER_CHOICES, timerFitsPace } from "@dq/engine/pace";
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
        <p className="hint">
          The host shapes each campaign's story when it's created (and with <code>/campaign story</code>);
          these are where it starts. Every setting stays free of gore, anything sexual, and dark magic shown
          in detail.
        </p>
        <div className="fields-2">
          <div className="field">
            <label htmlFor="intensity">How dark stories can get</label>
            <select id="intensity" name="intensity" defaultValue={s.game.intensity}>
              {INTENSITIES.map((i) => (
                <option key={i} value={i}>
                  {INTENSITY_INFO[i].label}: like {INTENSITY_INFO[i].like}
                </option>
              ))}
            </select>
            <span className="hint">
              {INTENSITY_INFO[s.game.intensity].blurb} On family campaigns, Epic needs a guardian.
            </span>
          </div>
          <div className="field">
            <label htmlFor="voice">Storyteller voice</label>
            <select id="voice" name="voice" defaultValue={s.game.voice}>
              {VOICES.map((v) => (
                <option key={v} value={v}>
                  {VOICE_INFO[v].label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="humor">Humor</label>
            <select id="humor" name="humor" defaultValue={s.game.humor}>
              {HUMORS.map((h) => (
                <option key={h} value={h}>
                  {HUMOR_INFO[h].label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="art">Picture style</label>
            <select id="art" name="art" defaultValue={s.game.art}>
              {(["book", "painterly", "watercolor"] as const).map((a) => (
                <option key={a} value={a}>
                  {ART_INFO[a].label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="imagePolicy">Scene art</label>
            <select id="imagePolicy" name="imagePolicy" defaultValue={s.game.imagePolicy}>
              <option value="new_scenes">For each new place or challenge</option>
              <option value="cruxes_only">Only for the big moments</option>
              <option value="off">Off</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="pace">How fast campaigns play</label>
            <select id="pace" name="pace" defaultValue={s.game.pace}>
              {Object.values(PACES).map((p) => (
                <option key={p.pace} value={p.pace}>
                  {p.label}
                </option>
              ))}
            </select>
            <span className="hint">
              {PACES.live.label}: {PACES.live.blurb} {PACES.post.label}: {PACES.post.blurb} Each campaign can
              switch any time with <code>/campaign pace</code>.
            </span>
          </div>
          <div className="field">
            <label htmlFor="roundTimerSeconds">Time to choose each turn</label>
            <select
              id="roundTimerSeconds"
              name="roundTimerSeconds"
              defaultValue={s.game.roundTimerSeconds === undefined ? "" : String(s.game.roundTimerSeconds)}
            >
              <option value="">Usual for the pace</option>
              {(["live", "post"] as const).map((pace) => (
                <optgroup key={pace} label={PACES[pace].label}>
                  {TIMER_CHOICES.filter((t) => t.seconds > 0 && timerFitsPace(pace, t.seconds)).map((t) => (
                    <option key={t.seconds} value={String(t.seconds)}>
                      {t.label}
                    </option>
                  ))}
                </optgroup>
              ))}
              <option value="0">{TIMER_CHOICES.find((t) => t.seconds === 0)?.label}</option>
            </select>
            <span className="hint">
              Usually {describeTimer(PACES.live.roundTimerSeconds)} at game night and{" "}
              {describeTimer(PACES.post.roundTimerSeconds)} by post. Anyone who hasn't chosen by then watches
              and waits that turn.
            </span>
          </div>
          <div className="field">
            <label htmlFor="pingPlayers">Ping players when it's their turn</label>
            <select
              id="pingPlayers"
              name="pingPlayers"
              defaultValue={s.game.pingPlayers === undefined ? "" : s.game.pingPlayers ? "on" : "off"}
            >
              <option value="">Only for play by post</option>
              <option value="on">Always</option>
              <option value="off">Never</option>
            </select>
            <span className="hint">Pings also remind anyone who hasn't chosen before the turn moves on.</span>
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
