export const event = {
  name: "THE SAI BUMI ENIGMA",
  subtitle: "Satu tim. Satu langkah. Cerita yang tak terlupakan.",
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
