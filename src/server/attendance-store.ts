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

export function resetAllServerAttendance(): Record<string, string> {
  globalAttendanceStore.__sai_bumi_attendance_records = {};
  return {};
}

