import { expect, test } from "./fixtures";

test.describe("bugs", () => {
  test("bugs page renders the empty state for a new project, no server error", async ({
    page,
    project,
  }) => {
    const response = await page.goto(`/bugs?p=${project.id}`);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Bugs", exact: true })).toBeVisible();
    await expect(page.getByText(/No bugs\./)).toBeVisible();
  });

  test("bugs API lists nothing for a new project and validates its filter", async ({
    request,
    project,
  }) => {
    const list = await request.get(`/api/bugs?projectId=${project.id}`);
    expect(list.status()).toBe(200);
    expect(await list.json()).toEqual([]);

    const bad = await request.get("/api/bugs?status=nonsense");
    expect(bad.status()).toBe(400);
  });

  test("unknown bug id is a 404, not a 500", async ({ request }) => {
    const res = await request.get("/api/bugs/00000000-0000-0000-0000-000000000000");
    expect(res.status()).toBe(404);
  });
});
