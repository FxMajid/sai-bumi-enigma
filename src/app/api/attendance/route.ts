import { NextResponse } from "next/server";
import { getServerAttendanceRecords, recordServerAttendance } from "@/server/attendance-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const records = getServerAttendanceRecords();
    return NextResponse.json({ records });
  } catch {
    return NextResponse.json({ error: "Gagal memuat data kehadiran." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { nik, timestamp } = body;
    if (!nik || typeof nik !== "string") {
      return NextResponse.json({ error: "NIK diperlukan." }, { status: 400 });
    }

    const records = recordServerAttendance(nik.trim().toUpperCase(), timestamp);
    return NextResponse.json({ success: true, records });
  } catch {
    return NextResponse.json({ error: "Gagal mencatat kehadiran." }, { status: 500 });
  }
}

