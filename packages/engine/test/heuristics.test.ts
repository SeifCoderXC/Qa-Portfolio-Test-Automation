import assert from "node:assert/strict";
import { test } from "node:test";
import {
  heuristicClassify,
  heuristicPlan,
  parseStep,
  type AppMap,
  type FailureInput,
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
            fields: [
              { name: "email", type: "email", label: "Email", selector: "#e", required: true },
              {
                name: "password",
                type: "password",
                label: "Password",
                selector: "#p",
                required: true,
              },
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
});
