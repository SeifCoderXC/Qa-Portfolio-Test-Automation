import { expect, test } from "./fixtures";

test.describe("smoke", () => {
  test("home loads with title, navigation and the demo banner", async ({ page, home }) => {
    const response = await home.goto();
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle("AI QA");
    await expect(home.banner).toBeVisible();
    for (const link of ["Overview", "Plans", "Bugs", "Assistant"])
      await expect(home.nav.getByRole("link", { name: link })).toBeVisible();
  });

  test("banner can be dismissed for this session only", async ({ page, home, browser }) => {
    await home.goto();
    await page.getByRole("button", { name: "Dismiss" }).click();
    await expect(home.banner).toBeHidden();
    await page.reload();
    await expect(home.banner).toBeHidden();

    const fresh = await browser.newPage();
    await fresh.goto("/");
    await expect(fresh.getByText("Local demo. No login.")).toBeVisible();
    await fresh.close();
  });

  test("only answers on localhost", async ({ request }) => {
    const res = await request.get("/api/projects", { headers: { Host: "evil.example:3000" } });
    expect(res.status()).toBe(403);
  });
});
