const SKIP_EXT =
  /\.(pdf|zip|gz|tar|dmg|exe|msi|png|jpe?g|gif|svg|webp|ico|mp4|mp3|webm|csv|xlsx?|docx?)$/i;
const LOGOUT = /log\s*-?\s*out|sign\s*-?\s*out/i;

/** Absolute same-origin http(s) URL without hash, or null if the crawler must not visit it. */
export function crawlable(href: string, base: string, text = ""): string | null {
  let u: URL;
  try {
    u = new URL(href, base);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (u.origin !== new URL(base).origin) return null;
  if (SKIP_EXT.test(u.pathname)) return null;
  if (LOGOUT.test(u.pathname) || LOGOUT.test(text)) return null;
  u.hash = "";
  return u.toString();
}
