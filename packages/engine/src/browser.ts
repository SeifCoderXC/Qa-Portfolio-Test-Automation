import {
  chromium,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
} from "playwright";

/**
 * Playwright's bundled Chromium, or an installed Google Chrome as fallback
 * (PLAYWRIGHT_CHANNEL=chrome forces the latter).
 */
export async function launchBrowser(): Promise<Browser> {
  const channel = process.env.PLAYWRIGHT_CHANNEL;
  if (channel) return chromium.launch({ channel });
  try {
    return await chromium.launch();
  } catch (err) {
    if (!String(err).includes("Executable doesn't exist")) throw err;
    return chromium.launch({ channel: "chrome" });
  }
}

/**
 * tsx/esbuild wraps named functions in __name(...). Functions we pass to
 * page.evaluate carry that call into the page, so define it there.
 */
export async function newContext(
  browser: Browser,
  opts: BrowserContextOptions = {},
): Promise<BrowserContext> {
  const context = await browser.newContext(opts);
  await context.addInitScript({ content: "globalThis.__name ??= (f) => f;" });
  return context;
}
