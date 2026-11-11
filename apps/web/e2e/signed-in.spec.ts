import { createHash, randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

/**
 * The main signed-in flows, in order, against a real test account:
 * create a pack, add sources (a note and a chat export), view the chat,
 * open Ask, connect an app through OAuth and call the MCP endpoint with it,
 * disconnect it, and delete the pack.
 *
 * Needs E2E_EMAIL and E2E_PASSWORD. Set E2E_ASK=1 to also send one question
 * to Grok (uses one Ask from the daily cap), and E2E_SHARE_URL to a public
 * ChatGPT or Claude share link to test reading it directly.
 */

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe.configure({ mode: "serial" });
test.skip(!email || !password, "Set E2E_EMAIL and E2E_PASSWORD to run the signed-in tests.");

const packTitle = `E2E pack ${new Date().toISOString().slice(0, 19)}`;
let packUrl = "";
let page: Page;

const exportFile = {
  name: "conversations.json",
  mimeType: "application/json",
  buffer: Buffer.from(
    JSON.stringify([
      {
        uuid: "e2e-chat-1",
        name: "E2E pricing chat",
        updated_at: "2026-11-01T10:00:00Z",
        chat_messages: [
          { sender: "human", text: "What should our seed price be?" },
          { sender: "assistant", text: "Start at 49 dollars per seat per month and test annual plans." },
        ],
      },
    ]),
  ),
};

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  page.on("dialog", (dialog) => void dialog.accept());
});

test.afterAll(async () => {
  await page.close();
});

test("sign in", async () => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email!);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/packs$/);
});

test("create a pack", async () => {
  await page.goto("/packs/new");
  await page.getByLabel("Name").fill(packTitle);
  await page.getByRole("button", { name: "Create pack" }).click();
  await expect(page).toHaveURL(/\/packs\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(packTitle);
  packUrl = new URL(page.url()).pathname;
});

test("add a note as a source", async () => {
  await page.getByRole("button", { name: "Note", exact: true }).click();
  await page.getByPlaceholder(/Key numbers/).fill(
    "Our product costs 49 dollars per seat. We have 12 paying teams and grew 30 percent last month.",
  );
  await page.getByRole("button", { name: "Add note" }).click();
  // The first source switches the page to its full layout, so check the source
  // list instead of the form's success message (which goes away with the old layout).
  const added = page.getByText(/^Note · \d+ characters$/);
  const failed = page.locator('p[role="alert"]');
  await expect(added.or(failed)).toBeVisible();
  if (await failed.isVisible()) throw new Error(`Adding the note failed: ${await failed.textContent()}`);
});

test("import a chat from an export and read it in the chat viewer", async () => {
  await page.getByRole("button", { name: "Chats", exact: true }).click();
  await page.locator('input[type="file"][accept=".zip,.json"]').setInputFiles(exportFile);
  await page.getByText("E2E pricing chat").click();
  await page.getByRole("button", { name: /Add 1 chat/ }).click();
  await expect(page.getByText(/Added 1 chat/)).toBeVisible();

  await page.getByRole("link", { name: /E2E pricing chat/ }).click();
  await expect(page).toHaveURL(/\/sources\/[0-9a-f-]{36}$/);
  await expect(page.getByText("What should our seed price be?")).toBeVisible();
  await expect(page.getByText(/49 dollars per seat per month/)).toBeVisible();
  await expect(page.getByText("2 messages", { exact: false })).toBeVisible();
});

test("open Ask scoped to that chat", async () => {
  await page.getByRole("link", { name: "Ask about this chat" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Ask" })).toBeVisible();
  await expect(page.getByLabel("Ask about")).toHaveValue(/[0-9a-f-]{36}/);
  await expect(page.getByLabel("Your question")).toBeVisible();

  if (process.env.E2E_ASK === "1") {
    await page.getByLabel("Your question").fill("What price was suggested?");
    await page.getByRole("button", { name: "Ask", exact: true }).click();
    await expect(page.getByText(/49/).last()).toBeVisible({ timeout: 60_000 });
  }
});

test("read a public share link directly", async () => {
  test.skip(!process.env.E2E_SHARE_URL, "Set E2E_SHARE_URL to a public ChatGPT or Claude share link.");
  await page.goto(packUrl);
  await page.getByRole("button", { name: "Link", exact: true }).click();
  await page.getByPlaceholder("https://").fill(process.env.E2E_SHARE_URL!);
  await page.getByRole("button", { name: "Import" }).click();
  // Either it was read directly, or the site blocked the server and the desktop option is offered.
  await expect(
    page.getByText(/Imported \d+ messages/).or(page.getByRole("link", { name: "Read it with the desktop app" })),
  ).toBeVisible({ timeout: 45_000 });
});

test("connect an app with OAuth, call the MCP endpoint, then disconnect it", async ({ baseURL }) => {
  const redirectUri = "http://127.0.0.1:9/callback";

  // 1. The app registers itself.
  const reg = await page.request.post("/oauth/register", {
    data: { client_name: "Link E2E", redirect_uris: [redirectUri], token_endpoint_auth_method: "none" },
  });
  expect(reg.status()).toBe(201);
  const { client_id: clientId } = (await reg.json()) as { client_id: string };

  // 2. The user approves it on the consent page.
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(8).toString("hex");
  const authorize = new URL("/oauth/authorize", baseURL);
  for (const [k, v] of Object.entries({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
    scope: "link",
    resource: `${baseURL}/api/mcp`,
  })) {
    authorize.searchParams.set(k, v);
  }

  await page.route("http://127.0.0.1:9/**", (route) => route.fulfill({ status: 200, body: "callback reached" }));
  await page.goto(authorize.toString());
  await expect(page.getByRole("heading", { name: /Allow Link E2E to use your Link account/ })).toBeVisible();
  await page.getByRole("button", { name: "Allow" }).click();
  await page.waitForURL(/127\.0\.0\.1:9\/callback/);

  const callback = new URL(page.url());
  expect(callback.searchParams.get("state")).toBe(state);
  expect(callback.searchParams.get("iss")).toBe(baseURL);
  const code = callback.searchParams.get("code");
  expect(code).toBeTruthy();

  // 3. The app exchanges the code; a wrong verifier fails and the code works once.
  const bad = await page.request.post("/oauth/token", {
    form: { grant_type: "authorization_code", client_id: clientId, code: code!, redirect_uri: redirectUri, code_verifier: "x".repeat(43) },
  });
  expect(bad.status()).toBe(400);

  // The failed attempt above already used the code, so start a fresh authorization.
  await page.goto(authorize.toString());
  await page.getByRole("button", { name: "Allow" }).click();
  await page.waitForURL(/127\.0\.0\.1:9\/callback/);
  const code2 = new URL(page.url()).searchParams.get("code")!;

  const tokenRes = await page.request.post("/oauth/token", {
    form: { grant_type: "authorization_code", client_id: clientId, code: code2, redirect_uri: redirectUri, code_verifier: verifier },
  });
  expect(tokenRes.status()).toBe(200);
  const tokens = (await tokenRes.json()) as { access_token: string; refresh_token: string; token_type: string };
  expect(tokens.token_type).toBe("Bearer");

  const reuse = await page.request.post("/oauth/token", {
    form: { grant_type: "authorization_code", client_id: clientId, code: code2, redirect_uri: redirectUri, code_verifier: verifier },
  });
  expect(reuse.status()).toBe(400);

  // 4. The app calls Link's tools with the access token.
  const mcp = (token: string, body: object) =>
    page.request.post("/api/mcp", { headers: { Authorization: `Bearer ${token}` }, data: body });

  const init = await mcp(tokens.access_token, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "e2e", version: "1" } },
  });
  expect(init.status()).toBe(200);
  expect((await init.json()).result.serverInfo.name).toBe("link");

  const list = await mcp(tokens.access_token, {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name: "list_packs", arguments: {} },
  });
  expect(list.status()).toBe(200);
  expect(JSON.stringify(await list.json())).toContain(packTitle);

  // 5. Refresh rotates the tokens; the old refresh token stops working.
  const refreshed = await page.request.post("/oauth/token", {
    form: { grant_type: "refresh_token", client_id: clientId, refresh_token: tokens.refresh_token },
  });
  expect(refreshed.status()).toBe(200);
  const newTokens = (await refreshed.json()) as { access_token: string };
  const replay = await page.request.post("/oauth/token", {
    form: { grant_type: "refresh_token", client_id: clientId, refresh_token: tokens.refresh_token },
  });
  expect(replay.status()).toBe(400);

  // 6. Settings lists the app; disconnecting it cuts access.
  await page.goto("/settings");
  await expect(page.getByText(`${baseURL}/api/mcp`).or(page.locator(`input[value="${baseURL}/api/mcp"]`))).toBeVisible();
  const row = page.locator("li", { hasText: "Link E2E" });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Disconnect" }).click();
  await expect(row).toHaveCount(0);

  const after = await mcp(newTokens.access_token, { jsonrpc: "2.0", id: 3, method: "tools/list" });
  expect(after.status()).toBe(401);
});

test("delete the pack", async () => {
  await page.goto(packUrl);
  await page.getByRole("button", { name: "Delete pack" }).click();
  await expect(page).toHaveURL(/\/packs$/);
  await expect(page.getByText(packTitle)).toHaveCount(0);
});