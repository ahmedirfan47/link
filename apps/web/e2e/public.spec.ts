import { expect, test } from "@playwright/test";

/** Pages anyone can open, and the guard in front of everything else. */

test("landing page shows the product and its calls to action", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1")).toBeVisible();
  await expect(page.getByRole("link", { name: /download/i }).first()).toBeVisible();
  await expect(page.locator('a[href="/login?mode=signup"]').first()).toBeVisible();
});

test("login page has the sign-in form", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("sign-up mode switches the form", async ({ page }) => {
  await page.goto("/login?mode=signup");
  await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
});

for (const path of ["/download", "/privacy", "/terms", "/forgot"]) {
  test(`public page ${path} opens`, async ({ page }) => {
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1").first()).toBeVisible();
  });
}

test("privacy page names Grok as the AI processor", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByText(/xAI \(Grok\)/)).toBeVisible();
  await expect(page.getByText(/Anthropic \(Claude\): writes cues/)).toHaveCount(0);
});

for (const path of ["/packs", "/calls", "/settings", "/packs/new", "/pocket", "/teams", "/packs/interview", "/shared/00000000-0000-4000-8000-000000000000"]) {
  test(`signed-out visit to ${path} goes to login and remembers the page`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login\?next=/);
    expect(new URL(page.url()).searchParams.get("next")).toBe(path);
  });
}

test("the connector consent page asks signed-out visitors to sign in first", async ({ page }) => {
  const query = "?response_type=code&client_id=lkc_abcdefghijklmnopqrstuvwx&state=xyz";
  await page.goto(`/oauth/authorize${query}`);
  await expect(page).toHaveURL(/\/login\?next=/);
  expect(new URL(page.url()).searchParams.get("next")).toBe(`/oauth/authorize${query}`);
});

test("unknown public pages show the not-found page", async ({ page }) => {
  const res = await page.goto("/download/this-page-does-not-exist");
  expect(res?.status()).toBe(404);
});

test("Pocket and extension APIs answer 401 in JSON when signed out", async ({ request }) => {
  const list = await request.get("/api/pocket-packs", { maxRedirects: 0 });
  expect(list.status()).toBe(401);
  expect((await list.json()).error).toMatch(/Sign in/);
  const card = await request.post("/api/pocket-card", {
    maxRedirects: 0,
    data: { action: "star", packId: "00000000-0000-4000-8000-000000000000", cueId: "00000000-0000-4000-8000-000000000000" },
  });
  expect(card.status()).toBe(401);
});

test("an invite link asks signed-out visitors to sign in first", async ({ page }) => {
  await page.goto("/invite/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
  await expect(page).toHaveURL(/\/login\?next=/);
});

test("Continue with Google sends the visitor to Google through Supabase", async ({ page }) => {
  let authorizeUrl = "";
  await page.route("**/auth/v1/authorize**", (route) => {
    authorizeUrl = route.request().url();
    return route.fulfill({ status: 200, contentType: "text/html", body: "<p>Google</p>" });
  });
  await page.goto("/login?next=%2Fpacks%2Fnew");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page.getByText("Google", { exact: true })).toBeVisible();
  const url = new URL(authorizeUrl);
  expect(url.searchParams.get("provider")).toBe("google");
  expect(url.searchParams.get("redirect_to")).toMatch(/\/auth\/callback\?next=%2Fpacks%2Fnew$/);
});

test("the desktop app's Google button starts Google sign-in straight away", async ({ page }) => {
  let authorizeUrl = "";
  await page.route("**/auth/v1/authorize**", (route) => {
    authorizeUrl = route.request().url();
    return route.fulfill({ status: 200, contentType: "text/html", body: "<p>Google</p>" });
  });
  await page.goto(`/login?provider=google&next=${encodeURIComponent("/desktop/connect?challenge=abc")}`);
  await expect(page.getByText("Google", { exact: true })).toBeVisible();
  expect(new URL(authorizeUrl).searchParams.get("redirect_to")).toContain(encodeURIComponent("/desktop/connect?challenge=abc"));
});

test("a cancelled Google sign-in comes back with a clear message", async ({ page }) => {
  await page.goto("/auth/callback?error=access_denied&error_description=denied");
  await expect(page).toHaveURL(/\/login\?error=/);
  await expect(page.getByRole("alert")).toHaveText("Google sign-in was cancelled.");
});
