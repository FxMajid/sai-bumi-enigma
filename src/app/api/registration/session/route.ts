import { z } from "zod";
import { getBackendConfig } from "@/server/config";
import { enforceOrigin, readBoundedBody } from "@/server/request";
import { sessionCookie } from "@/server/registration-session";
import { errorResponse, fail } from "@/server/errors";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const config = getBackendConfig();
    enforceOrigin(request, config);
    const bytes = await readBoundedBody(request, 1024);
    let body: unknown;
    try { body = JSON.parse(bytes.toString("utf8")); } catch { fail("VALIDATION"); }
    if (!z.object({}).strict().safeParse(body).success) fail("VALIDATION");
    return Response.json({ ready: true }, { headers: { "Cache-Control": "private, no-store", "Set-Cookie": sessionCookie(request, config) } });
  } catch (error) { return errorResponse(error); }
}
