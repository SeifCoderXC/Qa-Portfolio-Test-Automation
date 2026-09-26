/**
 * Form-field accessibility audit, shared by the crawler (to record facts) and the runner
 * (to assert them). A placeholder is not a label (WCAG 1.3.1 / 3.3.2), and email/password
 * fields should say what they are for (WCAG 1.3.5, password managers).
 */

export type LabelSource =
  "label" | "aria-labelledby" | "aria-label" | "title" | "placeholder-only" | "none";

export type FieldAudit = {
  type: string;
  name: string;
  placeholder: string;
  /** Accessible label text, never the placeholder. */
  label: string;
  labelSource: LabelSource;
  autocomplete: string;
};

/** Runs inside the page (serialized by Playwright): audits every visible form field. */
export function auditFieldsInPage(): FieldAudit[] {
  const clean = (s: string | null | undefined) =>
    (s ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };
  const els = Array.from(
    document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      "input, select, textarea",
    ),
  ).filter(
    (el) =>
      !(
        el instanceof HTMLInputElement &&
        ["hidden", "submit", "button", "reset", "image", "checkbox", "radio"].includes(el.type)
      ) && visible(el),
  );
  return els.map((el) => {
    const byLabel = clean(
      Array.from(el.labels ?? [])
        .map((l) => l.innerText)
        .join(" "),
    );
    const ids = (el.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean);
    const byIds = clean(ids.map((id) => document.getElementById(id)?.textContent ?? "").join(" "));
    const byAria = clean(el.getAttribute("aria-label"));
    const byTitle = clean(el.getAttribute("title"));
    const placeholder = clean(el.getAttribute("placeholder"));
    const [label, labelSource]: [string, LabelSource] = byLabel
      ? [byLabel, "label"]
      : byIds
        ? [byIds, "aria-labelledby"]
        : byAria
          ? [byAria, "aria-label"]
          : byTitle
            ? [byTitle, "title"]
            : placeholder
              ? ["", "placeholder-only"]
              : ["", "none"];
    return {
      type: el instanceof HTMLInputElement ? el.type : el.tagName.toLowerCase(),
      name: el.name || el.id || "",
      placeholder,
      label,
      labelSource,
      autocomplete: (el.getAttribute("autocomplete") ?? "").trim().toLowerCase(),
    };
  });
}

const describeField = (f: FieldAudit) =>
  `${f.type} field${f.placeholder ? ` "${f.placeholder}"` : f.name ? ` "${f.name}"` : ""}`;

/** Fields without a real label (placeholder-only or nothing). */
export function unlabeledFields(fields: FieldAudit[]): string[] {
  return fields
    .filter((f) => f.labelSource === "placeholder-only" || f.labelSource === "none")
    .map(
      (f) =>
        `${describeField(f)} has ${f.labelSource === "none" ? "no label" : "only a placeholder"}`,
    );
}

const EMAIL_TOKENS = ["email", "username"];
const PASSWORD_TOKENS = ["current-password", "new-password"];

/** Email/password fields whose autocomplete attribute does not identify them. */
export function missingAutocomplete(fields: FieldAudit[]): string[] {
  const tokens = (f: FieldAudit) => f.autocomplete.split(/\s+/);
  return fields
    .filter(
      (f) =>
        (f.type === "email" && !tokens(f).some((t) => EMAIL_TOKENS.includes(t))) ||
        (f.type === "password" && !tokens(f).some((t) => PASSWORD_TOKENS.includes(t))),
    )
    .map((f) => `${describeField(f)} has autocomplete="${f.autocomplete || "(none)"}"`);
}
