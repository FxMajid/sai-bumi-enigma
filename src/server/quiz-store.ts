import "server-only";
import { getGroupTitle } from "@/config/event";
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
  // Pre-seed realistic demo submissions for demo mode
  globalStore.__sai_bumi_quiz_submissions = [
    {
      id: "sub-demo-001",
      participantId: "00000000-0000-4000-8000-000000000027",
      participantCode: "D-027",
      participantName: "Peserta Demo 27",
      groupNumber: 3,
      groupName: getGroupTitle(3),
      score: 90,
      totalQuestions: 10,
      correctCount: 9,
      wrongCount: 1,
      timeSpentSeconds: 184, // 3m 4s
      completedAt: "2026-11-05T09:12:00.000Z",
    },
    {
      id: "sub-demo-002",
      participantId: "00000000-0000-4000-8000-000000000028",
      participantCode: "D-028",
      participantName: "Peserta Demo 28",
      groupNumber: 4,
      groupName: getGroupTitle(4),
      score: 80,
      totalQuestions: 10,
      correctCount: 8,
      wrongCount: 2,
      timeSpentSeconds: 215, // 3m 35s
      completedAt: "2026-11-05T09:25:00.000Z",
    },
    {
      id: "sub-demo-003",
      participantId: "00000000-0000-4000-8000-000000000010",
      participantCode: "D-010",
      participantName: "Peserta Demo 10",
      groupNumber: 2,
      groupName: getGroupTitle(2),
      score: 100,
      totalQuestions: 10,
      correctCount: 10,
      wrongCount: 0,
      timeSpentSeconds: 142, // 2m 22s
      completedAt: "2026-11-05T10:05:00.000Z",
    },
  ];
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
  return [...globalStore.__sai_bumi_quiz_submissions!];
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

