import { getBackendConfig } from "@/server/config";
import { errorResponse } from "@/server/errors";
import { actorHash, enforceOrigin, readRegistrationRequest } from "@/server/request";
import { registrationContext, uploadToken } from "@/server/registration-session";
import { consumeRegistrationBudget, stagePhoto } from "@/server/registration-service";
import { sha256 } from "@/server/photo";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    const config = getBackendConfig();
    enforceOrigin(request, config);
    await consumeRegistrationBudget(actorHash(request, config), "upload");
    const { photo, processId, uploadKey } = await readRegistrationRequest(request);
    const session = registrationContext(request, processId, config);
    const token = uploadToken(session, uploadKey, config);
    const staged = await stagePhoto(photo, session, uploadKey, sha256(Buffer.from(token)));
    return Response.json({ ...staged, token }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}
