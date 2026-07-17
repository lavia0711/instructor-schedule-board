import assert from "node:assert/strict";
import test from "node:test";

import { cascadeCancelledLectureAssistants } from "../lib/schedule-cancellation.ts";

function schedule(overrides = {}) {
  return {
    id: "schedule-1",
    date: "2026-07-17",
    instructor: "문건우 강사",
    kind: "lecture",
    status: "confirmed",
    assistantRequired: true,
    arrivalMinutes: 30,
    source: "manual",
    modifiedAt: "2026-07-17T00:00:00.000Z",
    ...overrides,
  };
}

test("a cancelled lecture cancels every linked assistant", () => {
  const lecture = schedule({ id: "lecture-1", status: "cancelled" });
  const firstAssistant = schedule({
    id: "assistant-1",
    kind: "assistant",
    instructor: "아이온 강사",
    parentScheduleId: lecture.id,
    assistantRequired: false,
  });
  const secondAssistant = schedule({
    id: "assistant-2",
    kind: "assistant",
    instructor: "다른 강사",
    parentScheduleId: lecture.id,
    assistantRequired: false,
  });

  const result = cascadeCancelledLectureAssistants(
    [lecture, firstAssistant, secondAssistant],
    "2026-07-17T01:00:00.000Z",
  );

  assert.equal(result[1].status, "cancelled");
  assert.equal(result[2].status, "cancelled");
  assert.equal(result[1].modifiedAt, "2026-07-17T01:00:00.000Z");
});

test("same-date and unrelated assistants are left unchanged", () => {
  const cancelledLecture = schedule({ id: "lecture-cancelled", status: "cancelled" });
  const activeLecture = schedule({ id: "lecture-active" });
  const unrelatedAssistant = schedule({
    id: "assistant-unrelated",
    kind: "assistant",
    parentScheduleId: activeLecture.id,
    assistantRequired: false,
  });

  const result = cascadeCancelledLectureAssistants([
    cancelledLecture,
    activeLecture,
    unrelatedAssistant,
  ]);

  assert.equal(result[2].status, "confirmed");
  assert.strictEqual(result[2], unrelatedAssistant);
});

test("the rule is one-way and idempotent", () => {
  const restoredLecture = schedule({ id: "lecture-restored", status: "confirmed" });
  const cancelledAssistant = schedule({
    id: "assistant-cancelled",
    kind: "assistant",
    status: "cancelled",
    parentScheduleId: restoredLecture.id,
    assistantRequired: false,
  });

  const result = cascadeCancelledLectureAssistants([
    restoredLecture,
    cancelledAssistant,
  ]);

  assert.equal(result[1].status, "cancelled");
  assert.strictEqual(result[1], cancelledAssistant);
});
