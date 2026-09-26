import { expect, test } from "./fixtures";

test.describe("projects", () => {
  test("create a project for https://example.com from the form", async ({
    page,
    home,
    request,
  }) => {
    await home.goto();
    // First run shows the form directly; once projects exist it sits under "New project".
    if (await home.newProjectToggle.isVisible()) await home.newProjectToggle.click();
    await expect(home.urlNote).toBeVisible();

    const name = `e2e form ${Date.now()}`;
    await home.nameInput.fill(name);
    await home.urlInput.fill("https://example.com");
    await home.submitButton.click();

    await expect(page).toHaveURL(/\/plans\?p=[0-9a-f-]{36}$/);
    const id = new URL(page.url()).searchParams.get("p")!;
    const saved = await (await request.get(`/api/projects/${id}`)).json();
    expect(saved).toMatchObject({ name, baseUrl: "https://example.com", secretKinds: [] });
  });

  test("rejects a non-http URL with a field error", async ({ home }) => {
    await home.goto();
    if (await home.newProjectToggle.isVisible()) await home.newProjectToggle.click();
    await home.nameInput.fill("bad url");
    await home.urlInput.fill("ftp://example.com");
    await home.submitButton.click();
    await expect(home.page.getByText("baseUrl: must be http or https")).toBeVisible();
  });

  test("API refuses credentials inside the URL", async ({ request }) => {
    const res = await request.post("/api/projects", {
      data: { name: "creds in url", baseUrl: "https://user:secret@example.com" },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).details.baseUrl).toBe("must not contain credentials");
  });
});
