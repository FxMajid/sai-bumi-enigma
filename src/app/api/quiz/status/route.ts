import { getQuizSystemStatus } from "@/server/quiz-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const status = await getQuizSystemStatus();
    return Response.json(status);
  } catch {
    return Response.json({ isOpen: false, updatedAt: new Date().toISOString() });
  }
}

