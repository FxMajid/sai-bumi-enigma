import {
  deleteQuizSubmission,
  getQuizSubmissionsList,
  getQuizSystemStatus,
  resetAllQuizSubmissions,
} from "@/server/quiz-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function checkAdminAuth(request: Request): boolean {
  const cookie = request.headers.get("cookie") || "";
  const authHeader = request.headers.get("authorization") || "";
  const adminSecret = process.env.ADMIN_PASSWORD || "P@ssw0rd#adminEnigma2026";

  return (
    cookie.includes("admin_session=authenticated") ||
    authHeader.replace("Bearer ", "").trim() === adminSecret
  );
}

export async function GET(request: Request) {
  if (!checkAdminAuth(request)) {
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

export async function DELETE(request: Request) {
  if (!checkAdminAuth(request)) {
    return Response.json({ error: "Sesi admin tidak valid atau telah berakhir." }, { status: 401 });
  }

  try {
    const body = await request.json();
    if (body.all) {
      await resetAllQuizSubmissions();
      return Response.json({ success: true, message: "Semua data nilai kuis berhasil dikosongkan.", submissions: [] });
    }

    if (body.id || body.participantId) {
      const targetId = String(body.id || body.participantId).trim();
      const submissions = await deleteQuizSubmission(targetId);
      return Response.json({ success: true, message: "Data nilai kuis peserta berhasil dihapus.", submissions });
    }

    return Response.json({ error: "Parameter tidak lengkap." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal menghapus data kuis.";
    return Response.json({ error: message }, { status: 500 });
  }
}

