export type ScheduleKind =
  | "lecture"
  | "assistant"
  | "office"
  | "off"
  | "other";

export type ScheduleStatus = "confirmed" | "pending" | "cancelled";

export type Schedule = {
  id: string;
  date: string;
  startTime?: string;
  endTime?: string;
  instructor: string;
  region?: string;
  venue?: string;
  session?: string;
  topic?: string;
  kind: ScheduleKind;
  status: ScheduleStatus;
  note?: string;
  parentScheduleId?: string;
  assistantRequired: boolean;
  arrivalMinutes: number;
  source: "sample" | "manual" | "excel";
  modifiedAt: string;
};

export type InstructorRecord = {
  name: string;
  color: string;
  sortOrder: number;
};

export type UserProfile = {
  id: string;
  email?: string;
  displayName?: string;
  role: "admin" | "instructor";
  instructorName?: string;
};

export type WorkspaceSettings = {
  kindColors: Partial<Record<ScheduleKind, string>>;
  lectureKeywords: string[];
  lectureKeywordColors: Record<string, string>;
};
