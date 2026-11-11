import { NextResponse } from "next/server";
import {
  deleteServerAttendance,
  getServerAttendanceRecords,
  resetAllServerAttendance,
} from "@/server/attendance-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function checkAdminAuth(request: Request): boolean {
  const cookie = request.headers.get("cookie") || "";
  const authHeader = request.headers.get("authorization") || "";
  return (
    cookie.includes("admin_session=authenticated") ||
    authHeader.replace("Bearer ", "").trim() === (process.env.ADMIN_PASSWORD || "adminenigma2026")
  );
}

export async function GET(request: Request) {
  if (!checkAdminAuth(request)) {
    return NextResponse.json({ error: "Sesi admin tidak valid." }, { status: 401 });
  }

  const records = getServerAttendanceRecords();
  return NextResponse.json({ records });
}

export async function DELETE(request: Request) {
  if (!checkAdminAuth(request)) {
    return NextResponse.json({ error: "Sesi admin tidak valid." }, { status: 401 });
  }

  try {
    const body = await request.json();
    if (body.all) {
      const records = resetAllServerAttendance();
      return NextResponse.json({ success: true, message: "Semua data absensi telah dikosongkan.", records });
    }

    if (body.nik) {
      const records = deleteServerAttendance(String(body.nik).trim().toUpperCase());
      return NextResponse.json({ success: true, message: `Absensi ${body.nik} telah dihapus.`, records });
    }

    return NextResponse.json({ error: "Parameter tidak lengkap." }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Gagal menghapus data absensi." }, { status: 500 });
  }
}

