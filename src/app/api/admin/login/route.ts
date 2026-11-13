import { verifyAdminPassword } from "@/server/quiz-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { password } = await request.json();
    if (!password || !verifyAdminPassword(String(password).trim())) {
      return Response.json({ error: "Password admin tidak sesuai." }, { status: 401 });
    }

    const response = Response.json({
      success: true,
      token: "P@ssw0rd#adminEnigma2026",
    });
    response.headers.set(
      "Set-Cookie",
      `admin_session=authenticated; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${
        process.env.NODE_ENV === "production" ? "; Secure" : ""
      }`
    );
    return response;
  } catch {
    return Response.json({ error: "Gagal memproses autentikasi admin." }, { status: 500 });
  }
}

