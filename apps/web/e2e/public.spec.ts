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

for (const path of ["/packs", "/calls", "/settings", "/packs/new"]) {
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