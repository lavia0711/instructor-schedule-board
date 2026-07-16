import type { RealtimeChannel } from "@supabase/supabase-js";
import type {
  InstructorRecord,
  Schedule,
  UserProfile,
  WorkspaceSettings,
} from "@/lib/schedule-types";
import { getSupabaseClient } from "@/lib/supabase/client";

type ScheduleRow = {
  id: string;
  schedule_date: string;
  start_time: string | null;
  end_time: string | null;
  instructor: string;
  region: string | null;
  venue: string | null;
  session: string | null;
  topic: string | null;
  kind: Schedule["kind"];
  status: Schedule["status"];
  note: string | null;
  parent_schedule_id: string | null;
  assistant_required: boolean;
  arrival_minutes: number;
  source: "manual" | "excel";
  modified_at: string;
};

type InstructorRow = {
  name: string;
  color: string;
  sort_order: number;
};

type ProfileRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  role: "admin" | "instructor";
  instructor_name: string | null;
};

type SettingsRow = {
  kind_colors: WorkspaceSettings["kindColors"];
  lecture_keywords: string[];
};

function requireClient() {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase 연결 정보가 설정되지 않았습니다.");
  return client;
}

function cleanTime(value: string | null) {
  return value ? value.slice(0, 5) : undefined;
}

function fromScheduleRow(row: ScheduleRow): Schedule {
  return {
    id: row.id,
    date: row.schedule_date,
    startTime: cleanTime(row.start_time),
    endTime: cleanTime(row.end_time),
    instructor: row.instructor,
    region: row.region || undefined,
    venue: row.venue || undefined,
    session: row.session || undefined,
    topic: row.topic || undefined,
    kind: row.kind,
    status: row.status,
    note: row.note || undefined,
    parentScheduleId: row.parent_schedule_id || undefined,
    assistantRequired: row.kind === "lecture" && row.assistant_required,
    arrivalMinutes: row.arrival_minutes,
    source: row.source,
    modifiedAt: row.modified_at,
  };
}

function toScheduleRow(schedule: Schedule) {
  return {
    id: schedule.id || crypto.randomUUID(),
    schedule_date: schedule.date,
    start_time: schedule.startTime || null,
    end_time: schedule.endTime || null,
    instructor: schedule.instructor.trim(),
    region: schedule.region?.trim() || null,
    venue: schedule.venue?.trim() || null,
    session: schedule.session?.trim() || null,
    topic: schedule.topic?.trim() || null,
    kind: schedule.kind,
    status: schedule.status,
    note: schedule.note?.trim() || null,
    parent_schedule_id: schedule.parentScheduleId || null,
    assistant_required:
      schedule.kind === "lecture" && schedule.assistantRequired,
    arrival_minutes: schedule.arrivalMinutes,
    source: schedule.source === "excel" ? "excel" : "manual",
  };
}

export async function loadRemoteWorkspace() {
  const client = requireClient();
  const [scheduleResult, instructorResult, settingsResult] = await Promise.all([
    client.from("schedules").select("*").order("schedule_date"),
    client
      .from("instructors")
      .select("name,color,sort_order")
      .order("sort_order")
      .order("name"),
    client
      .from("workspace_settings")
      .select("kind_colors,lecture_keywords")
      .eq("id", "default")
      .single(),
  ]);

  if (scheduleResult.error) throw scheduleResult.error;
  if (instructorResult.error) throw instructorResult.error;
  if (settingsResult.error) throw settingsResult.error;

  const settings = settingsResult.data as SettingsRow;
  return {
    schedules: (scheduleResult.data as ScheduleRow[]).map(fromScheduleRow),
    instructors: (instructorResult.data as InstructorRow[]).map((row) => ({
      name: row.name,
      color: row.color,
      sortOrder: row.sort_order,
    })),
    settings: {
      kindColors: settings.kind_colors || {},
      lectureKeywords: settings.lecture_keywords || [],
    } satisfies WorkspaceSettings,
  };
}

export async function loadCurrentProfile(userId: string) {
  const client = requireClient();
  const { data, error } = await client
    .from("profiles")
    .select("id,email,display_name,role,instructor_name")
    .eq("id", userId)
    .single();

  if (error) throw error;
  const row = data as ProfileRow;
  return {
    id: row.id,
    email: row.email || undefined,
    displayName: row.display_name || undefined,
    role: row.role,
    instructorName: row.instructor_name || undefined,
  } satisfies UserProfile;
}

export async function saveRemoteSchedules(schedules: Schedule[]) {
  if (schedules.length === 0) return [];
  const client = requireClient();
  const rows = schedules.map(toScheduleRow);
  const { data, error } = await client
    .from("schedules")
    .upsert(rows, { onConflict: "id" })
    .select();

  if (error) throw error;
  return (data as ScheduleRow[]).map(fromScheduleRow);
}

export async function deleteRemoteSchedule(scheduleId: string) {
  const client = requireClient();
  const { error } = await client.from("schedules").delete().eq("id", scheduleId);
  if (error) throw error;
}

export async function saveRemoteInstructors(instructors: InstructorRecord[]) {
  if (instructors.length === 0) return;
  const client = requireClient();
  const { error } = await client.from("instructors").upsert(
    instructors.map((instructor) => ({
      name: instructor.name.trim(),
      color: instructor.color,
      sort_order: instructor.sortOrder,
    })),
    { onConflict: "name" },
  );
  if (error) throw error;
}

export async function saveRemoteWorkspaceSettings(
  settings: WorkspaceSettings,
) {
  const client = requireClient();
  const { error } = await client
    .from("workspace_settings")
    .update({
      kind_colors: settings.kindColors,
      lecture_keywords: settings.lectureKeywords,
    })
    .eq("id", "default");
  if (error) throw error;
}

export function subscribeToRemoteWorkspace(onChange: () => void) {
  const client = requireClient();
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  const refresh = () => {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(onChange, 120);
  };

  const channel: RealtimeChannel = client
    .channel("schedule-workspace")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "schedules" },
      refresh,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "instructors" },
      refresh,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "workspace_settings" },
      refresh,
    )
    .subscribe();

  return () => {
    if (refreshTimer) clearTimeout(refreshTimer);
    void client.removeChannel(channel);
  };
}
