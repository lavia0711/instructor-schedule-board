import type { Schedule } from "@/lib/schedule-types";

export const INSTRUCTOR_COLOR_PALETTE = [
  "#0369a1",
  "#4338ca",
  "#6d28d9",
  "#a21caf",
  "#be123c",
  "#b45309",
  "#3f6212",
  "#047857",
  "#0e7490",
  "#1d4ed8",
  "#9f1239",
  "#92400e",
];

const LECTURE_KEYWORD_COLOR_PALETTE = [
  "#4285f4",
  "#d97757",
  "#0f9f88",
  "#7c3aed",
  "#c0266d",
  "#2563eb",
  "#ca8a04",
  "#0891b2",
];

export function instructorColor(
  instructor: string,
  customColors?: Record<string, string>,
) {
  const normalized = instructor.trim();
  if (customColors?.[normalized]) return customColors[normalized];

  let hash = 0;
  for (const character of normalized) {
    hash = (hash * 31 + (character.codePointAt(0) ?? 0)) >>> 0;
  }
  return INSTRUCTOR_COLOR_PALETTE[hash % INSTRUCTOR_COLOR_PALETTE.length];
}

export function distributeInstructorColors(
  instructors: string[],
  currentColors: Record<string, string>,
) {
  const nextColors = { ...currentColors };
  const usedColors = new Set<string>();

  instructors.forEach((rawName, index) => {
    const name = rawName.trim();
    if (!name) return;
    const configuredColor = nextColors[name];
    const configuredKey = configuredColor?.toLocaleLowerCase("en-US");
    const availableColor = INSTRUCTOR_COLOR_PALETTE.find(
      (color) => !usedColors.has(color.toLocaleLowerCase("en-US")),
    );
    const color =
      configuredColor && !usedColors.has(configuredKey)
        ? configuredColor
        : availableColor ||
          INSTRUCTOR_COLOR_PALETTE[index % INSTRUCTOR_COLOR_PALETTE.length];

    nextColors[name] = color;
    usedColors.add(color.toLocaleLowerCase("en-US"));
  });

  return nextColors;
}

export function lectureKeywordColorKey(keyword: string) {
  return keyword.trim().toLocaleLowerCase("ko-KR");
}

export function ensureLectureKeywordColors(
  keywords: string[],
  currentColors: Record<string, string>,
) {
  const nextColors: Record<string, string> = {};
  const usedColors = new Set<string>();

  keywords.forEach((keyword, index) => {
    const key = lectureKeywordColorKey(keyword);
    if (!key) return;
    const configuredColor = currentColors[key] || currentColors[keyword];
    const availableColor = LECTURE_KEYWORD_COLOR_PALETTE.find(
      (color) => !usedColors.has(color.toLocaleLowerCase("en-US")),
    );
    const color =
      configuredColor ||
      availableColor ||
      LECTURE_KEYWORD_COLOR_PALETTE[
        index % LECTURE_KEYWORD_COLOR_PALETTE.length
      ];
    nextColors[key] = color;
    usedColors.add(color.toLocaleLowerCase("en-US"));
  });

  return nextColors;
}

export function lectureClassificationColor(
  schedule: Schedule,
  schedules: Schedule[],
  keywords: string[],
  keywordColors: Record<string, string>,
  fallbackColor: string,
) {
  const source =
    schedule.kind === "assistant"
      ? schedules.find((item) => item.id === schedule.parentScheduleId) || schedule
      : schedule;
  if (source.kind !== "lecture" && schedule.kind !== "assistant") {
    return fallbackColor;
  }

  const topic = (source.topic || "").toLocaleLowerCase("ko-KR");
  const matchedKeyword = keywords.find((keyword) =>
    topic.includes(lectureKeywordColorKey(keyword)),
  );
  return matchedKeyword
    ? keywordColors[lectureKeywordColorKey(matchedKeyword)] || fallbackColor
    : fallbackColor;
}
