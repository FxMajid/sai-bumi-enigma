import { z } from "zod";
import { getRegisteredPhoto } from "@/server/registration-service";
import { errorResponse, fail } from "@/server/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ groupId: string }> }) {
  try {
    const parsed = z.object({ groupId: z.uuid() }).safeParse(await context.params);
    if (!parsed.success) fail("NOT_FOUND");
    const photo = await getRegisteredPhoto(parsed.data.groupId);
    return Response.json(photo, { headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  } catch (error) { return errorResponse(error); }
}
