"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getGroupName, getGroupTitle } from "@/config/event";
import type { DataConfiguration } from "@/config/runtime";
import {
  detectParticipantGroup,
  generateRandomQuiz,
  QUIZ_DURATION_SECONDS,
  type QuizParticipantInfo,
  type QuizQuestion,
  type QuizResult,
} from "@/domain/quiz";
import { createRegistrationRepository } from "@/repositories";
import type { Participant, RegistrationSnapshot } from "@/domain/registration";
import { Icon } from "./icon";

const QUIZ_STORAGE_KEY = "sai_bumi_enigma_quiz_active_session";
const COMPLETED_PARTICIPANTS_KEY = "sai_bumi_enigma_quiz_completed_participants";

interface PersistedQuizSession {
  version: 1;
  participant: Participant;
  groupNumber: number;
  groupName: string;
  questions: QuizQuestion[];
  currentIndex: number;
  answers: Record<string, string>;
  deadlineAt: number; // Unix timestamp in ms
}

interface StoredSessionLoad {
  session: PersistedQuizSession | null;
  isExpired: boolean;
  remainingSeconds: number;
}

function getStoredSessionLoad(): StoredSessionLoad {
  if (typeof window === "undefined") {
    return { session: null, isExpired: false, remainingSeconds: QUIZ_DURATION_SECONDS };
  }
  try {
    const raw = localStorage.getItem(QUIZ_STORAGE_KEY);
    if (!raw) return { session: null, isExpired: false, remainingSeconds: QUIZ_DURATION_SECONDS };
    const data = JSON.parse(raw) as PersistedQuizSession;
    if (data && data.version === 1 && Array.isArray(data.questions) && data.questions.length > 0) {
      const remaining = Math.max(0, Math.floor((data.deadlineAt - Date.now()) / 1000));
      return { session: data, isExpired: remaining <= 0, remainingSeconds: remaining };
    }
    return { session: null, isExpired: false, remainingSeconds: QUIZ_DURATION_SECONDS };
  } catch {
    return { session: null, isExpired: false, remainingSeconds: QUIZ_DURATION_SECONDS };
  }
}

function getCompletedParticipantIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(COMPLETED_PARTICIPANTS_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function markParticipantCompleted(participantId: string) {
  if (typeof window === "undefined") return;
  try {
    const current = getCompletedParticipantIds();
    if (!current.includes(participantId)) {
      current.push(participantId);
      localStorage.setItem(COMPLETED_PARTICIPANTS_KEY, JSON.stringify(current));
    }
  } catch {
    // ignore
  }
}

export function QuizApp({ configuration }: { configuration: DataConfiguration }) {
  // Check persisted session once via lazy state initializer
  const [initialLoad] = useState<StoredSessionLoad>(getStoredSessionLoad);
  const initialSession = initialLoad.session;
  const isInitiallyExpired = initialLoad.isExpired;

  // Step state: "identity" | "in_progress" | "result"
  const [stage, setStage] = useState<"identity" | "in_progress" | "result">(() => {
    if (initialSession) {
      return isInitiallyExpired ? "result" : "in_progress";
    }
    return "identity";
  });

  // Participant & repository data
  const [snapshot, setSnapshot] = useState<RegistrationSnapshot | null>(null);
  const [loadingParticipants, setLoadingParticipants] = useState(true);
  const [participantQuery, setParticipantQuery] = useState("");
  const [selectedParticipant, setSelectedParticipant] = useState<Participant | null>(
    () => initialSession?.participant ?? null
  );
  const [selectedGroupNumber, setSelectedGroupNumber] = useState<number | null>(
    () => initialSession?.groupNumber ?? null
  );
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Completed participants tracking
  const [completedIds, setCompletedIds] = useState<string[]>(getCompletedParticipantIds);

  // Quiz active state
  const [questions, setQuestions] = useState<QuizQuestion[]>(
    () => initialSession?.questions ?? []
  );
  const [currentIndex, setCurrentIndex] = useState<number>(
    () => initialSession?.currentIndex ?? 0
  );
  const [answers, setAnswers] = useState<Record<string, string>>(
    () => initialSession?.answers ?? {}
  );
  const [timeLeft, setTimeLeft] = useState<number>(() => initialLoad.remainingSeconds);
  const [isTimeUp, setIsTimeUp] = useState<boolean>(isInitiallyExpired);
  const [sessionRestored, setSessionRestored] = useState<boolean>(
    () => Boolean(initialSession && !isInitiallyExpired)
  );
  const [isWindowBlurred, setIsWindowBlurred] = useState(false);
  const [isDevToolsOpen, setIsDevToolsOpen] = useState(false);
  const [isQuizOpen, setIsQuizOpen] = useState(false);
  const [checkingQuizStatus, setCheckingQuizStatus] = useState(true);

  const [quizResult, setQuizResult] = useState<QuizResult | null>(() => {
    if (initialSession && isInitiallyExpired) {
      let correct = 0;
      initialSession.questions.forEach((q) => {
        if (initialSession.answers[q.id] === q.correctOptionId) {
          correct += 1;
        }
      });
      const total = initialSession.questions.length;
      return {
        participant: {
          participantId: initialSession.participant.id,
          participantName: initialSession.participant.name,
          participantCode: initialSession.participant.code,
          groupNumber: initialSession.groupNumber,
          groupName: getGroupTitle(initialSession.groupNumber),
        },
        score: total > 0 ? Math.round((correct / total) * 100) : 0,
        totalQuestions: total,
        correctCount: correct,
        wrongCount: total - correct,
        timeSpentSeconds: QUIZ_DURATION_SECONDS,
        answers: initialSession.answers,
        completedAt: new Date(initialSession.deadlineAt).toISOString(),
        questions: initialSession.questions,
      };
    }
    return null;
  });

  // If expired session was restored as result, clean storage and mark completed
  useEffect(() => {
    if (initialSession && isInitiallyExpired && typeof window !== "undefined") {
      try {
        localStorage.removeItem(QUIZ_STORAGE_KEY);
        markParticipantCompleted(initialSession.participant.id);
        void fetch("/api/quiz/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            participant: initialSession.participant,
            groupNumber: initialSession.groupNumber,
            questions: initialSession.questions,
            answers: initialSession.answers,
            timeSpentSeconds: QUIZ_DURATION_SECONDS,
          }),
        }).catch(() => {});
      } catch {
        // ignore
      }
    }
  }, [initialSession, isInitiallyExpired]);

  // Fetch participants list from registration snapshot
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const repo = await createRegistrationRepository(configuration);
        const data = await repo.getSnapshot();
        if (active) {
          setSnapshot(data);
          setLoadingParticipants(false);
        }
      } catch {
        if (active) setLoadingParticipants(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [configuration]);

  // Check and poll quiz open/close status while in identity stage
  useEffect(() => {
    if (stage !== "identity") return;

    let active = true;
    async function checkStatus() {
      try {
        const res = await fetch("/api/quiz/status");
        if (res.ok && active) {
          const data = await res.json();
          setIsQuizOpen(Boolean(data.isOpen));
          setCheckingQuizStatus(false);
        }
      } catch {
        if (active) setCheckingQuizStatus(false);
      }
    }

    void checkStatus();
    const interval = setInterval(checkStatus, 3000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [stage]);

  // Handle outside click for participant dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter participants
  const participants = snapshot?.participants ?? [];
  const filteredParticipants = participants.filter((p) =>
    `${p.name} ${p.code}`.toLowerCase().includes(participantQuery.toLowerCase())
  );

  // Core submission handler
  const finishQuiz = useCallback(
    (autoSubmitted = false) => {
      if (!selectedParticipant || selectedGroupNumber === null) return;

      const groupTitle = getGroupTitle(selectedGroupNumber);
      const participantInfo: QuizParticipantInfo = {
        participantId: selectedParticipant.id,
        participantName: selectedParticipant.name,
        participantCode: selectedParticipant.code,
        groupNumber: selectedGroupNumber,
        groupName: groupTitle,
      };

      let correctCount = 0;
      questions.forEach((q) => {
        if (answers[q.id] === q.correctOptionId) {
          correctCount += 1;
        }
      });

      const totalQuestions = questions.length;
      const score = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
      const timeSpentSeconds = QUIZ_DURATION_SECONDS - timeLeft;

      setQuizResult({
        participant: participantInfo,
        score,
        totalQuestions,
        correctCount,
        wrongCount: totalQuestions - correctCount,
        timeSpentSeconds: Math.max(0, timeSpentSeconds),
        answers,
        completedAt: new Date().toISOString(),
        questions,
      });

      if (autoSubmitted) {
        setIsTimeUp(true);
      }

      // Mark participant as permanently completed so they cannot retake
      markParticipantCompleted(selectedParticipant.id);
      setCompletedIds(getCompletedParticipantIds());

      // Clear persisted active session
      if (typeof window !== "undefined") {
        try {
          localStorage.removeItem(QUIZ_STORAGE_KEY);
        } catch {
          // ignore
        }
      }

      // Submit result to database / server API in background
      try {
        void fetch("/api/quiz/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            participant: selectedParticipant,
            groupNumber: selectedGroupNumber,
            questions,
            answers,
            timeSpentSeconds: Math.max(0, timeSpentSeconds),
          }),
        }).catch((err) => {
          console.error("Gagal menyimpan hasil kuis ke server:", err);
        });
      } catch {
        // ignore
      }

      setStage("result");
    },
    [selectedParticipant, selectedGroupNumber, questions, answers, timeLeft]
  );

  // Countdown timer effect during quiz
  useEffect(() => {
    if (stage !== "in_progress") return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          finishQuiz(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [stage, finishQuiz]);

  // Anti-Inspect, DevTools Detection & Anti-Screenshot protection
  useEffect(() => {
    if (stage !== "in_progress") return;

    // DevTools detection via window size delta threshold
    function detectDevTools() {
      const threshold = 160;
      const widthThreshold = window.outerWidth - window.innerWidth > threshold;
      const heightThreshold = window.outerHeight - window.innerHeight > threshold;
      if (widthThreshold || heightThreshold) {
        setIsDevToolsOpen(true);
      } else {
        setIsDevToolsOpen(false);
      }
    }

    // Keyboard shortcut interception for Inspect, View Source, Save, Print
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "F12" || e.keyCode === 123) {
        e.preventDefault();
        e.stopPropagation();
        setIsDevToolsOpen(true);
        return false;
      }

      const isCtrlOrMeta = e.ctrlKey || e.metaKey;
      if (isCtrlOrMeta) {
        const key = e.key.toLowerCase();
        // Ctrl+Shift+I / J / C (DevTools inspector)
        if (e.shiftKey && ["i", "j", "c"].includes(key)) {
          e.preventDefault();
          e.stopPropagation();
          setIsDevToolsOpen(true);
          return false;
        }
        // Ctrl+U (view source), Ctrl+S (save page), Ctrl+P (print), Ctrl+C (copy)
        if (["u", "s", "p", "c"].includes(key)) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
      }
    }

    function handleContextMenu(e: MouseEvent) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }

    function handleBlur() {
      setIsWindowBlurred(true);
    }

    function handleFocus() {
      setIsWindowBlurred(false);
    }

    function handleKeyUp(e: KeyboardEvent) {
      if (e.key === "PrintScreen" || e.keyCode === 44) {
        if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText("").catch(() => {});
        }
        setIsWindowBlurred(true);
      }
    }

    window.addEventListener("resize", detectDevTools);
    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("contextmenu", handleContextMenu, true);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("keyup", handleKeyUp);

    // Initial check
    detectDevTools();
    const interval = setInterval(detectDevTools, 1500);

    return () => {
      window.removeEventListener("resize", detectDevTools);
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("contextmenu", handleContextMenu, true);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("keyup", handleKeyUp);
      clearInterval(interval);
    };
  }, [stage]);

  // Auto-detect group whenever participant changes
  const handleSelectParticipant = (participant: Participant) => {
    setSelectedParticipant(participant);
    setParticipantQuery(participant.name);
    setDropdownOpen(false);

    // Auto-detect group
    const detectedGroupNumber = detectParticipantGroup(
      participant,
      snapshot?.groups ?? [],
      snapshot?.participants ?? []
    );
    setSelectedGroupNumber(detectedGroupNumber);
  };

  // Start Quiz handler
  const handleStartQuiz = () => {
    if (!isQuizOpen) return;
    if (!selectedParticipant || selectedGroupNumber === null) return;
    if (completedIds.includes(selectedParticipant.id)) return;

    const randomQuestions = generateRandomQuiz(10);
    const deadlineAt = Date.now() + QUIZ_DURATION_SECONDS * 1000;

    setQuestions(randomQuestions);
    setCurrentIndex(0);
    setAnswers({});
    setTimeLeft(QUIZ_DURATION_SECONDS);
    setIsTimeUp(false);
    setSessionRestored(false);

    // Persist to localStorage
    if (typeof window !== "undefined") {
      try {
        const session: PersistedQuizSession = {
          version: 1,
          participant: selectedParticipant,
          groupNumber: selectedGroupNumber,
          groupName: getGroupName(selectedGroupNumber),
          questions: randomQuestions,
          currentIndex: 0,
          answers: {},
          deadlineAt,
        };
        localStorage.setItem(QUIZ_STORAGE_KEY, JSON.stringify(session));
      } catch {
        // ignore
      }
    }

    setStage("in_progress");
  };

  // Option selection handler for current question
  const handleSelectOption = (questionId: string, optionId: string) => {
    setAnswers((prev) => {
      const updated = {
        ...prev,
        [questionId]: optionId,
      };

      // Persist answer change
      if (typeof window !== "undefined" && selectedParticipant && selectedGroupNumber !== null) {
        try {
          const raw = localStorage.getItem(QUIZ_STORAGE_KEY);
          if (raw) {
            const session = JSON.parse(raw) as PersistedQuizSession;
            session.answers = updated;
            localStorage.setItem(QUIZ_STORAGE_KEY, JSON.stringify(session));
          }
        } catch {
          // ignore
        }
      }

      return updated;
    });
  };

  // Progression to Next Question (one-way only, requires current question answered)
  const handleNextQuestion = () => {
    const currentQ = questions[currentIndex];
    if (!currentQ || !answers[currentQ.id]) return;

    const nextIndex = currentIndex + 1;
    setCurrentIndex(nextIndex);

    // Persist question index update
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem(QUIZ_STORAGE_KEY);
        if (raw) {
          const session = JSON.parse(raw) as PersistedQuizSession;
          session.currentIndex = nextIndex;
          localStorage.setItem(QUIZ_STORAGE_KEY, JSON.stringify(session));
        }
      } catch {
        // ignore
      }
    }
  };

  // Anti-Copy keyboard blocking (silent, without visual text)
  const handleKeyDownProtection = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && ["c", "C", "x", "X", "u", "U", "s", "S"].includes(e.key)) {
      e.preventDefault();
    }
  };

  // Format seconds to MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  // Check if selected participant already finished quiz
  const isParticipantAlreadyCompleted = Boolean(
    selectedParticipant && completedIds.includes(selectedParticipant.id)
  );

  // =========================================================================
  // RENDER: STEP 1 - IDENTITY FORM (AUTO-DETECTED GROUP FROM ROSTER)
  // =========================================================================
  if (stage === "identity") {
    const detectedGroupName = selectedGroupNumber ? getGroupName(selectedGroupNumber) : null;

    return (
      <section className="quiz-panel panel" aria-labelledby="quiz-setup-heading">
        <div className="section-kicker">
          <Icon name="compass" />
          <span>MISI INVESTIGASI THE SAI BUMI ENIGMA</span>
        </div>
        <h2 id="quiz-setup-heading" className="quiz-title">
          Uji Ketajaman Detektif Anda
        </h2>
        <p className="quiz-desc">
          Tantangan investigasi <strong>5 menit</strong> untuk menguji logika, deduksi, dan wawasan Enigma Sai Bumi.
          Kelompok terdeteksi otomatis saat memilih nama peserta. Soal diselesaikan secara berurutan satu per satu.
        </p>

        <div className="quiz-rules-banner">
          <div className="rule-item">
            <span className="rule-icon">
              <Icon name="clock" size={22} />
            </span>
            <div>
              <strong>Durasi 5 Menit</strong>
              <p>Jika browser ditutup atau halaman keluar, kuis tetap tersimpan dan melanjutkan waktu yang tersisa.</p>
            </div>
          </div>
          <div className="rule-item">
            <span className="rule-icon">
              <Icon name="lock" size={22} />
            </span>
            <div>
              <strong>Pengerjaan Bertahap</strong>
              <p>Soal tampil satu per satu. Soal berikutnya baru terbuka setelah soal saat ini dijawab.</p>
            </div>
          </div>
          <div className="rule-item">
            <span className="rule-icon">
              <Icon name="shield" size={22} />
            </span>
            <div>
              <strong>Satu Kali Pengisian</strong>
              <p>Setiap peserta yang telah mengumpulkan jawaban tidak dapat mengisi kuis kembali.</p>
            </div>
          </div>
        </div>

        <form
          className="quiz-form"
          onSubmit={(e) => {
            e.preventDefault();
            handleStartQuiz();
          }}
        >
          {/* IDENTITAS: PILIH NAMA PESERTA */}
          <div className="form-field-group">
            <label className="field-label" htmlFor="participant-input">
              Nama Peserta <span className="required-star">*</span>
              <span className="field-subtitle">Pilih nama peserta dari daftar</span>
            </label>

            <div className="dropdown-container" ref={dropdownRef}>
              <div className="search-input-wrapper">
                <input
                  id="participant-input"
                  type="text"
                  className="quiz-input"
                  placeholder={loadingParticipants ? "Memuat nama peserta..." : "Pilih nama peserta dari daftar..."}
                  value={selectedParticipant ? `${selectedParticipant.name} (${selectedParticipant.code})` : participantQuery}
                  onFocus={() => {
                    setDropdownOpen(true);
                    if (selectedParticipant) {
                      setParticipantQuery("");
                      setSelectedParticipant(null);
                      setSelectedGroupNumber(null);
                    }
                  }}
                  onChange={(e) => {
                    setParticipantQuery(e.target.value);
                    setSelectedParticipant(null);
                    setSelectedGroupNumber(null);
                    setDropdownOpen(true);
                  }}
                  autoComplete="off"
                  required
                />
                <span className="search-icon-slot">
                  <Icon name="search" size={18} />
                </span>
              </div>

              {dropdownOpen && (
                <div className="quiz-dropdown-list" role="listbox">
                  {loadingParticipants ? (
                    <div className="dropdown-empty">Memuat daftar nama peserta...</div>
                  ) : filteredParticipants.length === 0 ? (
                    <div className="dropdown-empty">Tidak ada nama peserta yang cocok.</div>
                  ) : (
                    filteredParticipants.map((p) => {
                      const isCompleted = completedIds.includes(p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          className={`dropdown-option ${selectedParticipant?.id === p.id ? "is-selected" : ""} ${
                            isCompleted ? "is-disabled-option" : ""
                          }`}
                          onClick={() => handleSelectParticipant(p)}
                        >
                          <span className="option-name">
                            {p.name} {isCompleted && <small className="completed-tag">(Sudah Selesai)</small>}
                          </span>
                          <span className="option-code">{p.code}</span>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {selectedParticipant && (
              <p className="selected-participant-hint">
                <Icon name="check" size={16} /> Peserta: <strong>{selectedParticipant.name}</strong> ({selectedParticipant.code})
              </p>
            )}

            {/* PERINGATAN JIKA SUDAH PERNAH SUBMIT */}
            {isParticipantAlreadyCompleted && (
              <div className="completed-warning-panel" role="alert">
                <Icon name="info" size={18} />
                <div>
                  <strong>Peserta Telah Menyelesaikan Kuis</strong>
                  <p>
                    Nama peserta <strong>{selectedParticipant?.name}</strong> telah mengumpulkan jawaban sebelumnya dan tidak dapat mengisi kuis kembali.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* KELOMPOK TERDETEKSI SECARA OTOMATIS */}
          <div className="form-field-group">
            <span className="field-label">
              Kelompok Tim Anda
              <span className="field-subtitle">Terdeteksi otomatis saat memilih nama peserta</span>
            </span>

            {selectedParticipant && selectedGroupNumber ? (
              <div className="detected-group-card">
                <div className="detected-badge-top">
                  <span className="detected-chip">
                    <Icon name="check" size={14} /> KELOMPOK RESMI TIM
                  </span>
                  <span className="detected-number-tag">NOMOR {String(selectedGroupNumber).padStart(2, "0")}</span>
                </div>
                <div className="detected-body">
                  <div>
                    <h3 className="detected-team-title">
                      Kelompok {selectedGroupNumber}: <em>{detectedGroupName}</em>
                    </h3>
                    <p className="detected-team-subtitle">
                      Tim Investigasi Resmi · Pra-Raker & Raker 2026
                    </p>
                  </div>
                  <div className="detected-icon-box">
                    <Icon name="compass" size={26} />
                  </div>
                </div>
              </div>
            ) : (
              <div className="detected-group-placeholder">
                <Icon name="people" size={22} />
                <p>Silakan pilih nama peserta di atas untuk melihat kelompok tim.</p>
              </div>
            )}
          </div>

          {/* QUIZ SYSTEM STATUS NOTICES (OPEN vs CLOSED) */}
          {!checkingQuizStatus && (
            isQuizOpen ? (
              <div className="quiz-status-alert alert-open">
                <span className="live-pulse-dot dot-open" />
                <div>
                  <strong>SESI KUIS INVESTIGASI TELAH DIBUKA</strong>
                  <p>Akses kuis aktif. Silakan pilih nama Anda dari daftar peserta dan mulai investigasi.</p>
                </div>
              </div>
            ) : (
              <div className="quiz-status-alert alert-closed" role="alert">
                <Icon name="lock" size={24} />
                <div>
                  <strong>SESI KUIS SAAT INI SEDANG DITUTUP</strong>
                  <p>
                    Akses pengerjaan kuis belum dibuka atau telah dikunci oleh pengawas. Silakan pilih nama Anda terlebih dahulu dan tunggu instruksi pengawas untuk membuka sesi kuis dari sistem. Halaman akan aktif secara otomatis.
                  </p>
                </div>
              </div>
            )
          )}

          {/* BUTTON START */}
          <div className="quiz-start-actions">
            <button
              type="submit"
              className={`btn-start-quiz ${!isQuizOpen ? "is-locked" : ""}`}
              disabled={
                !selectedParticipant ||
                selectedGroupNumber === null ||
                isParticipantAlreadyCompleted ||
                !isQuizOpen
              }
            >
              <span>
                {isParticipantAlreadyCompleted
                  ? "Kuis Sudah Pernah Dikerjakan"
                  : !isQuizOpen
                  ? "Menunggu Kuis Dibuka oleh Pengawas..."
                  : "Mulai Quiz Investigasi (5 Menit)"}
              </span>
              <Icon name={!isQuizOpen ? "lock" : "arrow"} size={20} />
            </button>
            <p className="start-disclaimer">
              Setelah dimulai, kuis akan berjalan selama 5 menit. Jika browser tertutup, Anda dapat kembali dan melanjutkan kuis secara otomatis.
            </p>
          </div>
        </form>
      </section>
    );
  }

  // =========================================================================
  // RENDER: STEP 2 - QUIZ IN PROGRESS (ONE QUESTION AT A TIME, STRICT ONE-WAY)
  // =========================================================================
  if (stage === "in_progress") {
    const currentQ = questions[currentIndex];
    if (!currentQ) return null;

    const currentAnswer = answers[currentQ.id];
    const isAnswered = Boolean(currentAnswer);
    const answeredCount = Object.keys(answers).length;
    const isLastQuestion = currentIndex === questions.length - 1;
    const allQuestionsAnswered = questions.length > 0 && answeredCount === questions.length;
    const isWarningTime = timeLeft <= 60; // < 1 minute left

    return (
      <section
        className="quiz-playing-panel panel quiz-no-copy"
        aria-labelledby="question-header"
        onKeyDown={handleKeyDownProtection}
        onCopy={(e) => e.preventDefault()}
        onCut={(e) => e.preventDefault()}
        onContextMenu={(e) => e.preventDefault()}
        onDragStart={(e) => e.preventDefault()}
        tabIndex={0}
      >
        {/* DEVTOOLS & INSPECTION SHIELD OVERLAY */}
        {isDevToolsOpen && (
          <div className="anti-inspect-shield-overlay" role="dialog" aria-modal="true">
            <div className="shield-modal shield-warning">
              <span className="shield-icon-badge warning-badge">
                <Icon name="shield" size={40} />
              </span>
              <h3>Inspeksi Elemen / DevTools Terdeteksi</h3>
              <p>
                Sistem mendeteksi aktivitas Developer Tools / Inspeksi Halaman.
                Untuk menjaga kejujuran kuis, silakan tutup DevTools atau jendela inspeksi untuk dapat melanjutkan kuis investigasi.
              </p>
              <button
                type="button"
                className="btn-primary-link btn-resume-shield"
                onClick={() => {
                  const widthThreshold = window.outerWidth - window.innerWidth > 160;
                  const heightThreshold = window.outerHeight - window.innerHeight > 160;
                  if (!widthThreshold && !heightThreshold) {
                    setIsDevToolsOpen(false);
                  }
                }}
              >
                <span>Sudah Tutup DevTools (Lanjutkan)</span>
                <Icon name="arrow" size={16} />
              </button>
            </div>
          </div>
        )}

        {/* SCREENSHOT & WINDOW BLUR SHIELD OVERLAY */}
        {isWindowBlurred && !isDevToolsOpen && (
          <div className="screenshot-shield-overlay" role="dialog" aria-modal="true">
            <div className="shield-modal">
              <span className="shield-icon-badge">
                <Icon name="shield" size={40} />
              </span>
              <h3>Layar Kuis Disembunyikan</h3>
              <p>Jendela kuis tidak aktif atau sedang membuka aplikasi lain. Klik tombol di bawah untuk melanjutkan kuis.</p>
              <button
                type="button"
                className="btn-primary-link btn-resume-shield"
                onClick={() => setIsWindowBlurred(false)}
              >
                <span>Lanjutkan Kuis</span>
                <Icon name="arrow" size={16} />
              </button>
            </div>
          </div>
        )}

        {/* RESUME SESSION NOTIFICATION */}
        {sessionRestored && (
          <div className="quiz-restored-banner">
            <Icon name="refresh" size={16} />
            <span>Sesi kuis dipulihkan. Anda sedang melanjutkan kuis investigasi yang sebelumnya aktif.</span>
          </div>
        )}

        {/* TOP STATUS BAR: PARTICIPANT INFO & COUNTDOWN TIMER */}
        <div className="quiz-status-header">
          <div className="investigator-tag">
            <span className="tag-avatar">
              <Icon name="compass" size={18} />
            </span>
            <div>
              <strong>{selectedParticipant?.name}</strong>
              <span>{getGroupTitle(selectedGroupNumber ?? 1)}</span>
            </div>
          </div>

          <div className="quiz-header-right">
            <div
              className={`countdown-timer-badge ${isWarningTime ? "is-urgent" : ""}`}
              role="timer"
              aria-live="polite"
            >
              <Icon name="clock" size={20} />
              <div className="timer-text-wrap">
                <span className="timer-label">{isWarningTime ? "WAKTU KRITIS" : "SISA WAKTU"}</span>
                <span className="timer-value">{formatTime(timeLeft)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* PROGRESS INDICATOR & STEP TRACKER (NO JUMPING ALLOWED) */}
        <div className="quiz-progress-bar-wrap">
          <div className="progress-labels">
            <span>
              Soal Aktif: <strong>No. {currentIndex + 1}</strong> dari <strong>{questions.length}</strong>
            </span>
            <span>
              Terjawab: <strong>{answeredCount}</strong> / {questions.length}
            </span>
          </div>
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
            />
          </div>
        </div>

        {/* STEP PROGRESS PALETTE (READONLY INDICATOR, NO JUMPING) */}
        <div className="question-palette-locked" aria-label="Status progres soal">
          {questions.map((q, idx) => {
            const hasAnswer = Boolean(answers[q.id]);
            const isCurrent = idx === currentIndex;
            const isCompleted = idx < currentIndex || hasAnswer;
            const isLocked = idx > currentIndex;

            return (
              <div
                key={q.id}
                className={`palette-step-pill ${isCurrent ? "is-current" : ""} ${
                  isCompleted ? "is-completed" : ""
                } ${isLocked ? "is-locked" : ""}`}
                title={
                  isCurrent
                    ? `Soal ${idx + 1} (Sedang dikerjakan)`
                    : isCompleted
                    ? `Soal ${idx + 1} (Sudah dijawab)`
                    : `Soal ${idx + 1} (Terkunci - jawab soal saat ini terlebih dahulu)`
                }
              >
                {isCompleted && !isCurrent ? (
                  <Icon name="check" size={14} />
                ) : isLocked ? (
                  <Icon name="lock" size={13} />
                ) : (
                  idx + 1
                )}
              </div>
            );
          })}
        </div>

        {/* SINGLE ACTIVE QUESTION CARD (SILENT ANTI-COPY PROTECTED) */}
        <div
          className="question-card quiz-no-copy"
          key={currentQ.id}
          onCopy={(e) => e.preventDefault()}
          onCut={(e) => e.preventDefault()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="question-meta">
            <span className="question-category">{currentQ.category}</span>
            <span className="question-counter-pill">Soal {currentIndex + 1} / {questions.length}</span>
          </div>

          <h3 id="question-header" className="question-prompt quiz-no-copy">
            {currentQ.question}
          </h3>

          {/* OPTIONS LIST */}
          <div className="options-container" role="radiogroup" aria-label="Pilihan Jawaban">
            {currentQ.options.map((opt, optIndex) => {
              const optionLabel = String.fromCharCode(65 + optIndex); // A, B, C, D
              const isSelected = currentAnswer === opt.id;
              return (
                <label
                  key={opt.id}
                  className={`option-card quiz-no-copy ${isSelected ? "is-selected" : ""}`}
                  onCopy={(e) => e.preventDefault()}
                  onContextMenu={(e) => e.preventDefault()}
                >
                  <input
                    type="radio"
                    name={`question_${currentQ.id}`}
                    value={opt.id}
                    checked={isSelected}
                    onChange={() => handleSelectOption(currentQ.id, opt.id)}
                  />
                  <span className="option-letter">{optionLabel}</span>
                  <span className="option-text quiz-no-copy">{opt.text}</span>
                  {isSelected && (
                    <span className="option-check">
                      <Icon name="check" size={18} />
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </div>

        {/* ONE-WAY NAVIGATION ACTION: CANNOT SUBMIT UNLESS ALL QUESTIONS ARE ANSWERED */}
        <div className="quiz-nav-actions-oneway">
          {!isLastQuestion ? (
            !isAnswered ? (
              <p className="answer-required-hint">
                <Icon name="info" size={15} />
                <span>Silakan pilih salah satu jawaban di atas untuk membuka soal berikutnya.</span>
              </p>
            ) : (
              <p className="answer-confirmed-hint">
                <Icon name="check" size={15} />
                <span>Jawaban tersimpan. Klik tombol di bawah untuk melanjutkan ke soal berikutnya.</span>
              </p>
            )
          ) : (
            !allQuestionsAnswered ? (
              <p className="answer-required-hint">
                <Icon name="info" size={15} />
                <span>
                  Anda belum menjawab seluruh soal ({answeredCount} / {questions.length} terjawab). Pastikan seluruh soal telah dijawab untuk dapat mengirim jawaban.
                </span>
              </p>
            ) : (
              <p className="answer-confirmed-hint">
                <Icon name="check" size={15} />
                <span>Seluruh {questions.length} soal telah dijawab lengkap. Klik tombol di bawah untuk mengumpulkan kuis.</span>
              </p>
            )
          )}

          <div className="oneway-action-btn-wrap">
            {!isLastQuestion ? (
              <button
                type="button"
                className="btn-nav btn-next"
                disabled={!isAnswered}
                onClick={handleNextQuestion}
              >
                <span>Lanjut ke Soal Berikutnya</span>
                <Icon name="arrow" size={18} />
              </button>
            ) : (
              <button
                type="button"
                className="btn-nav btn-finish"
                disabled={!allQuestionsAnswered}
                onClick={() => finishQuiz(false)}
              >
                <span>Kumpulkan & Selesaikan Quiz</span>
                <Icon name="check" size={18} />
              </button>
            )}
          </div>
        </div>
      </section>
    );
  }

  // =========================================================================
  // RENDER: STEP 3 - QUIZ RESULT & REVIEW (CANNOT RETAKE QUIZ)
  // =========================================================================
  if (stage === "result" && quizResult) {
    const minutesTaken = Math.floor(quizResult.timeSpentSeconds / 60);
    const secondsTaken = quizResult.timeSpentSeconds % 60;

    return (
      <section className="quiz-result-panel panel" aria-labelledby="result-heading">
        <div className="result-header-card">
          <div className="result-badge-top">
            <span className="result-icon-badge">
              <Icon name="award" size={32} />
            </span>
            <span className="eyebrow">
              {isTimeUp ? "WAKTU 5 MENIT SELESAI" : "INVESTIGASI SELESAI"}
            </span>
          </div>

          <h2 id="result-heading" className="result-title">
            Hasil Investigasi Kuis
          </h2>

          <div className="participant-summary-pill">
            <strong>{quizResult.participant.participantName}</strong> ({quizResult.participant.participantCode})
            {" • "}
            <span className="gold-group">{quizResult.participant.groupName}</span>
          </div>

          {/* SCORE BOARD */}
          <div className="score-board">
            <div className="score-main">
              <span className="score-label">NILAI AKHIR</span>
              <strong className="score-value">{quizResult.score}</strong>
              <span className="score-scale">/ 100</span>
            </div>

            <div className="score-details-grid">
              <div className="detail-stat">
                <span className="stat-label">Jawaban Benar</span>
                <strong className="stat-value text-success">{quizResult.correctCount} Soal</strong>
              </div>
              <div className="detail-stat">
                <span className="stat-label">Jawaban Salah</span>
                <strong className="stat-value text-danger">{quizResult.wrongCount} Soal</strong>
              </div>
              <div className="detail-stat">
                <span className="stat-label">Waktu Pengerjaan</span>
                <strong className="stat-value">
                  {minutesTaken}m {secondsTaken}s
                </strong>
              </div>
              <div className="detail-stat">
                <span className="stat-label">Predikat</span>
                <strong className="stat-value text-gold">
                  {quizResult.score >= 90
                    ? "Detektif Master"
                    : quizResult.score >= 70
                    ? "Investigator Handal"
                    : "Detektif Magang"}
                </strong>
              </div>
            </div>
          </div>
        </div>

        {/* REVIEW & PEMBAHASAN */}
        <div className="review-section">
          <div className="review-heading">
            <Icon name="compass" size={20} />
            <h3>Pembahasan & Kunci Jawaban</h3>
          </div>
          <p className="review-desc">
            Evaluasi jawaban Anda untuk mendalami petunjuk dan teka-teki The Sai Bumi Enigma.
          </p>

          <div className="review-questions-list">
            {quizResult.questions.map((q, idx) => {
              const selectedOptId = quizResult.answers[q.id];
              const isCorrect = selectedOptId === q.correctOptionId;
              const selectedOpt = q.options.find((o) => o.id === selectedOptId);
              const correctOpt = q.options.find((o) => o.id === q.correctOptionId);

              return (
                <div
                  key={q.id}
                  className={`review-question-card ${isCorrect ? "is-correct" : "is-wrong"}`}
                >
                  <div className="review-card-top">
                    <span className="review-question-num">Soal {idx + 1}</span>
                    <span className={`review-status-pill ${isCorrect ? "pill-correct" : "pill-wrong"}`}>
                      {isCorrect ? (
                        <>
                          <Icon name="check" size={14} /> Benar
                        </>
                      ) : (
                        <>
                          <Icon name="close" size={14} /> {selectedOptId ? "Salah" : "Tidak Dijawab"}
                        </>
                      )}
                    </span>
                  </div>

                  <h4 className="review-question-text">{q.question}</h4>

                  <div className="review-answers-box">
                    <div className="answer-row">
                      <span className="answer-row-label">Jawaban Anda:</span>
                      <span className={`answer-row-val ${isCorrect ? "text-success" : "text-danger"}`}>
                        {selectedOpt ? selectedOpt.text : "— Tidak memilih jawaban —"}
                      </span>
                    </div>

                    {!isCorrect && (
                      <div className="answer-row">
                        <span className="answer-row-label">Jawaban Benar:</span>
                        <span className="answer-row-val text-success">
                          {correctOpt ? correctOpt.text : "—"}
                        </span>
                      </div>
                    )}

                    <div className="review-explanation">
                      <strong>Penjelasan:</strong> {q.explanation}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    );
  }

  return null;
}
