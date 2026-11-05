import { z } from "zod";
import { event } from "@/config/event";

export const participantSchema = z.object({
  id: z.uuid(),
  code: z.string().min(1),
  name: z.string().min(1),
});
export type Participant = z.infer<typeof participantSchema>;

export const registrationSchema = z.object({
  groupNumber: z.number().int().min(1, "Pilih nomor kelompok.").max(4, "Nomor kelompok tidak valid."),
  memberCount: z.union([z.literal(8), z.literal(9)]),
  participantIds: z.array(z.uuid("Pilih peserta dari daftar nama.")),
  consent: z.boolean().refine(Boolean, "Konfirmasi bahwa anggota menyetujui publikasi nama dan foto."),
}).strict().superRefine((value, ctx) => {
  if (value.participantIds.length !== value.memberCount) {
    ctx.addIssue({ code: "custom", path: ["participantIds"], message: `Pilih tepat ${value.memberCount} anggota.` });
  }
  if (new Set(value.participantIds).size !== value.participantIds.length) {
    ctx.addIssue({ code: "custom", path: ["participantIds"], message: "Peserta yang sama tidak boleh dipilih dua kali." });
  }
});
export type RegistrationInput = z.infer<typeof registrationSchema>;

export const registeredGroupSchema = z.object({
  id: z.uuid(),
  groupNumber: z.number().int().min(1).max(4),
  members: z.array(participantSchema).min(8).max(9),
  photoUrl: z.string().min(1),
  registeredAt: z.iso.datetime({ offset: true }),
});
export type RegisteredGroup = z.infer<typeof registeredGroupSchema>;

export type MemberQuotaInfo = { registered: number; max: number; available: boolean };

export function getMemberCountQuota(groups: Pick<RegisteredGroup, "members">[]): Record<8 | 9, MemberQuotaInfo> {
  const registered8 = groups.filter((g) => g.members.length === 8).length;
  const registered9 = groups.filter((g) => g.members.length === 9).length;
  return {
    8: { registered: registered8, max: event.memberQuotas[8], available: registered8 < event.memberQuotas[8] },
    9: { registered: registered9, max: event.memberQuotas[9], available: registered9 < event.memberQuotas[9] },
  };
}

export const registrationSnapshotSchema = z.object({
  registrationOpen: z.boolean(),
  participants: z.array(participantSchema),
  availableParticipants: z.array(participantSchema),
  groups: z.array(registeredGroupSchema).max(4),
  statistics: z.object({ total: z.number().int().nonnegative(), registered: z.number().int().nonnegative(), unregistered: z.number().int().nonnegative() }),
}).superRefine((value, ctx) => {
  const participantIds = new Set(value.participants.map((p) => p.id));
  const assigned = value.groups.flatMap((g) => g.members.map((p) => p.id));
  const assignedIds = new Set(assigned);
  const availableIds = new Set(value.availableParticipants.map((p) => p.id));
  const count8 = value.groups.filter((g) => g.members.length === 8).length;
  const count9 = value.groups.filter((g) => g.members.length === 9).length;

  if (count8 > event.memberQuotas[8] || count9 > event.memberQuotas[9]) {
    ctx.addIssue({ code: "custom", message: "Komposisi kelompok melebihi batas kuota (maksimal 3 kelompok 9 orang dan 1 kelompok 8 orang)." });
  }

  if (participantIds.size !== value.participants.length || assignedIds.size !== assigned.length
    || assigned.some((id) => !participantIds.has(id)) || availableIds.size !== value.availableParticipants.length
    || value.availableParticipants.some((p) => !participantIds.has(p.id) || assignedIds.has(p.id))
    || availableIds.size + assignedIds.size !== participantIds.size
    || value.statistics.total !== participantIds.size || value.statistics.registered !== assignedIds.size
    || value.statistics.unregistered !== availableIds.size
    || new Set(value.groups.map((g) => g.groupNumber)).size !== value.groups.length) {
    ctx.addIssue({ code: "custom", message: "Snapshot peserta tidak konsisten." });
  }
});
export type RegistrationSnapshot = z.infer<typeof registrationSnapshotSchema>;

/** Live adapter must construct this from a consistent database snapshot. */
export function createSnapshot(participants: Participant[], groups: RegisteredGroup[], registrationOpen = true): RegistrationSnapshot {
  const assigned = new Set(groups.flatMap((group) => group.members.map((member) => member.id)));
  const registered = participants.filter((participant) => assigned.has(participant.id)).length;
  return { participants, groups, registrationOpen, availableParticipants: participants.filter((p) => !assigned.has(p.id)), statistics: {
    total: participants.length, registered, unregistered: participants.length - registered,
  } };
}

export function validatePhoto(file: Pick<File, "size" | "type"> | null): string | null {
  if (!file) return "Tambahkan satu foto lengkap tim sebelum mengirim.";
  if (!event.photo.types.some((type) => type === file.type)) return "Gunakan foto berformat JPG atau PNG.";
  if (file.size === 0) return "File foto kosong. Pilih foto lain.";
  if (file.size > event.photo.maxBytes) return "Ukuran foto maksimal 3 MiB.";
  return null;
}
