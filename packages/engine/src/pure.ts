// Browser-free helpers, safe to import from the web app (no Playwright in the bundle).
export { isAssertion, parseStep, quotedTexts, STEP_GRAMMAR, type Step } from "./steps";
export { hasAssertion, writesData } from "./safety";
