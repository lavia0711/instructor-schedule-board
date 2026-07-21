import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyImportedScheduleKind,
  matchesLectureKeyword,
  promoteImportedLectureClassifications,
} from "../lib/lecture-classification.ts";
import { parentLectureAvailability } from "../lib/assistant-assignment.ts";

function schedule(overrides) {
  return {
    id: crypto.randomUUID(),
    date: "2026-07-07",
    instructor: "강사",
    kind: "other",
    status: "confirmed",
    assistantRequired: false,
    arrivalMinutes: 0,
    source: "excel",
    modifiedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

test("classification ignores spacing, punctuation, case, and width differences", () => {
  assert.equal(matchesLectureKeyword("Chat-GPT 실무", ["chat gpt"]), true);
  assert.equal(matchesLectureKeyword("Ｇｅｍｉｎｉ 과정", ["gemini"]), true);
  assert.equal(classifyImportedScheduleKind("팀 회의", ["클로드"]), "other");
});

test("existing matching Excel schedules are promoted across every date", () => {
  const july7 = schedule({ id: "july-7", topic: "제미나이 실무" });
  const july9 = schedule({
    id: "july-9",
    date: "2026-07-09",
    topic: "클로드 활용",
  });
  const unrelated = schedule({ id: "meeting", topic: "팀 회의" });
  const manualOther = schedule({
    id: "manual",
    source: "manual",
    topic: "제미나이 관련 회의",
  });

  const result = promoteImportedLectureClassifications(
    [july7, july9, unrelated, manualOther],
    ["제미나이", "클로드"],
    "2026-07-21T00:00:00.000Z",
  );

  assert.deepEqual(
    result.promotedSchedules.map((item) => item.id),
    ["july-7", "july-9"],
  );
  assert.equal(result.schedules[0].kind, "lecture");
  assert.equal(result.schedules[0].assistantRequired, true);
  assert.equal(result.schedules[2].kind, "other");
  assert.equal(result.schedules[3].kind, "other");
  assert.equal(
    parentLectureAvailability("2026-07-07", result.schedules),
    "available",
  );
});

test("existing lectures are never downgraded when a keyword is removed", () => {
  const lecture = schedule({
    id: "lecture",
    kind: "lecture",
    topic: "이전 판별 항목",
    assistantRequired: false,
  });
  const result = promoteImportedLectureClassifications([lecture], ["클로드"]);

  assert.equal(result.schedules[0], lecture);
  assert.deepEqual(result.promotedSchedules, []);
});
