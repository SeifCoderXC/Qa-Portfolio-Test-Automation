import type { Page } from "playwright";
import type { AppPage, Field } from "./types";

type Raw = Omit<AppPage, "url" | "links"> & { links: { text: string; href: string }[] };

/** Runs inside the page. Must be self-contained (serialized by Playwright). */
function extractInPage(): Raw {
  const clean = (s: string | null | undefined) =>
    (s ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  const q = (v: string) => v.replace(/"/g, '\\"');

  function selectorFor(el: Element): string {
    const tag = el.tagName.toLowerCase();
    if (el.id && document.querySelectorAll(`#${CSS.escape(el.id)}`).length === 1)
      return `#${CSS.escape(el.id)}`;
    for (const attr of ["data-testid", "name", "aria-label"]) {
      const v = el.getAttribute(attr);
      if (v && document.querySelectorAll(`${tag}[${attr}="${q(v)}"]`).length === 1)
        return `${tag}[${attr}="${q(v)}"]`;
    }
    const parts: string[] = [];
    let cur: Element | null = el;
    while (cur && cur !== document.body && parts.length < 4) {
      const parent: Element | null = cur.parentElement;
      const t = cur.tagName.toLowerCase();
      const same = parent
        ? Array.from(parent.children).filter((c) => c.tagName === cur!.tagName)
        : [];
      parts.unshift(same.length > 1 ? `${t}:nth-of-type(${same.indexOf(cur) + 1})` : t);
      cur = parent;
    }
    return parts.join(" > ");
  }

  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };

  function field(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): Field {
    const labelled = el.labels?.[0]?.innerText;
    return {
      name: el.name || el.id || "",
      type: el instanceof HTMLInputElement ? el.type : el.tagName.toLowerCase(),
      label: clean(labelled || el.getAttribute("aria-label") || el.getAttribute("placeholder")),
      selector: selectorFor(el),
      required: el.required,
    };
  }

  const fieldEls = (root: ParentNode) =>
    Array.from(
      root.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
        "input, select, textarea",
      ),
    ).filter(
      (el) =>
        !(
          el instanceof HTMLInputElement &&
          ["hidden", "submit", "button", "reset", "image"].includes(el.type)
        ) && visible(el),
    );

  const forms = Array.from(document.forms)
    .filter(visible)
    .slice(0, 20)
    .map((f) => ({ selector: selectorFor(f), fields: fieldEls(f).slice(0, 30).map(field) }));

  const inputs = fieldEls(document)
    .filter((el) => !el.form)
    .slice(0, 30)
    .map(field);

  const buttons = Array.from(
    document.querySelectorAll(
      'button, input[type="submit"], input[type="button"], [role="button"]',
    ),
  )
    .filter(visible)
    .slice(0, 50)
    .map((el) => ({
      text: clean(
        (el as HTMLElement).innerText ||
          (el as HTMLInputElement).value ||
          el.getAttribute("aria-label"),
      ),
      selector: selectorFor(el),
    }));

  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))
    .slice(0, 200)
    .map((a) => ({ text: clean(a.innerText || a.getAttribute("aria-label")), href: a.href }));

  const headings = Array.from(document.querySelectorAll("h1, h2"))
    .filter(visible)
    .slice(0, 10)
    .map((h) => clean((h as HTMLElement).innerText))
    .filter(Boolean);

  return { title: clean(document.title), headings, forms, buttons, inputs, links };
}

export async function extractPage(
  page: Page,
  crawlable: (href: string, text: string) => string | null,
): Promise<AppPage> {
  const raw = await page.evaluate(extractInPage);
  const seen = new Set<string>();
  const links: AppPage["links"] = [];
  for (const l of raw.links) {
    const url = crawlable(l.href, l.text);
    if (url && !seen.has(url)) {
      seen.add(url);
      links.push({ text: l.text, url });
    }
  }
  return { ...raw, url: page.url(), links };
}
