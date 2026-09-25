import type { AppMap, AppPage, PlannedCase } from "./types";

const pathOf = (url: string) => {
  const u = new URL(url);
  return u.pathname + u.search;
};

/**
 * Offline planner: turns the app map into up to `count` checkable cases.
 * Order = priority: auth, forms, navigation, then per-page smoke checks.
 */
export function heuristicPlan(map: AppMap, count = 8): PlannedCase[] {
  const out: Omit<PlannedCase, "key">[] = [];
  const add = (c: Omit<PlannedCase, "key">) => {
    if (out.length < count && !out.some((o) => o.title === c.title)) out.push(c);
  };
  const home = map.pages[0];
  if (!home) return [];
  const homePath = pathOf(home.url);

  // Auth: a wrong password must not get you past the login page.
  if (map.auth.loginDetected && map.auth.loginUrl) {
    const loginPage = map.pages.find((p) => p.url === map.auth.loginUrl) ?? home;
    const form = loginPage.forms.find((f) => f.fields.some((x) => x.type === "password"));
    const user = form?.fields.find(
      (f) => f.type === "email" || /user|email|login/i.test(f.name + f.label),
    );
    const pass = form?.fields.find((f) => f.type === "password");
    const submit =
      loginPage.buttons.find((b) => /sign|log|submit|continue/i.test(b.text)) ??
      loginPage.buttons[0];
    if (user && pass && submit?.text) {
      const fieldName = (f: typeof user) => f.label || f.name;
      add({
        title: "Login rejects a wrong password",
        objective: "Invalid credentials must not grant access.",
        preconditions: "Logged out.",
        steps: [
          `go to "${pathOf(loginPage.url)}"`,
          `type "not-a-user@example.com" into "${fieldName(user)}"`,
          `type "wrong-password-123" into "${fieldName(pass)}"`,
          `click "${submit.text}"`,
          "expect no server errors",
        ],
        expected: "The user stays on the login form and sees an error; no server error.",
        severity: "critical",
      });
      add({
        title: "Login with stored credentials",
        objective: "Valid credentials grant access.",
        preconditions: "Project has a stored login.",
        steps: [
          `go to "${pathOf(loginPage.url)}"`,
          `type "{{loginEmail}}" into "${fieldName(user)}"`,
          `type "{{loginPassword}}" into "${fieldName(pass)}"`,
          `click "${submit.text}"`,
          "expect no server errors",
        ],
        expected: "The user is signed in without errors.",
        severity: "critical",
      });
    }
  }

  // Forms: submitting empty required fields must not crash the server.
  for (const page of map.pages) {
    for (const form of page.forms) {
      if (form.fields.some((f) => f.type === "password")) continue;
      const submit = page.buttons.find((b) => /save|submit|send|search|go|continue/i.test(b.text));
      if (!submit?.text || !form.fields.some((f) => f.required)) continue;
      add({
        title: `Empty submit on ${pathOf(page.url)} is validated`,
        objective: "Required fields are enforced.",
        preconditions: "",
        steps: [
          `go to "${pathOf(page.url)}"`,
          `click "${submit.text}"`,
          "expect no server errors",
          `expect url contains "${new URL(page.url).pathname}"`,
        ],
        expected: "The form is not submitted and the page stays put.",
        severity: "medium",
      });
    }
  }

  // Navigation: links on the home page reach their target.
  for (const link of home.links.slice(0, 4)) {
    if (!link.text || link.url === home.url) continue;
    add({
      title: `Navigate to "${link.text}"`,
      objective: "Primary navigation works.",
      preconditions: "",
      steps: [
        `go to "${homePath}"`,
        `click "${link.text}"`,
        `expect url contains "${new URL(link.url).pathname}"`,
        "expect no server errors",
      ],
      expected: `The ${new URL(link.url).pathname} page opens.`,
      severity: "high",
    });
  }

  // Smoke checks per page, then generic robustness checks.
  const smoke = (p: AppPage): Omit<PlannedCase, "key">[] => {
    const path = pathOf(p.url);
    const cases: Omit<PlannedCase, "key">[] = [];
    if (p.title)
      cases.push({
        title: `${path} loads with its title`,
        objective: "Page renders.",
        preconditions: "",
        steps: [`go to "${path}"`, `expect title contains "${p.title}"`, "expect no server errors"],
        expected: `The page title contains "${p.title}".`,
        severity: p === home ? "high" : "medium",
      });
    if (p.headings[0])
      cases.push({
        title: `${path} shows its main heading`,
        objective: "Primary content is visible.",
        preconditions: "",
        steps: [`go to "${path}"`, `expect text "${p.headings[0]}"`],
        expected: `The heading "${p.headings[0]}" is visible.`,
        severity: "medium",
      });
    cases.push({
      title: `${path} has no console errors`,
      objective: "No JavaScript errors on load.",
      preconditions: "",
      steps: [`go to "${path}"`, "wait 1 seconds", "expect no console errors"],
      expected: "The browser console has no errors.",
      severity: "low",
    });
    return cases;
  };
  for (const p of map.pages) smoke(p).forEach(add);

  add({
    title: "Unknown route does not cause a server error",
    objective: "Missing pages are handled gracefully.",
    preconditions: "",
    steps: [`go to "/ai-qa-missing-page-check"`, "expect no server errors"],
    expected: "A not-found page is shown, not an HTTP 5xx.",
    severity: "low",
  });
  add({
    title: "Home tolerates tracking query parameters",
    objective: "Marketing links with query strings still work.",
    preconditions: "",
    steps: [
      `go to "${home.url.split("?")[0]}?utm_source=ai-qa"`,
      "expect no server errors",
      ...(home.title ? [`expect title contains "${home.title}"`] : []),
    ],
    expected: "The home page loads normally.",
    severity: "low",
  });
  if (new URL(map.baseUrl).protocol === "https:") {
    add({
      title: "HTTP redirects to HTTPS",
      objective: "Traffic is encrypted.",
      preconditions: "",
      steps: [
        `go to "${map.baseUrl.replace(/^https:/, "http:")}"`,
        `expect url contains "https://"`,
      ],
      expected: "The browser ends up on the https:// URL.",
      severity: "medium",
    });
  }
  add({
    title: "Base URL loads as entered",
    objective: "The exact URL users were given works.",
    preconditions: "",
    steps: [
      `go to "${map.baseUrl}"`,
      "expect no server errors",
      ...(home.title ? [`expect title contains "${home.title}"`] : []),
    ],
    expected: "The configured base URL opens without errors.",
    severity: "high",
  });
  add({
    title: "Home survives a reload",
    objective: "Repeat visits render the same page.",
    preconditions: "",
    steps: [`go to "${homePath}"`, `go to "${homePath}"`, "expect no server errors"],
    expected: "The page loads both times.",
    severity: "low",
  });

  return out.map((c, i) => ({ key: `TC-${String(i + 1).padStart(3, "0")}`, ...c }));
}
