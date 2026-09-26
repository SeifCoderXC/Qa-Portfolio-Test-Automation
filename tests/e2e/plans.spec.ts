import { expect, test } from "./fixtures";

test.describe("plans", () => {
  test("a new project shows the empty state and only Discover is enabled", async ({
    plans,
    project,
  }) => {
    await plans.goto(project.id);
    await expect(plans.heading).toBeVisible();
    await expect(plans.emptyState).toBeVisible();
    await expect(plans.caseRows).toHaveCount(0);
    await expect(plans.discoverButton).toBeEnabled();
    await expect(plans.generatePlanButton).toBeDisabled();
    await expect(plans.runButton).toBeDisabled();
  });

  test("the cases API agrees: no plan yet", async ({ request, project }) => {
    const res = await request.get(`/api/projects/${project.id}/cases`);
    expect(res.status()).toBe(404);
    expect((await res.json()).error).toBe("no plan yet");
  });
});
