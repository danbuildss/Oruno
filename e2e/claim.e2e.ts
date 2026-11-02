/// <reference lib="dom" />
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { type Browser, type BrowserContext, chromium, type Page } from "playwright";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { retryPendingIssuance, syncAllSpend } from "../src/keys/keys.js";
import { githubProfile } from "../tests/helpers/fake-github.js";
import { NOW } from "../tests/helpers/seed.js";
import { type Harness, POOL, startHarness } from "./harness.js";

const SHOTS = resolve(import.meta.dirname, "screenshots");
const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 860 };
const MODEL = "claude-sonnet-5";

let harness: Harness;
let browser: Browser;
const contexts: BrowserContext[] = [];
/** Uncaught errors in any page; checked after every test. */
const pageErrors: string[] = [];

/** A fresh browser (no cookies) whose clock reads NOW, recording any CSP violation. */
async function newPage(viewport = MOBILE): Promise<Page> {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  contexts.push(context);
  const page = await context.newPage();
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(() => {
    const w = window as unknown as { __csp: string[] };
    w.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => {
      w.__csp.push(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });
  return page;
}

async function cspViolations(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
}

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: resolve(SHOTS, `${name}.png`), fullPage: true });
}

async function signIn(page: Page, slug: string, profile = githubProfile({ now: NOW })) {
  harness.nextProfile = profile;
  await page.goto(`${harness.baseUrl}/p/${slug}`);
  await page.getByRole("link", { name: /Sign in with GitHub/ }).click();
  await page.waitForURL(`${harness.baseUrl}/p/${slug}`);
  return profile;
}

async function claimWithCheckboxes(page: Page) {
  const claim = page.getByRole("button", { name: /^Claim \$5\.00 of credit$/ });
  await expect(claim.isDisabled()).resolves.toBe(true);
  await page.getByLabel(/I accept the/).check();
  await page.getByLabel(/18 or older/).check();
  await expect(claim.isDisabled()).resolves.toBe(true);
  await page.getByLabel(/sanctioned/).check();
  await claim.click();
}

async function keyIdFor(personLogin: string): Promise<string> {
  const row = await harness.db
    .selectFrom("provider_keys")
    .innerJoin("claims", "claims.id", "provider_keys.claim_id")
    .innerJoin("identities", "identities.id", "claims.identity_id")
    .select("provider_keys.provider_key_id")
    .where("identities.login", "=", personLogin)
    .where("provider_keys.retired_at", "is", null)
    .executeTakeFirstOrThrow();
  return row.provider_key_id;
}

describe("claim website end to end (fake GitHub, fake provider)", () => {
  beforeAll(async () => {
    mkdirSync(SHOTS, { recursive: true });
    harness = await startHarness();
    browser = await chromium.launch();
  });
  afterEach(() => {
    expect(pageErrors).toEqual([]);
  });
  afterAll(async () => {
    for (const c of contexts) await c.close();
    await browser?.close();
    await harness?.close();
  });

  it("shows a pool to a signed-out visitor (mobile and desktop)", async () => {
    for (const [label, viewport] of [
      ["mobile", MOBILE],
      ["desktop", DESKTOP],
    ] as const) {
      const page = await newPage(viewport);
      await page.goto(`${harness.baseUrl}/p/${POOL}`);
      await expect(page.getByRole("heading", { level: 1 }).textContent()).resolves.toBe(
        "Dan's AI pool",
      );
      await page.getByText("$5.00", { exact: true }).waitFor();
      await page.getByText("20 of 20").waitFor();
      await expect(
        page.getByRole("link", { name: "Sign in with GitHub to claim" }).isVisible(),
      ).resolves.toBe(true);
      await shot(page, `01-pool-signed-out-${label}`);
      expect(await cspViolations(page)).toEqual([]);
    }
  });

  it("full claim: sign in, accept, key shown once, use, replace, stop", async () => {
    const page = await newPage();
    const profile = await signIn(page, POOL);
    await page.getByText(`Signed in as ${profile.login}. You can claim.`).waitFor();
    await shot(page, "02-pool-eligible-mobile");

    await claimWithCheckboxes(page);
    const secretEl = page.getByTestId("secret");
    await secretEl.waitFor();
    const secret = (await secretEl.textContent()) ?? "";
    expect(secret.length).toBeGreaterThan(20);
    await page.getByText("This is the only time we show it.").waitFor();
    await expect(page.locator("pre").textContent()).resolves.toContain(
      `ANTHROPIC_AUTH_TOKEN="${secret}"`,
    );
    await page.getByText("19 of 20").waitFor();
    await shot(page, "03-key-shown-once-mobile");

    // The key works at the provider.
    expect(harness.provider.accepts(secret, MODEL, NOW)).toBe(true);
    // The secret is never stored by the browser, and the session cookie is out of reach of scripts.
    const storage = await page.evaluate(() => ({
      local: JSON.stringify({ ...localStorage }),
      session: JSON.stringify({ ...sessionStorage }),
      cookie: document.cookie,
      url: location.href,
    }));
    expect(storage.local).not.toContain(secret);
    expect(storage.session).not.toContain(secret);
    expect(storage.url).not.toContain(secret);
    expect(storage.cookie).not.toContain("oru_cs_");
    expect(harness.logs.text).not.toContain(secret);

    // Leaving the key screen goes to My credit; the secret is gone from the page.
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "I've saved my key" }).click();
    await page.waitForURL(`${harness.baseUrl}/credit`);
    const card = page.getByTestId("claim-card");
    await card.getByText("Active").waitFor();
    await card.getByText("$5.00 left").waitFor();
    expect(await page.content()).not.toContain(secret);

    // Usage shows up after the provider reports spend.
    const keyId = await keyIdFor(profile.login);
    harness.provider.spend(keyId, 1_250_000n);
    await syncAllSpend(harness.db, harness.provider, { now: NOW });
    await page.reload();
    await card.getByText("$1.25 used").waitFor();
    await card.getByText("$3.75 left").waitFor();
    await shot(page, "04-my-credit-mobile");

    // Back on the pool page, they're told they already claimed.
    await page.goto(`${harness.baseUrl}/p/${POOL}`);
    await page.getByText("You've claimed from this pool").waitFor();
    await page.getByText("19 of 20").waitFor();

    // Lost the key: a new one replaces it; the old one stops working.
    await page.goto(`${harness.baseUrl}/credit`);
    await page.getByRole("button", { name: /Get a new key \(3 left\)/ }).click();
    await secretEl.waitFor();
    const second = (await secretEl.textContent()) ?? "";
    expect(second).not.toBe(secret);
    expect(harness.provider.accepts(second, MODEL, NOW)).toBe(true);
    expect(harness.provider.accepts(secret, MODEL, NOW)).toBe(false);
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "I've saved my key" }).click();
    await page.getByRole("button", { name: /Get a new key \(2 left\)/ }).waitFor();

    // Stop the key for good.
    await page.getByRole("button", { name: "Stop this key" }).click();
    await page.getByRole("button", { name: "Yes, stop it" }).click();
    await card.getByText("Stopped").waitFor();
    expect(harness.provider.accepts(second, MODEL, NOW)).toBe(false);
    await shot(page, "05-my-credit-stopped-mobile");

    // Sign out: the session ends.
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.getByRole("link", { name: "Sign in with GitHub" }).waitFor();
    await page.reload();
    await page.getByRole("link", { name: "Sign in with GitHub" }).waitFor();
    expect(await cspViolations(page)).toEqual([]);
  });

  it("tells a brand-new GitHub account it can't claim", async () => {
    const page = await newPage();
    await signIn(
      page,
      POOL,
      githubProfile({ now: NOW, ageDays: 3, publicRepos: 0, contributionsLastYear: 0 }),
    );
    await page.getByText("This account can't claim from this pool").waitFor();
    await page.getByText("Your GitHub account is too new.").waitFor();
    await shot(page, "06-not-eligible-mobile");
  });

  it("explains a cancelled GitHub sign-in", async () => {
    const page = await newPage();
    harness.nextProfile = "cancel";
    await page.goto(`${harness.baseUrl}/p/${POOL}`);
    await page.getByRole("link", { name: /Sign in with GitHub/ }).click();
    await page.getByText("GitHub sign-in was cancelled.").waitFor();
    expect(page.url()).toBe(`${harness.baseUrl}/p/${POOL}`);
  });

  it("shows full, ended, not-yet-open and unknown pools", async () => {
    const page = await newPage();
    const cases: Array<[string, string, string]> = [
      ["full-pool", "This pool is fully claimed", "07-pool-full-mobile"],
      ["ended-pool", "This pool has ended", "08-pool-ended-mobile"],
      ["soon-pool", "This pool opens soon", "09-pool-not-started-mobile"],
      ["no-such-pool", "Pool not found", "10-pool-not-found-mobile"],
    ];
    for (const [slug, text, name] of cases) {
      await page.goto(`${harness.baseUrl}/p/${slug}`);
      await page.getByText(text).waitFor();
      await expect(page.getByRole("link", { name: /Sign in with GitHub/ }).count()).resolves.toBe(
        0,
      );
      await shot(page, name);
    }
  });

  it("reserves the share when the provider is down, then hands over the key", async () => {
    const page = await newPage();
    await signIn(page, "busy-pool");
    harness.provider.failNext("createKey", { retryable: true, times: 1 });
    await claimWithCheckboxes(page);
    await page.getByText("Your share is reserved").waitFor();
    await shot(page, "11-pending-mobile");

    // The background job issues the key; the person collects it from My credit.
    await retryPendingIssuance(harness.db, harness.provider, { now: NOW, olderThanMs: 0 });
    await page.getByRole("link", { name: "Go to My credit" }).click();
    await page.getByRole("button", { name: "Get my key" }).click();
    const secret = (await page.getByTestId("secret").textContent()) ?? "";
    expect(harness.provider.accepts(secret, MODEL, NOW)).toBe(true);
  });

  it("My credit on desktop", async () => {
    const page = await newPage(DESKTOP);
    await signIn(page, POOL);
    await claimWithCheckboxes(page);
    await page.getByTestId("secret").waitFor();
    await shot(page, "12-key-shown-once-desktop");
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "I've saved my key" }).click();
    await page.getByTestId("claim-card").waitFor();
    await shot(page, "13-my-credit-desktop");
  });
});
