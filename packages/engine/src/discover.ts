import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { launchBrowser, newContext } from "./browser";
import { extractPage } from "./extract";
import { hasPasswordField, tryLogin } from "./login";
import type { AppMap, Credentials } from "./types";
import { crawlable } from "./url";

export type DiscoverOptions = {
  baseUrl: string;
  credentials?: Credentials;
  /** Where to save a screenshot of the first page. */
  screenshotPath: string;
  maxPages?: number;
  maxDepth?: number;
  pageTimeoutMs?: number;
  log?: (msg: string) => void;
};

export type DiscoverResult = { map: AppMap; loginError?: string; errors: string[] };

export async function discover(opts: DiscoverOptions): Promise<DiscoverResult> {
  const {
    baseUrl,
    credentials,
    maxPages = 25,
    maxDepth = 3,
    pageTimeoutMs = 15_000,
    log = () => {},
  } = opts;
  const map: AppMap = { baseUrl, pages: [], auth: { loginDetected: false } };
  const errors: string[] = [];
  let loginError: string | undefined;
  let loginAttempted = false;

  const start = crawlable(baseUrl, baseUrl);
  if (!start) throw new Error(`baseUrl is not crawlable: ${baseUrl}`);

  const browser = await launchBrowser();
  try {
    const context = await newContext(browser);
    const page = await context.newPage();
    page.setDefaultTimeout(pageTimeoutMs);

    const queue: { url: string; depth: number }[] = [{ url: start, depth: 0 }];
    const seen = new Set([start]);

    while (queue.length && map.pages.length < maxPages) {
      const { url, depth } = queue.shift()!;
      try {
        const res = await page.goto(url, { timeout: pageTimeoutMs, waitUntil: "load" });
        await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
        if (page.url().startsWith("chrome-error://"))
          throw new Error(`navigation failed for ${url}`);
        if (res && res.status() >= 400) errors.push(`${url} -> HTTP ${res.status()}`);

        if (map.pages.length === 0) {
          mkdirSync(dirname(opts.screenshotPath), { recursive: true });
          await page.screenshot({ path: opts.screenshotPath });
        }

        if (await hasPasswordField(page)) {
          map.auth.loginDetected = true;
          map.auth.loginUrl ??= page.url();
          if (credentials && !loginAttempted) {
            loginAttempted = true;
            log(`login form found on ${page.url()}, trying credentials`);
            // Record the login page itself before we leave it.
            map.pages.push(await extractPage(page, (h, t) => crawlable(h, baseUrl, t)));
            loginError = (await tryLogin(page, credentials)) ?? undefined;
            map.auth.loggedIn = !loginError;
            // On failure keep crawling whatever is public from here.
            log(loginError ?? "login ok");
          }
        }

        // Pages are keyed by the URL we landed on (redirects included).
        if (map.pages.some((p) => p.url === page.url())) continue;
        const info = await extractPage(page, (h, t) => crawlable(h, baseUrl, t));
        map.pages.push(info);
        log(`page ${map.pages.length}: ${info.url}`);

        if (depth < maxDepth) {
          for (const link of info.links) {
            if (!seen.has(link.url)) {
              seen.add(link.url);
              queue.push({ url: link.url, depth: depth + 1 });
            }
          }
        }
      } catch (err) {
        errors.push(`${url}: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
      }
    }
  } finally {
    await browser.close();
  }

  if (map.pages.length === 0) throw new Error(`no pages reached. ${errors.join("; ")}`);
  return { map, loginError, errors };
}
