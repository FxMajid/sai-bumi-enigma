export const officialGroups = [
  { number: 1, name: "Lupin", title: "Kelompok 1: Lupin" },
  { number: 2, name: "Detectif Jubun", title: "Kelompok 2: Detectif Jubun" },
  { number: 3, name: "Conan", title: "Kelompok 3: Conan" },
  { number: 4, name: "Holmes", title: "Kelompok 4: Holmes" },
] as const;

export function getGroupName(groupNumber: number): string {
  const found = officialGroups.find((g) => g.number === groupNumber);
  return found ? found.name : `Kelompok ${groupNumber}`;
}

export function getGroupTitle(groupNumber: number): string {
  const found = officialGroups.find((g) => g.number === groupNumber);
  return found ? found.title : `Kelompok ${groupNumber}`;
}

export const event = {
  name: "THE SAI BUMI ENIGMA",
  subtitle: "Setiap petunjuk membuka peluang. Setiap anggota membawa kekuatan. Bentuk tim investigasimu dan bersiap untuk menjalankan misi.",
  schedule: [
    { label: "Pra-Raker", display: "24–25 November 2026", start: "2026-11-24", end: "2026-11-25" },
    { label: "Raker", display: "27 November 2026", start: "2026-11-27", end: "2026-11-27" },
  ],
  groupNumbers: [1, 2, 3, 4],
  memberCounts: [8, 9],
  memberQuotas: {
    8: 1,
    9: 3,
  },
  timezone: "Asia/Jakarta",
  photo: { maxBytes: 3 * 1024 * 1024, types: ["image/jpeg", "image/png"] },
} as const;

export function formatRegistrationTime(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "long", timeStyle: "short", timeZone: event.timezone,
  }).format(new Date(value)) + " WIB";
}
