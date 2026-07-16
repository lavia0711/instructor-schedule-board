import type { Schedule } from "@/lib/schedule-types";

export type AssistantAssignmentStatus =
  | "unassigned"
  | "assigned"
  | "not_required";

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

  return allSchedules.some(
    (item) =>
      item.kind === "assistant" &&
      item.parentScheduleId === schedule.id &&
      item.status !== "cancelled",
  )
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
