import "server-only";
import type { QuizQuestion, QuizSubmissionRecord } from "@/domain/quiz";
import type { Participant } from "@/domain/registration";

export interface ActiveQuizServerSession {
  sessionId: string;
  participant: Participant;
  groupNumber: number;
  questions: QuizQuestion[];
  startedAt: number;
  deadlineAt: number;
}

export interface QuizSystemStatus {
  isOpen: boolean;
  updatedAt: string;
}

// Global in-memory storage to survive across API requests in server runtime
const globalStore = globalThis as unknown as {
  __sai_bumi_quiz_sessions?: Map<string, ActiveQuizServerSession>;
  __sai_bumi_quiz_submissions?: QuizSubmissionRecord[];
  __sai_bumi_quiz_status?: QuizSystemStatus;
};

if (!globalStore.__sai_bumi_quiz_sessions) {
  globalStore.__sai_bumi_quiz_sessions = new Map();
}

if (!globalStore.__sai_bumi_quiz_status) {
  // Quiz is closed by default, opened by admin
  globalStore.__sai_bumi_quiz_status = {
    isOpen: false,
    updatedAt: new Date().toISOString(),
  };
}

if (!globalStore.__sai_bumi_quiz_submissions) {
  // Initial empty quiz submissions list (clean database without fake demo records)
  globalStore.__sai_bumi_quiz_submissions = [];
}

export function saveServerQuizSession(session: ActiveQuizServerSession) {
  globalStore.__sai_bumi_quiz_sessions!.set(session.sessionId, session);
}

export function getServerQuizSession(sessionId: string): ActiveQuizServerSession | undefined {
  return globalStore.__sai_bumi_quiz_sessions!.get(sessionId);
}

export function removeServerQuizSession(sessionId: string) {
  globalStore.__sai_bumi_quiz_sessions!.delete(sessionId);
}

export function recordLocalQuizSubmission(record: QuizSubmissionRecord) {
  const existing = globalStore.__sai_bumi_quiz_submissions!.findIndex(
    (s) => s.participantId === record.participantId
  );
  if (existing !== -1) {
    globalStore.__sai_bumi_quiz_submissions![existing] = record;
  } else {
    globalStore.__sai_bumi_quiz_submissions!.unshift(record);
  }
}

export function getLocalQuizSubmissions(): QuizSubmissionRecord[] {
  return [...(globalStore.__sai_bumi_quiz_submissions || [])];
}

export function deleteLocalQuizSubmission(submissionIdOrParticipantId: string): QuizSubmissionRecord[] {
  if (!globalStore.__sai_bumi_quiz_submissions) {
    globalStore.__sai_bumi_quiz_submissions = [];
    return [];
  }
  globalStore.__sai_bumi_quiz_submissions = globalStore.__sai_bumi_quiz_submissions.filter(
    (s) => s.id !== submissionIdOrParticipantId && s.participantId !== submissionIdOrParticipantId
  );
  return [...globalStore.__sai_bumi_quiz_submissions];
}

export function resetAllLocalQuizSubmissions(): QuizSubmissionRecord[] {
  globalStore.__sai_bumi_quiz_submissions = [];
  return [];
}

export function getQuizStatus(): QuizSystemStatus {
  if (!globalStore.__sai_bumi_quiz_status) {
    globalStore.__sai_bumi_quiz_status = {
      isOpen: false,
      updatedAt: new Date().toISOString(),
    };
  }
  return { ...globalStore.__sai_bumi_quiz_status };
}

export function setQuizStatus(isOpen: boolean): QuizSystemStatus {
  const updated: QuizSystemStatus = {
    isOpen,
    updatedAt: new Date().toISOString(),
  };
  globalStore.__sai_bumi_quiz_status = updated;
  return updated;
}

