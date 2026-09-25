import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Browser, Locator, Page } from "playwright";
import { newContext } from "./browser";
import { parseStep, quotedTexts, type Step } from "./steps";
import type { Credentials, PlannedCase } from "./types";

export type CaseStatus = "passed" | "failed" | "blocked" | "error";
export type EvidenceKind = "png" | "webm" | "console" | "network" | "page";

export type CaseResult = {
  status: CaseStatus;
  durationMs: number;
  errorText?: string;
  /** Paths are relative to the run's evidence directory. */
  evidence: { kind: EvidenceKind; path: string }[];
  consoleErrors: string[];
  serverErrors: string[];
};

export type RunCaseOptions = {
  baseUrl: string;
  testCase: Pick<PlannedCase, "key" | "steps" | "expected">;
  /** Absolute evidence directory of the run: data/evidence/{runId}. */
  runDir: string;
  credentials?: Credentials;
  /** Screenshot passing cases too (first and last case of a run). */
  screenshotOnPass?: boolean;
  maxSteps?: number;
  caseTimeoutMs?: number;
  actionTimeoutMs?: number;
};

/** A step we could not bind to the page: the case is blocked, not failed. */
class Blocked extends Error {}
/** An expectation that did not hold: the case failed. */
class Failed extends Error {}

const firstVisible = async (candidates: Locator[]): Promise<Locator | null> => {
  for (const c of candidates) {
    const loc = c.first();
    if ((await loc.count()) > 0 && (await loc.isVisible().catch(() => false))) return loc;
  }
  return null;
};

const esc = (s: string) => s.replace(/"/g, '\\"');

async function poll(check: () => Promise<boolean> | boolean, timeoutMs: number): Promise<boolean> {
  const end = Date.now() + timeoutMs;
  do {
    if (await check()) return true;
    await new Promise((r) => setTimeout(r, 200));
  } while (Date.now() < end);
  return false;
}

export async function runCase(browser: Browser, opts: RunCaseOptions): Promise<CaseResult> {
  const {
    baseUrl,
    testCase,
    runDir,
    maxSteps = 8,
    caseTimeoutMs = 180_000,
    actionTimeoutMs = 10_000,
  } = opts;
  const caseDir = join(runDir, testCase.key);
  const videoTmp = join(caseDir, ".video");
  mkdirSync(videoTmp, { recursive: true });

  const started = Date.now();
  const consoleErrors: string[] = [];
  const serverErrors: string[] = [];
  const network: string[] = [];
  const evidence: CaseResult["evidence"] = [];

  const context = await newContext(browser, { recordVideo: { dir: videoTmp } });
  const page = await context.newPage();
  page.setDefaultTimeout(actionTimeoutMs);
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 500)));
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message.slice(0, 500)}`));
  page.on("response", (r) => {
    if (r.status() >= 500)
      serverErrors.push(`HTTP ${r.status()} ${r.request().method()} ${r.url()}`);
  });
  page.on("requestfailed", (r) => {
    // ERR_ABORTED = request cancelled by a navigation; not a failure.
    if (r.failure()?.errorText !== "net::ERR_ABORTED")
      network.push(`${r.failure()?.errorText ?? "failed"} ${r.method()} ${r.url()}`);
  });

  const fill = (v: string) =>
    v
      .replace(/\{\{loginEmail\}\}/g, opts.credentials?.email ?? "")
      .replace(/\{\{loginPassword\}\}/g, opts.credentials?.password ?? "");

  async function goto(target: string) {
    const url = new URL(target, baseUrl).toString();
    await page.goto(url, { waitUntil: "load", timeout: 15_000 });
    if (page.url().startsWith("chrome-error://"))
      throw new Error(`net::ERR navigation to ${url} failed`);
  }

  async function exec(step: Step, raw: string) {
    switch (step.kind) {
      case "goto":
        return goto(step.target);
      case "click": {
        const el = await firstVisible([
          page.getByRole("button", { name: step.text }),
          page.getByRole("link", { name: step.text }),
          page.getByText(step.text),
        ]);
        if (!el) throw new Blocked(`no button, link or text "${step.text}" for step: ${raw}`);
        await el.click();
        return page.waitForLoadState("load").catch(() => {});
      }
      case "type": {
        const el = await firstVisible([
          page.getByLabel(step.field),
          page.getByPlaceholder(step.field),
          page.locator(`[name="${esc(step.field)}"]`),
          page.getByRole("textbox", { name: step.field }),
        ]);
        if (!el) throw new Blocked(`no field "${step.field}" for step: ${raw}`);
        return el.fill(fill(step.value));
      }
      case "select": {
        const el = await firstVisible([
          page.getByLabel(step.field),
          page.locator(`select[name="${esc(step.field)}"]`),
        ]);
        if (!el) throw new Blocked(`no select "${step.field}" for step: ${raw}`);
        await el.selectOption({ label: step.option }).catch(() => el.selectOption(step.option));
        return;
      }
      case "press":
        await page.keyboard.press(step.key);
        return page.waitForLoadState("load").catch(() => {});
      case "wait":
        return page.waitForTimeout(step.seconds * 1000);
      case "expectText":
        if (
          !(await page
            .getByText(step.text)
            .first()
            .waitFor({ state: "visible", timeout: 5000 })
            .then(
              () => true,
              () => false,
            ))
        )
          throw new Failed(`expected text not visible: "${step.text}"`);
        return;
      case "expectTitle":
        if (!(await poll(async () => (await page.title()).includes(step.text), 5000)))
          throw new Failed(`expected title to contain "${step.text}", got "${await page.title()}"`);
        return;
      case "expectUrl":
        if (!(await poll(() => page.url().includes(step.text), 5000)))
          throw new Failed(`expected url to contain "${step.text}", got "${page.url()}"`);
        return;
      case "expectNoConsoleErrors":
        if (consoleErrors.length)
          throw new Failed(`console errors: ${consoleErrors.slice(0, 3).join(" | ")}`);
        return;
      case "expectNoServerErrors":
        if (serverErrors.length)
          throw new Failed(`server errors: ${serverErrors.slice(0, 3).join(" | ")}`);
        return;
    }
  }

  async function body(): Promise<void> {
    await goto(baseUrl); // every case starts from baseUrl
    const steps = testCase.steps.slice(0, maxSteps);
    for (const raw of steps) {
      const step = parseStep(raw);
      if (!step) throw new Blocked(`cannot interpret step: ${raw}`);
      await exec(step, raw);
    }
    // Quoted strings in "expected" must appear somewhere on the final page.
    const texts = quotedTexts(testCase.expected);
    if (texts.length) {
      const haystack = `${await page.title()}\n${page.url()}\n${await page
        .locator("body")
        .innerText()
        .catch(() => "")}`;
      const missing = texts.filter((t) => !haystack.includes(t));
      if (missing.length)
        throw new Failed(
          `expected result not met, missing: ${missing.map((m) => `"${m}"`).join(", ")}`,
        );
    }
  }

  let status: CaseStatus = "passed";
  let errorText: string | undefined;
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      body(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Failed(`case exceeded ${caseTimeoutMs / 1000}s`)),
          caseTimeoutMs,
        );
      }),
    ]);
  } catch (err) {
    // eslint-disable-next-line no-control-regex
    const plain = (err instanceof Error ? err.message : String(err)).replace(
      /\u001b\[[0-9;]*m/g,
      "",
    );
    const msg = plain.split("\n").slice(0, 3).join(" ");
    errorText = msg.slice(0, 2000);
    status =
      err instanceof Blocked
        ? "blocked"
        : err instanceof Failed
          ? "failed"
          : /net::ERR_|navigation to .* failed/.test(msg)
            ? "error"
            : "failed";
  } finally {
    clearTimeout(timer);
  }

  // Never report a pass from Chromium's own error page.
  if (status === "passed" && page.url().startsWith("chrome-error://")) {
    status = "error";
    errorText = "page ended on a browser error page";
  }

  mkdirSync(caseDir, { recursive: true });
  if (status !== "passed" || opts.screenshotOnPass) {
    const name = status === "passed" ? "final.png" : "failure.png";
    const ok = await page.screenshot({ path: join(caseDir, name), fullPage: true }).then(
      () => true,
      () => false,
    );
    if (ok) evidence.push({ kind: "png", path: `${testCase.key}/${name}` });
  }

  if (status !== "passed") {
    // What the page actually showed: lets the analyzer tell a wrong test from a wrong app.
    const text = await page
      .locator("body")
      .innerText({ timeout: 2000 })
      .catch(() => "");
    const excerpt = `url: ${page.url()}\ntitle: ${await page.title().catch(() => "")}\n\n${text.slice(0, 3000)}`;
    writeFileSync(join(caseDir, "page.txt"), excerpt);
    evidence.push({ kind: "page", path: `${testCase.key}/page.txt` });
  }

  const video = page.video();
  await context.close(); // flushes the video file
  const videoPath = await video?.path().catch(() => undefined);
  if (videoPath && status !== "passed") {
    renameSync(videoPath, join(caseDir, "video.webm")); // retain-on-failure
    evidence.push({ kind: "webm", path: `${testCase.key}/video.webm` });
  }
  rmSync(videoTmp, { recursive: true, force: true });

  if (consoleErrors.length) {
    writeFileSync(join(caseDir, "console.json"), JSON.stringify(consoleErrors, null, 2));
    evidence.push({ kind: "console", path: `${testCase.key}/console.json` });
  }
  if (serverErrors.length || network.length) {
    writeFileSync(
      join(caseDir, "network.json"),
      JSON.stringify({ serverErrors, failedRequests: network }, null, 2),
    );
    evidence.push({ kind: "network", path: `${testCase.key}/network.json` });
  }

  return {
    status,
    durationMs: Date.now() - started,
    errorText,
    evidence,
    consoleErrors,
    serverErrors,
  };
}
