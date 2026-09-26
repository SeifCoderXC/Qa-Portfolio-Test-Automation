import { test as base, expect } from "@playwright/test";
import { HomePage } from "./pages/HomePage";
import { PlansPage } from "./pages/PlansPage";

type Project = { id: string; name: string; baseUrl: string };

/**
 * Page objects plus `project`: a fresh project created through the API for each test,
 * so every test starts from a known state (no plan, no runs, no bugs).
 */
export const test = base.extend<{ home: HomePage; plans: PlansPage; project: Project }>({
  home: async ({ page }, use) => use(new HomePage(page)),
  plans: async ({ page }, use) => use(new PlansPage(page)),
  project: async ({ request }, use, testInfo) => {
    const res = await request.post("/api/projects", {
      data: {
        name: `e2e ${testInfo.title.slice(0, 40)} ${Date.now()}`,
        baseUrl: "https://example.com",
      },
    });
    expect(res.status()).toBe(201);
    await use((await res.json()) as Project);
  },
});

export { expect };
