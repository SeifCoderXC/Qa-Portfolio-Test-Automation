import { NextResponse, type NextRequest } from "next/server";

// Local demo without a login: refuse requests addressed to anything but loopback.
// Covers a server started without `-H 127.0.0.1` and DNS-rebinding from other sites.
const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

export function middleware(req: NextRequest) {
  if (LOOPBACK.test(req.headers.get("host") ?? "")) return NextResponse.next();
  return new NextResponse("AI QA is a local demo and only answers on localhost.", { status: 403 });
}
