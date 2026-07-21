import type { Schedule } from "@/lib/schedule-types";

export type InstructorDeletionImpact = {
  directScheduleCount: number;
  linkedAssistantCount: number;
  totalScheduleCount: number;
  scheduleIds: string[];
};

export function instructorDeletionImpact(
  schedules: Schedule[],
  instructor: string,
): InstructorDeletionImpact {
  const directSchedules = schedules.filter(
    (schedule) => schedule.instructor === instructor,
  );
  const parentLectureIds = new Set(
    directSchedules
      .filter((schedule) => schedule.kind === "lecture")
      .map((schedule) => schedule.id),
  );
  const linkedAssistants = schedules.filter(
    (schedule) =>
      schedule.kind === "assistant" &&
      Boolean(schedule.parentScheduleId) &&
      parentLectureIds.has(schedule.parentScheduleId || "") &&
      schedule.instructor !== instructor,
  );
  const scheduleIds = Array.from(
    new Set([
      ...directSchedules.map((schedule) => schedule.id),
      ...linkedAssistants.map((schedule) => schedule.id),
    ]),
  );

  return {
    directScheduleCount: directSchedules.length,
    linkedAssistantCount: linkedAssistants.length,
    totalScheduleCount: scheduleIds.length,
    scheduleIds,
  };
}

export function removeInstructorSchedules(
  schedules: Schedule[],
  instructor: string,
) {
  const deletedIds = new Set(
    instructorDeletionImpact(schedules, instructor).scheduleIds,
  );
  return schedules.filter((schedule) => !deletedIds.has(schedule.id));
}

export function removeScheduleWithLinkedAssistants(
  schedules: Schedule[],
  scheduleId: string,
) {
  const deletedIds = new Set([scheduleId]);
  schedules.forEach((schedule) => {
    if (
      schedule.kind === "assistant" &&
      schedule.parentScheduleId === scheduleId
    ) {
      deletedIds.add(schedule.id);
    }
  });
  return schedules.filter((schedule) => !deletedIds.has(schedule.id));
}
