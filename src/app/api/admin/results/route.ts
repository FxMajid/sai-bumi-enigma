import { getQuizSubmissionsList, getQuizSystemStatus } from "@/server/quiz-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const cookie = request.headers.get("cookie") || "";
  const authHeader = request.headers.get("authorization") || "";

  const isAuthenticated =
    cookie.includes("admin_session=authenticated") ||
    authHeader.replace("Bearer ", "").trim() === (process.env.ADMIN_PASSWORD || "adminenigma2026");

  if (!isAuthenticated) {
    return Response.json({ error: "Sesi admin tidak valid atau telah berakhir." }, { status: 401 });
  }

  try {
    const [submissions, quizStatus] = await Promise.all([
      getQuizSubmissionsList(),
      getQuizSystemStatus(),
    ]);
    return Response.json({ submissions, quizStatus });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal memuat rekap nilai kuis.";
    return Response.json({ error: message }, { status: 500 });
  }
}

