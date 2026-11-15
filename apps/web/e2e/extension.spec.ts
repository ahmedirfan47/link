import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, expect, test, type BrowserContext, type Worker } from "@playwright/test";

/**
 * The Chrome extension's side panel, end to end in a real Chromium with the
 * extension loaded. Link's API is mocked and Meet captions are sent the way
 * the content script sends them, so no account or meeting is needed.
 */

const EXT_DIR = path.resolve(__dirname, "../../extension");
const LINK = "https://link-zeta-six.vercel.app";

let context: BrowserContext;
let worker: Worker;
let extensionId = "";
const asked: string[] = [];
const missed: string[] = [];

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  execFileSync(process.execPath, ["build.mjs"], { cwd: EXT_DIR, env: { ...process.env, LINK_URL: LINK }, stdio: "ignore" });
  context = await chromium.launchPersistentContext(mkdtempSync(path.join(tmpdir(), "link-ext-")), {
    channel: "chromium",
    executablePath: process.env.E2E_CHROME_PATH || undefined,
    args: [`--disable-extensions-except=${EXT_DIR}/dist`, `--load-extension=${EXT_DIR}/dist`],
  });
  worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  extensionId = new URL(worker.url()).host;

  await context.route(`${LINK}/api/**`, async (route) => {
    const url = new URL(route.request().url());
    const json = (body: unknown) => route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname === "/api/pocket-packs") {
      return json({
        packs: [{ id: "11111111-1111-4111-8111-111111111111", title: "Seed round", meeting_type: "investor", language: "en", role: "owner", from: null }],
      });
    }
    if (url.pathname === "/api/pocket-pack") {
      return json({
        pack: { id: "11111111-1111-4111-8111-111111111111", title: "Seed round", language: "en", meetingType: "investor" },
        role: "owner",
        cards: [
          {
            id: "c1",
            direction: "incoming",
            kind: "question",
            prompt: "What is your monthly revenue?",
            variants: ["how much revenue do you make", "what's your MRR"],
            bullets: ["$40k MRR, up 18% a month"],
            keywords: ["MRR"],
            priority: 1,
            useful: 2,
          },
        ],
      });
    }
    const body = route.request().postDataJSON() as { question?: string };
    if (url.pathname === "/api/pocket-miss") {
      missed.push(body.question ?? "");
      return json({ ok: true });
    }
    if (url.pathname === "/api/pocket-answer") {
      asked.push(body.question ?? "");
      return json({ bullets: ["Two engineers, one designer", "Hiring a sales lead next"], confident: true, sources: ["Deck"] });
    }
    return route.fulfill({ status: 404, body: "{}" });
  });
});

test.afterAll(async () => {
  await context?.close();
});

async function sendCaptions(blocks: { speaker: string; text: string }[]) {
  await worker.evaluate((b) => {
    const { chrome } = globalThis as unknown as {
      chrome: { runtime: { sendMessage(m: unknown): Promise<unknown> } };
    };
    return chrome.runtime
      .sendMessage({ type: "link-captions", captionsOn: true, inCall: true, blocks: b })
      .catch(() => undefined);
  }, blocks);
}

test("side panel loads the pack and follows Meet captions", async () => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await expect(page.getByRole("combobox", { name: "Pack" })).toHaveValue("11111111-1111-4111-8111-111111111111");
  await expect(page.getByText("What is your monthly revenue?")).toBeVisible();

  // Honest by design: first confirm the others know.
  await sendCaptions([{ speaker: "Sara", text: "Hi there" }]);
  await expect(page.getByText("Tell the people on the call you are using Link.")).toBeVisible();
  await page.getByRole("button", { name: "I've told them" }).click();

  // The other side asks; their words match the card.
  await sendCaptions([
    { speaker: "You", text: "Thanks for having me" },
    { speaker: "Sara", text: "So how much revenue do you make at the moment" },
  ]);
  await expect(page.getByText("Live match")).toBeVisible();
  await expect(page.getByText("$40k MRR, up 18% a month")).toBeVisible();

  // A question no card covers: offered to Grok and logged as missed.
  await sendCaptions([{ speaker: "Sara", text: "How big is your team today?" }]);
  await expect(page.getByRole("button", { name: "Ask Grok" })).toBeVisible({ timeout: 5_000 });
  expect(missed).toContain("How big is your team today?");
  await page.getByRole("button", { name: "Ask Grok" }).click();
  await expect(page.getByText("Two engineers, one designer")).toBeVisible();
  expect(asked).toContain("How big is your team today?");
});

test("typing searches the cards", async () => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await page.getByRole("searchbox", { name: "Search cards" }).fill("MRR");
  await expect(page.getByText("$40k MRR, up 18% a month")).toBeVisible();
  await page.getByRole("searchbox", { name: "Search cards" }).fill("pricing for enterprises");
  await expect(page.getByText("No card covers this.")).toBeVisible();
});

test("reads captions from a Meet page", async () => {
  // A stand-in for Meet's call page with the same caption structure: avatar, name, text.
  await context.route("https://meet.google.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><body>
        <button aria-label="Leave call">Leave</button>
        <div role="region" aria-label="Captions"><div id="list"></div></div>
        <script>
          window.say = (name, text) => {
            const block = document.createElement("div");
            block.innerHTML = '<div><img alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="><div>' + name + '</div></div><div>' + text + '</div>';
            document.getElementById("list").append(block);
          };
        </script>
      </body></html>`,
    }),
  );
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await expect(panel.getByText("What is your monthly revenue?")).toBeVisible();

  const meet = await context.newPage();
  await meet.goto("https://meet.google.com/abc-defg-hij");
  await meet.evaluate(() => (window as unknown as { say(n: string, t: string): void }).say("You", "Hello everyone"));
  await meet.evaluate(() =>
    (window as unknown as { say(n: string, t: string): void }).say("Omar", "Quick one, what's your MRR these days"),
  );
  // The content script reports the call: the panel asks to tell the others first.
  await expect(panel.getByText("Tell the people on the call you are using Link.")).toBeVisible();
  await panel.getByRole("button", { name: "I've told them" }).click();
  await meet.evaluate(() =>
    (window as unknown as { say(n: string, t: string): void }).say("Omar", "And what is your MRR exactly"),
  );
  await expect(panel.getByText("Live match")).toBeVisible();
  await expect(panel.getByText("$40k MRR, up 18% a month")).toBeVisible();
});
