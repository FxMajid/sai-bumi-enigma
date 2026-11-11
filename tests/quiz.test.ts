import test from "node:test";
import assert from "node:assert/strict";
import { officialGroups, getGroupName, getGroupTitle } from "../src/config/event";
import { generateRandomQuiz, QUIZ_DURATION_SECONDS, detectParticipantGroup } from "../src/domain/quiz";
import { getQuizStatus, setQuizStatus } from "../src/server/quiz-store";

test("official groups contain the exact 4 assigned detective teams", () => {
  assert.equal(officialGroups.length, 4);

  const group1 = officialGroups.find((g) => g.number === 1);
  const group2 = officialGroups.find((g) => g.number === 2);
  const group3 = officialGroups.find((g) => g.number === 3);
  const group4 = officialGroups.find((g) => g.number === 4);

  assert.equal(group1?.name, "Lupin");
  assert.equal(group2?.name, "Detectif Jubun");
  assert.equal(group3?.name, "Conan");
  assert.equal(group4?.name, "Holmes");

  assert.equal(getGroupName(1), "Lupin");
  assert.equal(getGroupName(2), "Detectif Jubun");
  assert.equal(getGroupName(3), "Conan");
  assert.equal(getGroupName(4), "Holmes");

  assert.equal(getGroupTitle(2), "Kelompok 2: Detectif Jubun");
});

test("quiz duration is configured to 5 minutes (300 seconds)", () => {
  assert.equal(QUIZ_DURATION_SECONDS, 300);
});

test("generateRandomQuiz creates randomized questions with valid options and keys", () => {
  const session1 = generateRandomQuiz(10);
  const session2 = generateRandomQuiz(10);

  assert.equal(session1.length, 10);
  assert.equal(session2.length, 10);

  // Each question has valid choices and a correct option matching one of the choices
  session1.forEach((q) => {
    assert.ok(q.question.length > 0);
    assert.equal(q.options.length, 4);
    assert.ok(q.options.some((opt) => opt.id === q.correctOptionId));
    assert.ok(q.explanation.length > 0);
  });

  // Verify that questions are randomized and IDs differ
  const ids1 = session1.map((q) => q.id).join(",");
  const ids2 = session2.map((q) => q.id).join(",");
  assert.notEqual(ids1, ids2);
});



test("detectParticipantGroup accurately matches database registered group or sequence", () => {
  const p1 = { id: "p1", code: "D-001", name: "Peserta 1" };
  const p2 = { id: "p2", code: "D-010", name: "Peserta 10" };
  const p3 = { id: "p3", code: "D-020", name: "Peserta 20" };
  const p4 = { id: "p4", code: "D-030", name: "Peserta 30" };
  const all = [p1, p2, p3, p4];

  // 1. Matched from registered database group
  const registeredGroups = [
    {
      id: "g-uuid-3",
      groupNumber: 3,
      members: [p1],
      photoUrl: "/photo.jpg",
      registeredAt: "2026-11-05T00:00:00Z",
    },
  ];

  assert.equal(detectParticipantGroup(p1, registeredGroups, all), 3);

  // 2. Fallback to sequence when not registered in group
  assert.equal(detectParticipantGroup(p2, [], [p1, p2, p3, p4]), 1); // index 1 < 9 -> 1
});

test("quiz system status is closed by default and toggles correctly", () => {
  // Reset / check initial
  setQuizStatus(false);
  const initial = getQuizStatus();
  assert.equal(initial.isOpen, false);
  assert.ok(initial.updatedAt.length > 0);

  // Admin opens quiz
  const opened = setQuizStatus(true);
  assert.equal(opened.isOpen, true);
  assert.equal(getQuizStatus().isOpen, true);

  // Admin closes quiz
  const closed = setQuizStatus(false);
  assert.equal(closed.isOpen, false);
  assert.equal(getQuizStatus().isOpen, false);
});
