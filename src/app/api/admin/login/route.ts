import { verifyAdminPassword } from "@/server/quiz-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { password } = await request.json();
    if (!password || !verifyAdminPassword(String(password).trim())) {
      return Response.json({ error: "Password admin tidak sesuai." }, { status: 401 });
    }

    const response = Response.json({ success: true });
    response.headers.set(
      "Set-Cookie",
      "admin_session=authenticated; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400"
    );
    return response;
  } catch {
    return Response.json({ error: "Gagal memproses autentikasi admin." }, { status: 500 });
  }
}

