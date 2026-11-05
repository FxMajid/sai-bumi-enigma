import { createSnapshot, getMemberCountQuota, registrationSchema, validatePhoto, type Participant, type RegisteredGroup, type RegistrationInput } from "@/domain/registration";
import { RepositoryError, type RegistrationRepository } from "./registration-repository";

/** Synthetic fixtures, instantiated only in explicitly selected DEMO mode. Total 35 participants (3x9 + 1x8). */
function createParticipants(): Participant[] {
  return Array.from({ length: 35 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    code: `D-${String(index + 1).padStart(3, "0")}`,
    // Deliberate same-name fixture proves that identity uses UUID, never name.
    name: index < 2 ? "Peserta Contoh" : `Peserta Demo ${String(index + 1).padStart(2, "0")}`,
  }));
}

export class DemoRegistrationRepository implements RegistrationRepository {
  private readonly participants = createParticipants();
  private groups: RegisteredGroup[] = [{
    id: "10000000-0000-4000-8000-000000000001",
    groupNumber: 2,
    members: this.participants.slice(26, 35), // 9 members (1 of 3 used, leaving 2 of 9-person and 1 of 8-person)
    photoUrl: "/images/demo-team.svg",
    registeredAt: "2026-11-04T08:30:00.000Z",
  }];
  private readonly objectUrls = new Set<string>();

  async getSnapshot() {
    return structuredClone(createSnapshot(this.participants, this.groups));
  }

  async stagePhoto(photo: File) {
    const error = validatePhoto(photo);
    if (error) throw new RepositoryError("VALIDATION", error);
    return { expiresAt: new Date(Date.now() + 3600000).toISOString() };
  }

  async register(input: RegistrationInput, photo: File) {
    const parsed = registrationSchema.safeParse(input);
    const photoError = validatePhoto(photo);
    if (!parsed.success || photoError) {
      throw new RepositoryError("VALIDATION", photoError ?? parsed.error?.issues[0]?.message ?? "Periksa data kelompok.");
    }
    const quotas = getMemberCountQuota(this.groups);
    if (!quotas[input.memberCount].available) {
      throw new RepositoryError("CONFLICT", `Kuota kelompok dengan ${input.memberCount} anggota sudah terpenuhi (maksimal ${quotas[input.memberCount].max} kelompok).`);
    }
    const assigned = new Set(this.groups.flatMap((group) => group.members.map((member) => member.id)));
    if (this.groups.some((group) => group.groupNumber === input.groupNumber) || input.participantIds.some((id) => assigned.has(id))) {
      throw new RepositoryError("CONFLICT", "Kelompok atau peserta sudah terdaftar. Data telah diperbarui; periksa pilihan Anda.");
    }
    const members = input.participantIds.map((id) => this.participants.find((participant) => participant.id === id));
    if (members.some((member) => !member)) throw new RepositoryError("VALIDATION", "Peserta tidak ditemukan dalam daftar.");
    const photoUrl = URL.createObjectURL(photo);
    this.objectUrls.add(photoUrl);
    const group: RegisteredGroup = {
      id: crypto.randomUUID(), groupNumber: input.groupNumber,
      members: members as Participant[], photoUrl, registeredAt: new Date().toISOString(),
    };
    // No await between conflict check and mutation: single-browser demo operation.
    this.groups.push(group);
    return structuredClone(group);
  }

  dispose() {
    this.objectUrls.forEach((url) => URL.revokeObjectURL(url));
    this.objectUrls.clear();
  }
}
