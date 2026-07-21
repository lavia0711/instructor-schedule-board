import type { Schedule } from "@/lib/schedule-types";

function normalizedMatchText(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(/[\s._\u00b7\u2013\u2014\/-]+/g, "")
    .trim();
}

export function matchesLectureKeyword(topic: string, keywords: string[]) {
  const normalizedTopic = normalizedMatchText(topic);
  if (!normalizedTopic) return false;
  return keywords.some((keyword) => {
    const normalizedKeyword = normalizedMatchText(keyword);
    return normalizedKeyword.length > 0 && normalizedTopic.includes(normalizedKeyword);
  });
}

export function classifyImportedScheduleKind(
  topic: string,
  keywords: string[],
): Schedule["kind"] {
  return matchesLectureKeyword(topic, keywords) ? "lecture" : "other";
}

export function promoteImportedLectureClassifications(
  schedules: Schedule[],
  keywords: string[],
  modifiedAt = new Date().toISOString(),
) {
  const promotedSchedules: Schedule[] = [];
  const nextSchedules = schedules.map((schedule) => {
    if (
      schedule.source !== "excel" ||
      schedule.kind !== "other" ||
      !matchesLectureKeyword(schedule.topic || "", keywords)
    ) {
      return schedule;
    }

    const promoted: Schedule = {
      ...schedule,
      kind: "lecture",
      assistantRequired: true,
      modifiedAt,
    };
    promotedSchedules.push(promoted);
    return promoted;
  });

  return { schedules: nextSchedules, promotedSchedules };
}
