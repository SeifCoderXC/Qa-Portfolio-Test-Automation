import { fieldHandle, type AppMap, type AppPage, type PlannedCase } from "./types";

const pathOf = (url: string) => {
  const u = new URL(url);
  return u.pathname + u.search;
};

/**
 * Offline planner: turns the app map into up to `count` checkable cases.
 * Order = priority: auth, form accessibility, forms, navigation, then per-page smoke checks.
 */
export function heuristicPlan(map: AppMap, count = 8): PlannedCase[] {
  const out: Omit<PlannedCase, "key">[] = [];
  const add = (c: Omit<PlannedCase, "key">) => {
    if (out.length < count && !out.some((o) => o.title === c.title)) out.push(c);
  };
  const home = map.pages[0];
  if (!home) return [];
  const homePath = pathOf(home.url);

  // Auth. Registration forms (two password fields, or a "sign up"-style submit) only get a case
  // that cannot create an account; login forms get a wrong-password and a stored-login case.
  const authForms = map.pages.flatMap((page) =>
    page.forms
      .filter((f) => f.fields.some((x) => x.type === "password"))
      .map((form) => ({ page, form })),
  );
  for (const { page, form } of authForms) {
    const user = form.fields.find(
      (f) => f.type === "email" || /user|email|login/i.test(f.name + fieldHandle(f)),
    );
    const passwords = form.fields.filter((f) => f.type === "password");
    const submit =
      form.submit ??
      page.buttons.find((b) => /log ?in|sign ?in|submit|continue/i.test(b.text))?.text;
    if (!user || !passwords[0] || !submit) continue;
    const path = pathOf(page.url);
    const isSignup = passwords.length >= 2 || /sign ?up|create|register|join/i.test(submit);
    if (isSignup) {
      if (passwords.length < 2) continue; // no safe negative case without a confirm field
      add({
        title: "Sign-up rejects mismatched passwords",
        objective:
          "Registration must not proceed when the confirmation differs. Safe: no account can be created.",
        preconditions: "Logged out.",
        steps: [
          `go to "${path}"`,
          `type "qa-probe@example.invalid" into "${fieldHandle(user)}"`,
          `type "Mismatch-A-12345" into "${fieldHandle(passwords[0])}"`,
          `type "Mismatch-B-67890" into "${fieldHandle(passwords[1]!)}"`,
          `click "${submit}"`,
          "expect no server errors",
          `expect url contains "${new URL(page.url).pathname}"`,
        ],
        expected: "The form shows a mismatch error and stays on the page.",
        severity: "high",
      });
      continue;
    }
    add({
      title: "Login rejects a wrong password",
      objective: "Invalid credentials must not grant access.",
      preconditions: "Logged out.",
      steps: [
        `go to "${path}"`,
        `type "not-a-user@example.invalid" into "${fieldHandle(user)}"`,
        `type "wrong-password-123" into "${fieldHandle(passwords[0])}"`,
        `click "${submit}"`,
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
        `go to "${path}"`,
        `type "{{loginEmail}}" into "${fieldHandle(user)}"`,
        `type "{{loginPassword}}" into "${fieldHandle(passwords[0])}"`,
        `click "${submit}"`,
        "expect no server errors",
      ],
      expected: "The user is signed in without errors.",
      severity: "critical",
    });
  }

  // Accessibility of forms: every page with fields gets a label check; login-type fields an autofill check.
  for (const page of map.pages.slice(0, 5)) {
    const fields = [...page.forms.flatMap((f) => f.fields), ...page.inputs];
    if (!fields.length) continue;
    const path = pathOf(page.url);
    add({
      title: `Form fields on ${path} have real labels`,
      objective:
        "WCAG 2.2 SC 1.3.1 and 3.3.2: every input needs a programmatic label; a placeholder is not a label because it disappears when the user types.",
      preconditions: "",
      steps: [`go to "${path}"`, "expect form fields have labels"],
      expected: "Every visible field has a <label>, aria-label or aria-labelledby.",
      severity: "medium",
    });
    if (fields.some((f) => f.type === "email" || f.type === "password"))
      add({
        title: `Login fields on ${path} support autofill`,
        objective:
          'WCAG 2.2 SC 1.3.5 Identify Input Purpose; password managers need autocomplete="email" and "current-password"/"new-password".',
        preconditions: "",
        steps: [`go to "${path}"`, "expect login fields have autocomplete"],
        expected: "Email and password fields declare their purpose with autocomplete.",
        severity: "low",
      });
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
