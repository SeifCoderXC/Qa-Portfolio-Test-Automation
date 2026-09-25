import Anthropic from "@anthropic-ai/sdk";
import { answer, MAX_TURNS, type ChatMessage } from "@/lib/assistant";
import { error, json, readJson } from "@/lib/http";
import { pickProject } from "@/lib/queries";

export async function POST(req: Request) {
  const read = await readJson(req);
  if (!read.ok) return error(400, "invalid JSON body");
  const body = (read.body ?? {}) as { projectId?: unknown; messages?: unknown };

  const project = pickProject(typeof body.projectId === "string" ? body.projectId : undefined);
  if (!project) return error(404, "no project");

  const raw = Array.isArray(body.messages) ? body.messages : [];
  const valid = raw.every(
    (m) =>
      m &&
      typeof m === "object" &&
      ["user", "assistant"].includes((m as ChatMessage).role) &&
      typeof (m as ChatMessage).content === "string",
  );
  if (!raw.length || !valid)
    return error(400, "validation failed", { messages: "non-empty array of {role, content}" });

  // Cap to the last MAX_TURNS turns; the model API needs the list to start with a user message.
  let messages = (raw as ChatMessage[])
    .slice(-(MAX_TURNS * 2 - 1))
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  while (messages.length && messages[0]!.role !== "user") messages = messages.slice(1);
  if (messages[messages.length - 1]?.role !== "user")
    return error(400, "validation failed", { messages: "last message must be from the user" });

  try {
    return json(await answer(project.id, messages));
  } catch (err) {
    if (err instanceof Anthropic.APIError) return error(502, `model error (HTTP ${err.status})`);
    throw err;
  }
}
