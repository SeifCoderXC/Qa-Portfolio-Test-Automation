import type { Locator, Page } from "@playwright/test";

/** Plans page (`/plans?p=<projectId>`). Locators only. */
export class PlansPage {
  readonly heading: Locator;
  readonly discoverButton: Locator;
  readonly generatePlanButton: Locator;
  readonly runButton: Locator;
  readonly emptyState: Locator;
  readonly caseRows: Locator;
  readonly addCaseToggle: Locator;

  constructor(readonly page: Page) {
    this.heading = page.getByRole("heading", { name: "Plan", exact: true });
    this.discoverButton = page.getByRole("button", { name: /Discover app|Re-discover/ });
    this.generatePlanButton = page.getByRole("button", { name: /^Generate plan/ });
    this.runButton = page.getByRole("button", { name: /^Run / });
    this.emptyState = page.getByText(
      /Discover the app, then generate a plan\.|No plan yet\. Generate one\./,
    );
    this.caseRows = page.getByRole("checkbox", { name: /^Approve TC-/ });
    this.addCaseToggle = page.getByText("Add test case", { exact: true });
  }

  goto(projectId: string) {
    return this.page.goto(`/plans?p=${projectId}`);
  }
}
