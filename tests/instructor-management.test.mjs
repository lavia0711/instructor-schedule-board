import assert from "node:assert/strict";
import test from "node:test";

import {
  instructorDeletionImpact,
  removeInstructorSchedules,
  removeScheduleWithLinkedAssistants,
} from "../lib/instructor-management.ts";

function schedule(id, instructor, kind, parentScheduleId) {
  return {
    id,
    date: "2026-08-01",
    instructor,
    kind,
    status: "confirmed",
    parentScheduleId,
    assistantRequired: kind === "lecture",
    arrivalMinutes: 0,
    source: "manual",
    modifiedAt: "2026-07-21T00:00:00.000Z",
  };
}

test("deleting an instructor removes direct schedules and linked assistants", () => {
  const schedules = [
    schedule("lecture-1", "본강사", "lecture"),
    schedule("office-1", "본강사", "office"),
    schedule("assistant-1", "보조강사", "assistant", "lecture-1"),
    schedule("other-1", "다른강사", "lecture"),
  ];

  const impact = instructorDeletionImpact(schedules, "본강사");
  assert.deepEqual(impact, {
    directScheduleCount: 2,
    linkedAssistantCount: 1,
    totalScheduleCount: 3,
    scheduleIds: ["lecture-1", "office-1", "assistant-1"],
  });
  assert.deepEqual(
    removeInstructorSchedules(schedules, "본강사").map((item) => item.id),
    ["other-1"],
  );
});

test("deleting an assistant instructor keeps the parent lecture", () => {
  const schedules = [
    schedule("lecture-1", "본강사", "lecture"),
    schedule("assistant-1", "보조강사", "assistant", "lecture-1"),
  ];

  assert.deepEqual(
    removeInstructorSchedules(schedules, "보조강사").map((item) => item.id),
    ["lecture-1"],
  );
});

test("deleting a main lecture also removes its linked assistants", () => {
  const schedules = [
    schedule("lecture-1", "본강사", "lecture"),
    schedule("assistant-1", "보조강사", "assistant", "lecture-1"),
    schedule("lecture-2", "다른강사", "lecture"),
  ];

  assert.deepEqual(
    removeScheduleWithLinkedAssistants(schedules, "lecture-1").map(
      (item) => item.id,
    ),
    ["lecture-2"],
  );
});
