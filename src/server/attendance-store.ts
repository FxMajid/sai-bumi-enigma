import "server-only";

// Global in-memory storage to synchronize attendance across requests
const globalAttendanceStore = globalThis as unknown as {
  __sai_bumi_attendance_records?: Record<string, string>;
};

if (!globalAttendanceStore.__sai_bumi_attendance_records) {
  globalAttendanceStore.__sai_bumi_attendance_records = {};
}

export function getServerAttendanceRecords(): Record<string, string> {
  return { ...(globalAttendanceStore.__sai_bumi_attendance_records || {}) };
}

export function recordServerAttendance(nik: string, timestamp?: string): Record<string, string> {
  const current = globalAttendanceStore.__sai_bumi_attendance_records || {};
  const isoStr = timestamp || new Date().toISOString();
  current[nik] = current[nik] || isoStr;
  globalAttendanceStore.__sai_bumi_attendance_records = current;
  return { ...current };
}

export function deleteServerAttendance(nik: string): Record<string, string> {
  const current = globalAttendanceStore.__sai_bumi_attendance_records || {};
  delete current[nik];
  globalAttendanceStore.__sai_bumi_attendance_records = current;
  return { ...current };
}

export async function resetAllServerAttendance(): Promise<Record<string, string>> {
  globalAttendanceStore.__sai_bumi_attendance_records = {};

  if (process.env.APP_DATA_MODE !== "demo") {
    try {
      const { createBackendClient } = await import("./supabase");
      const { client } = createBackendClient();
      await client
        .from("attendance_records")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");
    } catch {
      // Graceful fallback if database schema is local
    }
  }

  return {};
}

