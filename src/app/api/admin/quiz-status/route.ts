import { getQuizSystemStatus, setQuizSystemStatus } from "@/server/quiz-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function checkAdminAuth(request: Request): boolean {
  const cookie = request.headers.get("cookie") || "";
  const authHeader = request.headers.get("authorization") || "";
  const adminSecret = process.env.ADMIN_PASSWORD || "adminenigma2026";

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
    const status = await getQuizSystemStatus();
    return Response.json({ success: true, status });
  } catch {
    return Response.json({ error: "Gagal mengambil status kuis." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!checkAdminAuth(request)) {
    return Response.json({ error: "Sesi admin tidak valid atau telah berakhir." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const isOpen = Boolean(body.isOpen);
    const updated = await setQuizSystemStatus(isOpen);
    return Response.json({ success: true, status: updated });
  } catch {
    return Response.json({ error: "Gagal memperbarui status kuis." }, { status: 500 });
  }
}

