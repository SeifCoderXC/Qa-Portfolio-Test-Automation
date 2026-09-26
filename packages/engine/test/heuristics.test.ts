import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hasAssertion,
  heuristicClassify,
  heuristicPlan,
  missingAutocomplete,
  parseStep,
  unlabeledFields,
  writesData,
  type AppMap,
  type FailureInput,
  type Field,
  type FieldAudit,
} from "../src/index";

test("parseStep understands the grammar and rejects prose", () => {
  assert.deepEqual(parseStep('go to "/login"'), { kind: "goto", target: "/login" });
  assert.deepEqual(parseStep('click "Sign in"'), { kind: "click", text: "Sign in" });
  assert.deepEqual(parseStep('type "{{loginEmail}}" into "Email"'), {
    kind: "type",
    value: "{{loginEmail}}",
    field: "Email",
  });
  assert.deepEqual(parseStep("expect no server errors"), { kind: "expectNoServerErrors" });
  assert.equal(parseStep("Observe the page carefully"), null);
});

test("heuristicClassify: a failed step is not automatically a product bug", () => {
  const base: FailureInput = {
    caseKey: "TC-001",
    title: "t",
    steps: [],
    expected: "",
    severity: "medium",
    status: "failed",
    errorText: "",
    consoleTail: [],
    serverErrors: [],
  };
  assert.equal(
    heuristicClassify({
      ...base,
      status: "error",
      errorText: "page.goto: net::ERR_NAME_NOT_RESOLVED",
    }).class,
    "env",
  );
  assert.equal(
    heuristicClassify({
      ...base,
      errorText: 'page.goto: Timeout 15000ms exceeded. Call log: - navigating to "https://x/"',
    }).class,
    "env",
  );
  assert.equal(
    heuristicClassify({ ...base, serverErrors: ["HTTP 500 GET /contact"] }).class,
    "product_bug",
  );
  assert.equal(
    heuristicClassify({ ...base, status: "blocked", errorText: 'no button "Buy"' }).class,
    "test_bug",
  );
  assert.equal(
    heuristicClassify({
      ...base,
      errorText: "locator.click: Timeout 10000ms exceeded. waiting for locator",
    }).class,
    "test_bug",
  );
  assert.equal(
    heuristicClassify({ ...base, errorText: 'expected text not visible: "Welcome"' }).class,
    "product_bug",
  );
});

test("heuristicPlan: 8 runnable cases even for a one-page site, auth first when a login exists", () => {
  const page = {
    url: "https://example.com/",
    title: "Example Domain",
    headings: ["Example Domain"],
    forms: [],
    buttons: [],
    inputs: [],
    links: [],
  };
  const small: AppMap = {
    baseUrl: "https://example.com",
    pages: [page],
    auth: { loginDetected: false },
  };
  const cases = heuristicPlan(small);
  assert.equal(cases.length, 8);
  for (const c of cases)
    for (const s of c.steps) assert.ok(parseStep(s), `unparseable step in ${c.key}: ${s}`);

  const f = (over: Partial<Field>): Field => ({
    name: "",
    type: "text",
    label: "",
    placeholder: "",
    labelSource: "label",
    autocomplete: "",
    selector: "input",
    required: true,
    ...over,
  });
  const login: AppMap = {
    baseUrl: "https://app.test",
    auth: { loginDetected: true, loginUrl: "https://app.test/login" },
    pages: [
      {
        ...page,
        url: "https://app.test/login",
        forms: [
          {
            selector: "form",
            submit: "Sign in",
            fields: [
              f({ type: "email", label: "Email" }),
              f({ type: "password", label: "Password" }),
            ],
          },
        ],
        buttons: [{ text: "Sign in", selector: "button" }],
      },
    ],
  };
  const first = heuristicPlan(login)[0]!;
  assert.equal(first.title, "Login rejects a wrong password");
  assert.equal(first.severity, "critical");

  // Typical sign-up form: placeholder-only fields, two passwords, "Create account".
  const signup: AppMap = {
    baseUrl: "https://app.test",
    auth: { loginDetected: true, loginUrl: "https://app.test/" },
    pages: [
      {
        ...page,
        url: "https://app.test/",
        forms: [
          {
            selector: "form",
            submit: "Create account",
            fields: [
              f({ type: "email", placeholder: "you@example.com", labelSource: "placeholder-only" }),
              f({
                type: "password",
                placeholder: "Create a password",
                labelSource: "placeholder-only",
              }),
              f({
                type: "password",
                placeholder: "Confirm password",
                labelSource: "placeholder-only",
              }),
            ],
          },
        ],
      },
    ],
  };
  const plan = heuristicPlan(signup);
  const titles = plan.map((c) => c.title);
  assert.ok(titles.includes("Sign-up rejects mismatched passwords"));
  assert.ok(
    !titles.some((t) => /stored credentials|wrong password/.test(t)),
    "no login cases on a sign-up form",
  );
  assert.ok(titles.includes("Form fields on / have real labels"));
  assert.ok(titles.includes("Login fields on / support autofill"));
  const mismatch = plan.find((c) => c.title === "Sign-up rejects mismatched passwords")!;
  assert.ok(
    mismatch.steps.includes('type "Mismatch-A-12345" into "Create a password"'),
    "finds fields by placeholder",
  );
  for (const c of plan)
    for (const s of c.steps) assert.ok(parseStep(s), `unparseable step in ${c.key}: ${s}`);
});

test("a11y audit: placeholder is not a label; email/password need autocomplete", () => {
  const audit = (o: Partial<FieldAudit>): FieldAudit => ({
    type: "text",
    name: "",
    placeholder: "",
    label: "",
    labelSource: "label",
    autocomplete: "",
    ...o,
  });
  const signupFields = [
    audit({ type: "email", placeholder: "you@example.com", labelSource: "placeholder-only" }),
    audit({ type: "password", placeholder: "Confirm password", labelSource: "placeholder-only" }),
  ];
  assert.equal(unlabeledFields(signupFields).length, 2);
  assert.equal(missingAutocomplete(signupFields).length, 2);
  const good = [
    audit({ type: "email", label: "Email", autocomplete: "email" }),
    audit({ type: "password", label: "Password", autocomplete: "current-password" }),
  ];
  assert.deepEqual(unlabeledFields(good), []);
  assert.deepEqual(missingAutocomplete(good), []);
  assert.deepEqual(parseStep("expect form fields have labels"), { kind: "expectFieldsLabelled" });
  assert.deepEqual(parseStep("expect login fields have autocomplete"), {
    kind: "expectLoginAutocomplete",
  });
});

test("safety: form submissions are flagged; cases must check something", () => {
  assert.equal(writesData(['go to "/"', 'expect text "Hi"']), null);
  assert.match(
    writesData(['type "a@b.co" into "Email"', 'click "Create account"'])!,
    /Create account/,
  );
  assert.match(writesData(['type "x" into "Search"', 'press "Enter"'])!, /Enter/);
  assert.equal(
    writesData(['click "Log in"']),
    null,
    "switching a tab or logging in writes nothing",
  );
  assert.equal(hasAssertion(['go to "/"'], "Page loads"), false);
  assert.equal(hasAssertion(['go to "/"'], 'Shows "Welcome"'), true);
  assert.equal(hasAssertion(['go to "/"', "expect no server errors"], ""), true);
});
