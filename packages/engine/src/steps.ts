/**
 * The step language shared by the planner (writes it) and the runner (executes it).
 * Deliberately tiny: one regex per verb, no compiler.
 */
export const STEP_GRAMMAR = `Each step is one line in exactly one of these forms (quotes are required):
  go to "<path or absolute url>"
  click "<visible text of a button or link>"
  type "<value>" into "<field label, placeholder or name>"
  select "<option>" in "<field label or name>"
  press "<Key>"                      (e.g. "Enter", "Tab")
  wait <n> seconds
  expect text "<visible text>"
  expect title contains "<text>"
  expect url contains "<text>"
  expect no console errors
  expect no server errors            (no HTTP 5xx on the page)
Values may use {{loginEmail}} and {{loginPassword}} for the stored login.
Maximum 8 steps per case.`;

export type Step =
  | { kind: "goto"; target: string }
  | { kind: "click"; text: string }
  | { kind: "type"; value: string; field: string }
  | { kind: "select"; option: string; field: string }
  | { kind: "press"; key: string }
  | { kind: "wait"; seconds: number }
  | { kind: "expectText"; text: string }
  | { kind: "expectTitle"; text: string }
  | { kind: "expectUrl"; text: string }
  | { kind: "expectNoConsoleErrors" }
  | { kind: "expectNoServerErrors" };

// Accept straight or curly quotes around arguments.
const Q = `["“”']([^"“”']*)["“”']`;
const rules: [RegExp, (m: RegExpMatchArray) => Step][] = [
  [
    new RegExp(`^(?:go to|open|navigate to|visit)\\s+${Q}$`, "i"),
    (m) => ({ kind: "goto", target: m[1]! }),
  ],
  [
    new RegExp(`^(?:go to|open|navigate to|visit)\\s+(\\S+)$`, "i"),
    (m) => ({ kind: "goto", target: m[1]! }),
  ],
  [
    new RegExp(`^click(?: on)?(?: the)?\\s+${Q}(?:\\s+(?:button|link))?$`, "i"),
    (m) => ({ kind: "click", text: m[1]! }),
  ],
  [
    new RegExp(
      `^(?:type|enter|fill)\\s+${Q}\\s+(?:into|in)\\s+(?:the\\s+)?${Q}(?:\\s+(?:field|input|box))?$`,
      "i",
    ),
    (m) => ({ kind: "type", value: m[1]!, field: m[2]! }),
  ],
  [
    new RegExp(`^fill\\s+${Q}\\s+with\\s+${Q}$`, "i"),
    (m) => ({ kind: "type", value: m[2]!, field: m[1]! }),
  ],
  [
    new RegExp(`^select\\s+${Q}\\s+(?:in|from)\\s+${Q}$`, "i"),
    (m) => ({ kind: "select", option: m[1]!, field: m[2]! }),
  ],
  [new RegExp(`^press\\s+${Q}$`, "i"), (m) => ({ kind: "press", key: m[1]! })],
  [/^press\s+(\w+)$/i, (m) => ({ kind: "press", key: m[1]! })],
  [
    /^wait\s+(\d+(?:\.\d+)?)\s*(?:s|sec|secs|seconds?)?$/i,
    (m) => ({ kind: "wait", seconds: Math.min(Number(m[1]), 10) }),
  ],
  [
    new RegExp(
      `^(?:expect|verify|assert|see)(?: that)?(?: the)?(?: page)?(?: shows)?\\s+text\\s+${Q}$`,
      "i",
    ),
    (m) => ({ kind: "expectText", text: m[1]! }),
  ],
  [
    new RegExp(`^(?:expect|verify|assert)(?: the)?\\s+title\\s+(?:to\\s+)?contains?\\s+${Q}$`, "i"),
    (m) => ({ kind: "expectTitle", text: m[1]! }),
  ],
  [
    new RegExp(`^(?:expect|verify|assert)(?: the)?\\s+url\\s+(?:to\\s+)?contains?\\s+${Q}$`, "i"),
    (m) => ({ kind: "expectUrl", text: m[1]! }),
  ],
  [
    /^(?:expect|verify|assert)\s+no\s+console\s+errors?$/i,
    () => ({ kind: "expectNoConsoleErrors" }),
  ],
  [/^(?:expect|verify|assert)\s+no\s+server\s+errors?$/i, () => ({ kind: "expectNoServerErrors" })],
];

/** Parse one step, or null if it is not in the grammar (the runner then marks the case blocked). */
export function parseStep(line: string): Step | null {
  const s = line.trim().replace(/[.;]+$/, "");
  for (const [re, build] of rules) {
    const m = s.match(re);
    if (m) return build(m);
  }
  return null;
}

/** Double-quoted strings in an "expected" sentence become text assertions. */
export function quotedTexts(expected: string): string[] {
  return [...expected.matchAll(/["“]([^"“”]{1,200})["”]/g)].map((m) => m[1]!);
}
