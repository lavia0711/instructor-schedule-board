import type { Schedule } from "@/lib/schedule-types";

export type AssistantAssignmentStatus =
  | "unassigned"
  | "assigned"
  | "not_required";

export type ParentLectureAvailability =
  | "available"
  | "cancelled_only"
  | "non_lecture_only"
  | "empty";

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

export function preserveImportedLectureClassification(
  schedule: Schedule,
  previous?: Schedule,
): Schedule {
  if (previous?.kind === "lecture" && schedule.kind === "other") {
    return preserveImportedAssistantRequirement(
      { ...schedule, kind: "lecture" },
      previous,
    );
  }
  return preserveImportedAssistantRequirement(schedule, previous);
}

export function parentLectureAvailability(
  date: string,
  schedules: Schedule[],
  excludedScheduleId = "",
): ParentLectureAvailability {
  const sameDateSchedules = schedules.filter(
    (schedule) =>
      schedule.id !== excludedScheduleId && schedule.date === date,
  );
  const lectures = sameDateSchedules.filter(
    (schedule) => schedule.kind === "lecture",
  );

  if (lectures.some((lecture) => lecture.status !== "cancelled")) {
    return "available";
  }
  if (lectures.length > 0) return "cancelled_only";
  if (sameDateSchedules.some((schedule) => schedule.kind === "other")) {
    return "non_lecture_only";
  }
  return "empty";
}
