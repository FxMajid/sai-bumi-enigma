import { getBackendConfig } from "@/server/config";
import { errorResponse } from "@/server/errors";
import { actorHash, enforceOrigin, readSubmission } from "@/server/request";
import { submitGroup } from "@/server/registration-service";
import { registrationContext } from "@/server/registration-session";
import { sha256 } from "@/server/photo";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const config = getBackendConfig();
    enforceOrigin(request, config);
    const { registration, uploadToken, idempotencyKey, processId } = await readSubmission(request);
    const sessionHash = registrationContext(request, processId, config);
    const group = await submitGroup(registration, idempotencyKey, sha256(Buffer.from(uploadToken)), sessionHash, actorHash(request, config));
    return Response.json(group, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
