import type { Locator, Page } from "@playwright/test";

/** Overview page (`/`) and its project form. Locators only. */
export class HomePage {
  readonly banner: Locator;
  readonly nav: Locator;
  readonly newProjectToggle: Locator;
  readonly nameInput: Locator;
  readonly urlInput: Locator;
  readonly submitButton: Locator;
  readonly formError: Locator;
  readonly urlNote: Locator;

  constructor(readonly page: Page) {
    this.banner = page.getByText(
      "Local demo. No login. Do not point this at apps or passwords you do not own.",
    );
    this.nav = page.getByRole("navigation");
    this.newProjectToggle = page.getByText("New project", { exact: true });
    this.nameInput = page.getByLabel("Name");
    this.urlInput = page.getByLabel("URL");
    this.submitButton = page.getByRole("button", { name: "Create project" });
    this.formError = page.locator("form").getByText(/validation failed|must be/);
    this.urlNote = page.getByText("http(s) URLs only.");
  }

  goto() {
    return this.page.goto("/");
  }
}
