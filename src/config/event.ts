export const event = {
  name: "THE SAI BUMI ENIGMA",
  subtitle: "Setiap petunjuk membuka peluang. Setiap anggota membawa kekuatan. Bentuk tim investigasimu dan bersiap untuk menjalankan misi.",
  schedule: [
    { label: "Pra-Raker", display: "24–25 November 2026", start: "2026-11-24", end: "2026-11-25" },
    { label: "Raker", display: "27 November 2026", start: "2026-11-27", end: "2026-11-27" },
  ],
  groupNumbers: [1, 2, 3, 4],
  memberCounts: [8, 9],
  timezone: "Asia/Jakarta",
  photo: { maxBytes: 3 * 1024 * 1024, types: ["image/jpeg", "image/png"] },
} as const;

export function formatRegistrationTime(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "long", timeStyle: "short", timeZone: event.timezone,
  }).format(new Date(value)) + " WIB";
}
