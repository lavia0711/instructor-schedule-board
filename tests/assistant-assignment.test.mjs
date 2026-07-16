import assert from "node:assert/strict";
import test from "node:test";

import {
  assistantAssignmentStatus,
  normalizeAssistantRequirement,
  preserveImportedAssistantRequirement,
} from "../lib/assistant-assignment.ts";

function schedule(overrides = {}) {
  return {
    id: "main-1",
    date: "2026-07-17",
    instructor: "문건우 강사",
    session: "오전",
    kind: "lecture",
    status: "confirmed",
    assistantRequired: true,
    arrivalMinutes: 30,
    source: "manual",
    modifiedAt: "2026-07-17T00:00:00.000Z",
    ...overrides,
  };
}

test("a required main lecture is assigned only by an active linked assistant", () => {
  const main = schedule();
  const sameDateAssistant = schedule({
    id: "assistant-unlinked",
    kind: "assistant",
    assistantRequired: false,
  });
  const cancelledLinkedAssistant = schedule({
    id: "assistant-cancelled",
    kind: "assistant",
    status: "cancelled",
    parentScheduleId: main.id,
    assistantRequired: false,
  });
  const activeLinkedAssistant = schedule({
    id: "assistant-active",
    kind: "assistant",
    parentScheduleId: main.id,
    assistantRequired: false,
  });

  assert.equal(
    assistantAssignmentStatus(main, [main, sameDateAssistant]),
    "unassigned",
  );
  assert.equal(
    assistantAssignmentStatus(main, [main, cancelledLinkedAssistant]),
    "unassigned",
  );
  assert.equal(
    assistantAssignmentStatus(main, [main, activeLinkedAssistant]),
    "assigned",
  );
});

test("not-required and cancelled lectures are handled separately", () => {
  assert.equal(
    assistantAssignmentStatus(schedule({ assistantRequired: false }), []),
    "not_required",
  );
  assert.equal(
    assistantAssignmentStatus(schedule({ status: "cancelled" }), []),
    null,
  );
});

test("Excel updates preserve a user's not-required decision", () => {
  const previous = schedule({ assistantRequired: false });
  const imported = schedule({
    topic: "업데이트된 강의명",
    assistantRequired: true,
    source: "excel",
  });

  assert.equal(
    preserveImportedAssistantRequirement(imported, previous)
      .assistantRequired,
    false,
  );
  assert.equal(
    preserveImportedAssistantRequirement(imported).assistantRequired,
    true,
  );
});

test("old local lectures default to required and non-lectures cannot require", () => {
  assert.equal(
    normalizeAssistantRequirement(
      schedule({ assistantRequired: undefined }),
    ).assistantRequired,
    true,
  );
  assert.equal(
    normalizeAssistantRequirement(
      schedule({ kind: "office", assistantRequired: true }),
    ).assistantRequired,
    false,
  );
});
