import "server-only";
import { getGroupTitle } from "@/config/event";
import type { QuizQuestion, QuizSubmissionRecord } from "@/domain/quiz";
import type { Participant } from "@/domain/registration";
import { createBackendClient } from "./supabase";
import {
  getLocalQuizSubmissions,
  getQuizStatus,
  recordLocalQuizSubmission,
  setQuizStatus,
  type QuizSystemStatus,
} from "./quiz-store";

export interface SubmitQuizPayload {
  participant: Participant;
  groupNumber: number;
  questions: QuizQuestion[];
  answers: Record<string, string>;
  timeSpentSeconds: number;
}

export function verifyAdminPassword(password: string): boolean {
  const secret = process.env.ADMIN_PASSWORD || "adminenigma2026";
  return password === secret;
}

export async function getQuizSystemStatus(): Promise<QuizSystemStatus> {
  return getQuizStatus();
}

export async function setQuizSystemStatus(isOpen: boolean): Promise<QuizSystemStatus> {
  return setQuizStatus(isOpen);
}

export async function submitQuizSubmission(payload: SubmitQuizPayload): Promise<QuizSubmissionRecord> {
  const { participant, groupNumber, questions, answers, timeSpentSeconds } = payload;

  let correctCount = 0;
  questions.forEach((q) => {
    if (answers[q.id] === q.correctOptionId) {
      correctCount += 1;
    }
  });

  const totalQuestions = questions.length;
  const score = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
  const completedAt = new Date().toISOString();

  const record: QuizSubmissionRecord = {
    id: crypto.randomUUID(),
    participantId: participant.id,
    participantCode: participant.code,
    participantName: participant.name,
    groupNumber,
    groupName: getGroupTitle(groupNumber),
    score,
    totalQuestions,
    correctCount,
    wrongCount: totalQuestions - correctCount,
    timeSpentSeconds,
    completedAt,
  };

  // Always keep in local server store for instant availability
  recordLocalQuizSubmission(record);

  // If Supabase backend is configured and not in demo mode, attempt to store to database
  if (process.env.APP_DATA_MODE !== "demo") {
    try {
      const { client, config } = createBackendClient();
      await client.rpc("submit_quiz_submission", {
        p_event_slug: config.eventSlug,
        p_participant_id: participant.id,
        p_group_number: groupNumber,
        p_score: score,
        p_total_questions: totalQuestions,
        p_correct_count: correctCount,
        p_wrong_count: totalQuestions - correctCount,
        p_time_spent_seconds: timeSpentSeconds,
        p_answers: answers,
      });
    } catch {
      // Graceful fallback to local store if Supabase table or migration is pending
    }
  }

  return record;
}

export async function getQuizSubmissionsList(): Promise<QuizSubmissionRecord[]> {
  // If in demo mode, return local store directly
  if (process.env.APP_DATA_MODE === "demo") {
    return getLocalQuizSubmissions();
  }

  try {
    const { client, config } = createBackendClient();
    const { data, error } = await client.rpc("get_quiz_submissions_list", {
      p_event_slug: config.eventSlug,
    });

    if (error || !data) {
      return getLocalQuizSubmissions();
    }

    const dbSubmissions = data as Array<{
      id: string;
      participantId: string;
      participantCode: string;
      participantName: string;
      groupNumber: number;
      score: number;
      totalQuestions: number;
      correctCount: number;
      wrongCount: number;
      timeSpentSeconds: number;
      completedAt: string;
    }>;

    // Merge with any in-memory submissions
    const local = getLocalQuizSubmissions();
    const map = new Map<string, QuizSubmissionRecord>();

    local.forEach((s) => map.set(s.participantId, s));
    dbSubmissions.forEach((s) => {
      map.set(s.participantId, {
        ...s,
        groupName: getGroupTitle(s.groupNumber),
      });
    });

    return Array.from(map.values()).sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.timeSpentSeconds !== b.timeSpentSeconds) return a.timeSpentSeconds - b.timeSpentSeconds;
      return new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime();
    });
  } catch {
    return getLocalQuizSubmissions();
  }
}

