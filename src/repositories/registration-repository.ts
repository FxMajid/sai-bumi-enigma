import type { RegisteredGroup, RegistrationInput, RegistrationSnapshot } from "@/domain/registration";

/** Boundary for the next-stage Supabase adapter; no SDK calls in UI components. */
export interface RegistrationRepository {
  getSnapshot(): Promise<RegistrationSnapshot>;
  stagePhoto(photo: File): Promise<{ expiresAt: string }>;
  register(input: RegistrationInput, photo: File): Promise<RegisteredGroup>;
  dispose(): void;
}

export type RepositoryErrorCode = "CONFLICT" | "VALIDATION" | "UNAVAILABLE" | "IDEMPOTENCY_CONFLICT" | "REGISTRATION_CLOSED" | "UPLOAD_EXPIRED" | "RATE_LIMITED" | "NOT_FOUND" | "FORBIDDEN" | "PAYLOAD_TOO_LARGE";

export class RepositoryError extends Error {
  constructor(public readonly code: RepositoryErrorCode, message: string) {
    super(message);
    this.name = "RepositoryError";
  }
}
