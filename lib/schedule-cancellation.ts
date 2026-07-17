import type { Schedule } from "@/lib/schedule-types";

export function cascadeCancelledLectureAssistants(
  schedules: Schedule[],
  modifiedAt = new Date().toISOString(),
) {
  const cancelledLectureIds = new Set(
    schedules
      .filter(
        (schedule) =>
          schedule.kind === "lecture" && schedule.status === "cancelled",
      )
      .map((schedule) => schedule.id),
  );

  return schedules.map((schedule) => {
    if (
      schedule.kind !== "assistant" ||
      schedule.status === "cancelled" ||
      !schedule.parentScheduleId ||
      !cancelledLectureIds.has(schedule.parentScheduleId)
    ) {
      return schedule;
    }

    return {
      ...schedule,
      status: "cancelled",
      modifiedAt,
    };
  });
}
