import { createServer, type Server } from "node:http";
import { expect, type Page, test } from "@playwright/test";
import { BASE_URL, FORBIDDEN_GUILD_ID, GUILD_ID, MOCK_PORT, SESSION_TOKEN } from "./fixtures";

const SECRET = "sk-e2e-SUPERSECRETVALUE-9876";
const shots = process.env.E2E_SCREENSHOTS;

let mock: Server;

test.beforeAll(async () => {
  // Stands in for a self-hosted OpenAI-compatible model server.
  mock = createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url?.endsWith("/models")) {
      res.end(JSON.stringify({ data: [{ id: "mock-small" }, { id: "mock-large" }] }));
      return;
    }
    if (req.url?.endsWith("/chat/completions")) {
      if (req.headers.authorization !== `Bearer ${SECRET}`) {
        res.statusCode = 401;
        res.end(JSON.stringify({ error: { message: "bad key" } }));
        return;
      }
      res.end(
        JSON.stringify({
          model: "mock-small",
          choices: [{ finish_reason: "stop", message: { content: '{"word":"lantern"}' } }],
          usage: { prompt_tokens: 20, completion_tokens: 5 },
        }),
      );
      return;
    }
    res.statusCode = 404;
    res.end("{}");
  });
  await new Promise<void>((resolve) => mock.listen(MOCK_PORT, "127.0.0.1", resolve));
});

test.afterAll(async () => {
  await new Promise((resolve) => mock.close(resolve));
});

async function signIn(page: Page) {
  await page
    .context()
    .addCookies([{ name: "dq_session", value: SESSION_TOKEN, url: BASE_URL, httpOnly: true }]);
}

/** Fails the test if the API key ever comes back from the server, in any response. */
function watchForSecret(page: Page) {
  const leaks: string[] = [];
  page.on("response", async (r) => {
    try {
      const body = await r.text();
      if (body.includes("SUPERSECRET")) leaks.push(r.url());
    } catch {
      // Redirects and aborted requests have no body.
    }
  });
  return leaks;
}

async function snap(page: Page, name: string) {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
}

test("signed-out visitors see the landing page and are sent to Discord to sign in", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Adventures for the whole table");
  await expect(page.getByRole("link", { name: "Add the bot to a server" })).toHaveAttribute(
    "href",
    /discord\.com\/oauth2\/authorize.*applications\.commands/,
  );
  await snap(page, "01-landing");

  const login = await request.get("/auth/login", { maxRedirects: 0 });
  expect(login.status()).toBe(307);
  const to = new URL(login.headers().location ?? "");
  expect(to.origin + to.pathname).toBe("https://discord.com/oauth2/authorize");
  expect(to.searchParams.get("redirect_uri")).toBe(`${BASE_URL}/auth/callback`);
  expect(login.headers()["set-cookie"]).toMatch(/dq_oauth_state=.*HttpOnly/i);

  const servers = await request.get("/servers", { maxRedirects: 0 });
  expect(servers.status()).toBeGreaterThanOrEqual(300);
  expect(servers.headers().location).toContain("/auth/login");

  const callback = await request.get("/auth/callback?code=x&state=forged", { maxRedirects: 0 });
  expect(callback.headers().location).toContain("/?error=signin");
});

test("an admin sees only the servers they manage", async ({ page }) => {
  await signIn(page);
  await page.goto("/servers");
  await expect(page.getByRole("heading", { name: "Lantern Club" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Homework Help" })).toBeVisible();
  await expect(page.getByText("Just a member")).toHaveCount(0);
  await snap(page, "02-servers");

  await page.goto(`/servers/${FORBIDDEN_GUILD_ID}`);
  await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
});

test("adding a custom endpoint keeps the key secret, and the connection test works", async ({ page }) => {
  await signIn(page);
  const leaks = watchForSecret(page);
  await page.goto(`/servers/${GUILD_ID}`);
  await expect(page.getByText("Getting ready")).toBeVisible();
  await snap(page, "03-overview-empty");

  await page.getByRole("link", { name: "Add a story service" }).click();
  await expect(page.getByRole("heading", { name: "Add a story service" })).toBeVisible();
  await page.getByText("Custom OpenAI-compatible endpoint").click();
  await page.getByLabel("Name", { exact: true }).fill("Home server");
  await page.getByLabel("Model", { exact: true }).fill("mock-small");
  await page.getByLabel("Address", { exact: true }).fill(`http://127.0.0.1:${MOCK_PORT}/v1`);
  await page.getByLabel(/API key/).fill(SECRET);
  await page.getByText("More options").click();
  await page.getByLabel(/This runs on my own network/).check();
  await page.getByLabel("Structured answers").selectOption("json_object");
  await snap(page, "04-add-provider");
  await page.getByRole("button", { name: "Add service" }).click();

  await expect(page).toHaveURL(/\/providers\/[0-9a-f-]+\?added=1/);
  await expect(page.getByText("Added. Test the connection")).toBeVisible();
  await expect(page.getByText("Saved key: •••• 9876")).toBeVisible();
  expect(await page.content()).not.toContain("SUPERSECRET");

  await page.getByRole("button", { name: "Test connection" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Connected" })).toBeVisible();
  await page.getByRole("button", { name: "Load models from the service" }).click();
  await expect(page.getByText("2 models found")).toBeVisible();
  await snap(page, "05-provider-tested");

  // A wrong address is caught on save, and what was typed stays put.
  await page.getByLabel("Address", { exact: true }).fill("ftp://nope");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Use an http:// or https:// address")).toBeVisible();
  await expect(page.getByLabel("Address", { exact: true })).toHaveValue("ftp://nope");

  await page.goto(`/servers/${GUILD_ID}`);
  await expect(page.getByRole("heading", { name: "Home server" })).toBeVisible();
  await expect(page.getByText("•••• 9876")).toBeVisible();
  await snap(page, "06-overview");
  expect(leaks).toEqual([]);
});

test("routing, settings, usage and activity", async ({ page }) => {
  await signIn(page);
  await page.goto(`/servers/${GUILD_ID}/routing`);
  const intent = page.locator("section", { has: page.getByRole("heading", { name: "Action reader" }) });
  await expect(intent.getByLabel("First choice: service")).toHaveValue(/[0-9a-f-]{36}/);
  await intent.getByLabel("First choice: model").fill("mock-large");
  await intent.getByRole("button", { name: "Save" }).click();
  await expect(intent.getByText("Saved.")).toBeVisible();
  await snap(page, "07-routing");

  await page.goto(`/servers/${GUILD_ID}/settings`);
  await page.getByLabel("Daily budget (US dollars)").fill("2.5");
  await page.getByLabel("Time to choose each turn").selectOption("43200");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Saved. New campaigns will use these defaults.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Daily budget (US dollars)")).toHaveValue("2.5");
  await snap(page, "08-settings");

  await page.goto(`/servers/${GUILD_ID}/usage`);
  await expect(page.getByText("Connection tests")).toBeVisible();
  await snap(page, "09-usage");

  await page.goto(`/servers/${GUILD_ID}/activity`);
  await expect(page.getByText("Added a service").first()).toBeVisible();
  await expect(page.getByText("Changed settings").first()).toBeVisible();
  expect(await page.content()).not.toContain("SUPERSECRET");
});

test("the hidden hand is behind a spoiler warning", async ({ page }) => {
  await signIn(page);
  await page.goto(`/servers/${GUILD_ID}/campaigns`);
  await expect(page.getByRole("heading", { name: "Lights Out" })).toBeVisible();
  await snap(page, "10-campaigns");
  await page.getByRole("link", { name: "Peek at the hidden hand" }).click();
  await expect(page.getByRole("heading", { name: "Spoilers ahead" })).toBeVisible();
  await expect(page.getByText("Let the lantern-thief go free")).toHaveCount(0);
  await page.getByRole("button", { name: "Show me anyway" }).click();
  await expect(page.getByText("Let the lantern-thief go free")).toBeVisible();
  await expect(page.getByText("Snibbet").first()).toBeVisible();
  await snap(page, "11-loom");

  await page.goto(`/servers/${GUILD_ID}/campaigns`);
  const download = await page.request.get(
    (await page.getByRole("link", { name: "Download story" }).getAttribute("href")) ?? "",
  );
  expect(download.headers()["content-disposition"]).toContain("Lights-Out.json");
  const body = await download.text();
  expect(body).toContain("discord-quests/campaign-export@1");
  expect(body).not.toContain("lantern-thief go free");
});
