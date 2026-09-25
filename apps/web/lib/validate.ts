export type CreateProjectInput = {
  name: string;
  baseUrl: string;
  loginEmail?: string;
  loginPassword?: string;
};

type Result<T> = { ok: true; value: T } | { ok: false; errors: Record<string, string> };

const str = (v: unknown) => (typeof v === "string" ? v : undefined);

export function parseCreateProject(body: unknown): Result<CreateProjectInput> {
  if (typeof body !== "object" || body === null) {
    return { ok: false, errors: { body: "expected a JSON object" } };
  }
  const b = body as Record<string, unknown>;
  const errors: Record<string, string> = {};

  const name = str(b.name)?.trim() ?? "";
  if (!name) errors.name = "required";
  else if (name.length > 200) errors.name = "max 200 characters";

  const rawUrl = str(b.baseUrl)?.trim() ?? "";
  let baseUrl = "";
  if (!rawUrl) {
    errors.baseUrl = "required";
  } else {
    try {
      const u = new URL(rawUrl);
      if (u.protocol !== "http:" && u.protocol !== "https:")
        errors.baseUrl = "must be http or https";
      else if (u.username || u.password) errors.baseUrl = "must not contain credentials";
      else baseUrl = rawUrl;
    } catch {
      errors.baseUrl = "not a valid URL";
    }
  }

  // Empty strings from the form mean "not provided".
  const loginEmail = str(b.loginEmail)?.trim() || undefined;
  const loginPassword = str(b.loginPassword) || undefined;
  if (b.loginEmail !== undefined && typeof b.loginEmail !== "string")
    errors.loginEmail = "must be a string";
  if (b.loginPassword !== undefined && typeof b.loginPassword !== "string")
    errors.loginPassword = "must be a string";
  if (loginEmail && !loginPassword) errors.loginPassword = "required when loginEmail is set";
  if (loginPassword && !loginEmail) errors.loginEmail = "required when loginPassword is set";

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { name, baseUrl, loginEmail, loginPassword } };
}
