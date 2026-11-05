import { getRegistrationSnapshot } from "@/server/registration-service";
import { errorResponse } from "@/server/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try { return Response.json(await getRegistrationSnapshot(), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return errorResponse(error); }
}
