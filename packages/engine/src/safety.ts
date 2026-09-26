import { isAssertion, parseStep, quotedTexts } from "./steps";

/** Buttons whose click usually writes data somewhere: accounts, messages, orders, deletions. */
const WRITE_BUTTON =
  /\b(sign ?up|create|register|join|subscribe|send|submit|save|post|publish|order|buy|pay|checkout|purchase|delete|remove|reset|confirm|book|apply|invite|upload)\b/i;

/**
 * Why a case may change data in the app under test (null if it looks read-only).
 * Conservative on purpose: such cases need a person to approve them one by one.
 */
export function writesData(steps: string[]): string | null {
  let typed = false;
  for (const raw of steps) {
    const s = parseStep(raw);
    if (!s) continue;
    if (s.kind === "type" || s.kind === "select") typed = true;
    if (s.kind === "click" && WRITE_BUTTON.test(s.text)) return `clicks "${s.text}"`;
    if (s.kind === "press" && /enter/i.test(s.key) && typed) return "submits a form with Enter";
  }
  return null;
}

/** A case must check something: an expect step, or quoted text in its expected result. */
export function hasAssertion(steps: string[], expected: string): boolean {
  return (
    steps.some((s) => {
      const p = parseStep(s);
      return p !== null && isAssertion(p);
    }) || quotedTexts(expected).length > 0
  );
}
