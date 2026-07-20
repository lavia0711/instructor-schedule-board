import type { Schedule } from "@/lib/schedule-types";

export type AssistantAssignmentStatus =
  | "unassigned"
  | "assigned"
  | "not_required";

export function assignedAssistantNames(
  schedule: Schedule,
  allSchedules: Schedule[],
): string[] {
  if (schedule.kind !== "lecture" || schedule.status === "cancelled") {
    return [];
  }

  const names = new Set<string>();
  allSchedules.forEach((item) => {
    if (
      item.kind !== "assistant" ||
      item.parentScheduleId !== schedule.id ||
      item.status === "cancelled"
    ) {
      return;
    }

    const name = item.instructor.trim();
    if (name) names.add(name);
  });

  return [...names];
}

export function groupLinkedAssistantSchedules(
  visibleSchedules: Schedule[],
): Schedule[] {
  const visibleLectureIds = new Set(
    visibleSchedules
      .filter((schedule) => schedule.kind === "lecture")
      .map((schedule) => schedule.id),
  );

  return visibleSchedules.filter(
    (schedule) =>
      schedule.kind !== "assistant" ||
      !schedule.parentScheduleId ||
      !visibleLectureIds.has(schedule.parentScheduleId),
  );
}

export function normalizeAssistantRequirement(schedule: Schedule): Schedule {
  return {
    ...schedule,
    assistantRequired:
      schedule.kind === "lecture" && schedule.assistantRequired !== false,
  };
}

export function assistantAssignmentStatus(
  schedule: Schedule,
  allSchedules: Schedule[],
): AssistantAssignmentStatus | null {
  if (schedule.kind !== "lecture" || schedule.status === "cancelled") {
    return null;
  }
  if (!schedule.assistantRequired) return "not_required";

  return assignedAssistantNames(schedule, allSchedules).length > 0
    ? "assigned"
    : "unassigned";
}

export function preserveImportedAssistantRequirement(
  schedule: Schedule,
  previous?: Schedule,
): Schedule {
  if (schedule.kind !== "lecture") {
    return { ...schedule, assistantRequired: false };
  }

  return {
    ...schedule,
    assistantRequired:
      previous?.kind === "lecture" ? previous.assistantRequired : true,
  };
}
