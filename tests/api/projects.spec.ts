import { expect, request, test, type APIRequestContext } from "@playwright/test";

// REST contract of the project API, with Playwright's request API (no browser).
const BASE_URL = "http://127.0.0.1:3000";
// A fake value we look for in responses; never a real password.
const CANARY_PASSWORD = "canary-not-a-real-password-7431";

let api: APIRequestContext;

test.beforeAll(async () => {
  api = await request.newContext({ baseURL: BASE_URL });
});
test.afterAll(async () => {
  await api.dispose();
});

const newProject = async (extra: Record<string, string> = {}) => {
  const res = await api.post("/api/projects", {
    data: { name: `api ${Date.now()}`, baseUrl: "https://example.com", ...extra },
  });
  expect(res.status()).toBe(201);
  return (await res.json()) as { id: string; name: string; baseUrl: string; hasLogin: boolean };
};

test.describe("GET /api/projects", () => {
  test("200 with an array of projects", async () => {
    await newProject();
    const res = await api.get("/api/projects");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/json");
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        name: expect.any(String),
        baseUrl: expect.any(String),
      }),
    );
  });
});

test.describe("POST /api/projects", () => {
  test("valid https URL → 201 with an id", async () => {
    const p = await newProject();
    expect(p.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(p).toMatchObject({ baseUrl: "https://example.com", hasLogin: false });
  });

  for (const [label, baseUrl, message] of [
    ["ftp:// URL", "ftp://example.com", "must be http or https"],
    ["javascript: URL", "javascript:alert(1)", "must be http or https"],
    ["credentials in the URL", "https://user:pass@example.com", "must not contain credentials"],
    ["not a URL", "not a url", "not a valid URL"],
  ] as const) {
    test(`${label} → 400 with a field error`, async () => {
      const res = await api.post("/api/projects", { data: { name: "bad", baseUrl } });
      expect(res.status()).toBe(400);
      expect(await res.json()).toMatchObject({
        error: "validation failed",
        details: { baseUrl: message },
      });
    });
  }

  test("missing name and invalid JSON → 400", async () => {
    const noName = await api.post("/api/projects", { data: { baseUrl: "https://example.com" } });
    expect(noName.status()).toBe(400);
    expect((await noName.json()).details.name).toBe("required");

    const badJson = await api.post("/api/projects", {
      headers: { "content-type": "application/json" },
      data: "{not json",
    });
    expect(badJson.status()).toBe(400);
  });

  test("password without email → 400", async () => {
    const res = await api.post("/api/projects", {
      data: { name: "half login", baseUrl: "https://example.com", loginPassword: CANARY_PASSWORD },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).details.loginEmail).toBe("required when loginPassword is set");
  });
});

test.describe("GET /api/projects/:id", () => {
  test("200 for a created project, 404 for a missing one", async () => {
    const p = await newProject();
    const found = await api.get(`/api/projects/${p.id}`);
    expect(found.status()).toBe(200);
    expect(await found.json()).toMatchObject({ id: p.id, secretKinds: [] });

    const missing = await api.get("/api/projects/00000000-0000-0000-0000-000000000000");
    expect(missing.status()).toBe(404);
    expect((await missing.json()).error).toBe("project not found");
  });

  test("never returns the raw password, anywhere", async () => {
    const p = await newProject({
      loginEmail: "qa@example.invalid",
      loginPassword: CANARY_PASSWORD,
    });
    expect(p.hasLogin).toBe(true);

    const detail = await api.get(`/api/projects/${p.id}`);
    expect(detail.status()).toBe(200);
    const body = await detail.json();
    expect(body.secretKinds.sort()).toEqual(["loginEmail", "loginPassword"]);
    for (const res of [detail, await api.get("/api/projects")]) {
      expect(await res.text()).not.toContain(CANARY_PASSWORD);
    }
  });
});

test.describe("POST /api/projects/:id/jobs", () => {
  test("discover → 201 with a queued job", async () => {
    const p = await newProject();
    const res = await api.post(`/api/projects/${p.id}/jobs`, { data: { type: "discover" } });
    expect(res.status()).toBe(201);
    expect(await res.json()).toMatchObject({
      type: "discover",
      status: "queued",
      payloadJson: { projectId: p.id },
    });
  });

  test("unknown job type → 400, unknown project → 404", async () => {
    const p = await newProject();
    const bad = await api.post(`/api/projects/${p.id}/jobs`, { data: { type: "ping" } });
    expect(bad.status()).toBe(400);
    expect((await bad.json()).details.type).toContain("discover");

    const missing = await api.post("/api/projects/00000000-0000-0000-0000-000000000000/jobs", {
      data: { type: "discover" },
    });
    expect(missing.status()).toBe(404);
  });

  test("run without a plan → 409", async () => {
    const p = await newProject();
    const res = await api.post(`/api/projects/${p.id}/jobs`, { data: { type: "run" } });
    expect(res.status()).toBe(409);
    expect((await res.json()).error).toContain("no plan yet");
  });
});
