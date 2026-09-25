import { NextResponse } from "next/server";

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });

export const error = (status: number, message: string, details?: Record<string, string>) =>
  NextResponse.json({ error: message, ...(details && { details }) }, { status });

export async function readJson(req: Request): Promise<{ ok: true; body: unknown } | { ok: false }> {
  try {
    return { ok: true, body: await req.json() };
  } catch {
    return { ok: false };
  }
}
