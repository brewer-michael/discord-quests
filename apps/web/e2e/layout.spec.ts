import { expect, test } from "@playwright/test";
import { BASE_URL, GUILD_ID, SESSION_TOKEN } from "./fixtures";

const PAGES = [
  "/",
  "/guide",
  "/servers",
  `/servers/${GUILD_ID}`,
  `/servers/${GUILD_ID}/providers/new?kind=image`,
  `/servers/${GUILD_ID}/routing`,
  `/servers/${GUILD_ID}/usage`,
  `/servers/${GUILD_ID}/campaigns`,
];

test("no page scrolls sideways on a phone", async ({ page }) => {
  await page
    .context()
    .addCookies([{ name: "dq_session", value: SESSION_TOKEN, url: BASE_URL, httpOnly: true }]);
  for (const path of PAGES) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
    if (process.env.E2E_SCREENSHOTS)
      await page.screenshot({
        path: `${process.env.E2E_SCREENSHOTS}/phone-${path.replaceAll(/[^a-z0-9]+/gi, "_")}.png`,
        fullPage: true,
      });
  }
});
