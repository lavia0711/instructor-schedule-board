"use client";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin, { type DateClickArg } from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import timeGridPlugin from "@fullcalendar/timegrid";
import type {
  DatesSetArg,
  EventClickArg,
  EventContentArg,
  EventInput,
} from "@fullcalendar/core";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Cloud,
  Clock3,
  FileSpreadsheet,
  Filter,
  GripVertical,
  Link2,
  ListPlus,
  LoaderCircle,
  LogOut,
  MapPin,
  Palette,
  Plus,
  Search,
  ShieldCheck,
  Upload,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type SetStateAction,
} from "react";
import type {
  Schedule,
  ScheduleKind,
  ScheduleStatus,
  UserProfile,
} from "@/lib/schedule-types";
import { formatAuthError } from "@/lib/auth-error";
import { cascadeCancelledLectureAssistants } from "@/lib/schedule-cancellation";
import {
  calendarDisplayView,
  logicalCalendarView,
  type CalendarView,
} from "@/lib/calendar-responsive";
import {
  assistantAssignmentStatus,
  normalizeAssistantRequirement,
  preserveImportedAssistantRequirement,
  type AssistantAssignmentStatus,
} from "@/lib/assistant-assignment";
import {
  getSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/client";
import {
  deleteRemoteSchedule,
  loadCurrentProfile,
  loadRemoteWorkspace,
  saveRemoteInstructors,
  saveRemoteSchedules,
  saveRemoteWorkspaceSettings,
  subscribeToRemoteWorkspace,
} from "@/lib/supabase/schedule-repository";

type RoleKey = "admin" | `instructor:${string}`;

type ImportAction = "new" | "update" | "unchanged" | "error";

type ImportCandidate = {
  key: string;
  rowNumber: number;
  sheetName: string;
  action: ImportAction;
  message: string;
  schedule?: Schedule;
  matchId?: string;
};

const STORAGE_KEY = "lecture-schedule-prototype-v1";
const COLOR_STORAGE_KEY = "lecture-schedule-instructor-colors-v1";
const KIND_COLOR_STORAGE_KEY = "lecture-schedule-kind-colors-v1";
const INSTRUCTOR_ORDER_STORAGE_KEY = "lecture-schedule-instructor-order-v1";
const LECTURE_KEYWORDS_STORAGE_KEY = "lecture-schedule-import-keywords-v1";
const TODAY = isoFromLocalDate(new Date());
const CORE_INSTRUCTORS: readonly string[] = [];
const DEFAULT_LECTURE_KEYWORDS = ["제미나이", "클로드"];

const KIND_META: Record<
  ScheduleKind,
  { label: string; color: string; soft: string }
> = {
  lecture: { label: "본강의", color: "#2563eb", soft: "#eff6ff" },
  assistant: { label: "보조강의", color: "#8b5cf6", soft: "#f3efff" },
  office: { label: "사무실 출근", color: "#0f9f88", soft: "#e8faf5" },
  off: { label: "휴무", color: "#64748b", soft: "#f1f5f9" },
  other: { label: "기타", color: "#d97706", soft: "#fff7ed" },
};

const STATUS_META: Record<ScheduleStatus, { label: string; color: string }> = {
  confirmed: { label: "확정", color: "#1f9d73" },
  pending: { label: "확인 필요", color: "#e58b22" },
  cancelled: { label: "취소", color: "#df4b56" },
};

const ASSISTANT_ASSIGNMENT_META: Record<
  AssistantAssignmentStatus,
  { label: string; color: string }
> = {
  unassigned: { label: "보조 미배정", color: "#ea6b27" },
  assigned: { label: "배정 완료", color: "#16966f" },
  not_required: { label: "보조 불필요", color: "#64748b" },
};

const ASSISTANT_ASSIGNMENT_STATUSES = Object.keys(
  ASSISTANT_ASSIGNMENT_META,
) as AssistantAssignmentStatus[];

const DEFAULT_KIND_COLORS: Record<ScheduleKind, string> = {
  lecture: KIND_META.lecture.color,
  assistant: KIND_META.assistant.color,
  office: KIND_META.office.color,
  off: KIND_META.off.color,
  other: KIND_META.other.color,
};

const INSTRUCTOR_COLOR_OVERRIDES: Record<string, string> = {};

const INSTRUCTOR_COLOR_PALETTE = [
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

function instructorColor(
  instructor: string,
  customColors?: Record<string, string>,
) {
  const normalized = instructor.trim();
  if (customColors?.[normalized]) {
    return customColors[normalized];
  }
  if (INSTRUCTOR_COLOR_OVERRIDES[normalized]) {
    return INSTRUCTOR_COLOR_OVERRIDES[normalized];
  }

  let hash = 0;
  for (const character of normalized) {
    hash = (hash * 31 + (character.codePointAt(0) ?? 0)) >>> 0;
  }
  return INSTRUCTOR_COLOR_PALETTE[hash % INSTRUCTOR_COLOR_PALETTE.length];
}

function isoFromLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function currentWeekRange(dateIso: string) {
  const date = new Date(`${dateIso}T12:00:00`);
  const sundayOffset = date.getDay();
  const start = new Date(date);
  start.setDate(date.getDate() - sundayOffset);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: isoFromLocalDate(start), end: isoFromLocalDate(end) };
}

function timeFromLocalDate(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;
}

function addMinutesToTime(time: string, minutes: number) {
  const [hour, minute] = time.split(":").map(Number);
  const total = Math.min(hour * 60 + minute + minutes, 23 * 60 + 30);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(
    total % 60,
  ).padStart(2, "0")}`;
}

function deriveSession(startTime?: string) {
  if (!startTime) return "종일";
  const hour = Number(startTime.split(":")[0]);
  if (hour < 13) return "오전";
  if (hour < 19) return "오후";
  return "야간";
}

function calculateArrival(startTime?: string, minutes = 30) {
  if (!startTime || minutes === 0) return undefined;
  const [hour, minute] = startTime.split(":").map(Number);
  const total = hour * 60 + minute - minutes;
  const normalized = (total + 24 * 60) % (24 * 60);
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(
    normalized % 60,
  ).padStart(2, "0")}`;
}

function parentLectureLabel(schedule: Schedule) {
  const time =
    schedule.startTime && schedule.endTime
      ? `${schedule.startTime}-${schedule.endTime}`
      : "시간 미정";
  const place = [schedule.region, schedule.venue].filter(Boolean).join(" · ");
  return [
    schedule.date.replaceAll("-", "."),
    time,
    schedule.instructor,
    schedule.topic || "본강의",
    place || "지역·장소 미정",
    schedule.status === "cancelled" ? "취소" : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function scheduleIdentityKey(schedule: Schedule) {
  const untimedSession =
    schedule.startTime || schedule.endTime
      ? ""
      : schedule.session || deriveSession(schedule.startTime);
  return [
    schedule.date,
    schedule.instructor.trim(),
    schedule.startTime ?? "",
    schedule.endTime ?? "",
    untimedSession,
  ]
    .join("|")
    .toLocaleLowerCase("ko-KR");
}

function scheduleSlotKey(schedule: Schedule) {
  return [
    schedule.date,
    schedule.instructor.trim(),
    schedule.session || deriveSession(schedule.startTime),
  ]
    .join("|")
    .toLocaleLowerCase("ko-KR");
}

function changedScheduleFields(previous: Schedule, next: Schedule) {
  const emptyText = (value?: string) => value?.trim() || "없음";
  const timeText = (schedule: Schedule) =>
    schedule.startTime && schedule.endTime
      ? `${schedule.startTime}-${schedule.endTime}`
      : "시간 미정";
  const fields: Array<[string, string, string]> = [
    ["시간", timeText(previous), timeText(next)],
    ["지역", emptyText(previous.region), emptyText(next.region)],
    ["장소", emptyText(previous.venue), emptyText(next.venue)],
    ["시간대", emptyText(previous.session), emptyText(next.session)],
    ["강의명·내용", emptyText(previous.topic), emptyText(next.topic)],
    ["일정 종류", KIND_META[previous.kind].label, KIND_META[next.kind].label],
    ["상태", STATUS_META[previous.status].label, STATUS_META[next.status].label],
    ["메모", emptyText(previous.note), emptyText(next.note)],
    [
      "도착 준비 시간",
      previous.arrivalMinutes ? `${previous.arrivalMinutes}분 전` : "설정 안 함",
      next.arrivalMinutes ? `${next.arrivalMinutes}분 전` : "설정 안 함",
    ],
  ];
  return fields
    .filter(([, previousValue, nextValue]) => previousValue !== nextValue)
    .map(([label, previousValue, nextValue]) => ({
      label,
      previousValue,
      nextValue,
    }));
}

function classifyImportCandidate(
  schedule: Schedule,
  existingSchedules: Schedule[],
  context: Pick<ImportCandidate, "key" | "rowNumber" | "sheetName">,
): ImportCandidate {
  const identityMatches = existingSchedules.filter(
    (item) => scheduleIdentityKey(item) === scheduleIdentityKey(schedule),
  );

  if (identityMatches.length > 1) {
    return {
      ...context,
      action: "error",
      message: "같은 날짜·강사·시간 일정이 여러 건이라 먼저 중복 정리가 필요합니다.",
      schedule,
    };
  }

  const exactIdentityMatch = identityMatches[0];
  if (exactIdentityMatch) {
    const nextSchedule = preserveImportedAssistantRequirement(
      schedule,
      exactIdentityMatch,
    );
    const changedFields = changedScheduleFields(
      exactIdentityMatch,
      nextSchedule,
    );
    if (changedFields.length === 0) {
      return {
        ...context,
        action: "unchanged",
        message: "모든 일정 정보가 동일합니다.",
        schedule: nextSchedule,
        matchId: exactIdentityMatch.id,
      };
    }
    const detail = changedFields
      .slice(0, 3)
      .map(
        ({ label, previousValue, nextValue }) =>
          `${label}: ${previousValue} → ${nextValue}`,
      )
      .join(" · ");
    const remainder =
      changedFields.length > 3 ? ` 외 ${changedFields.length - 3}개` : "";
    return {
      ...context,
      action: "update",
      message: `${detail}${remainder}`,
      schedule: nextSchedule,
      matchId: exactIdentityMatch.id,
    };
  }

  const slotMatches = existingSchedules.filter(
    (item) => scheduleSlotKey(item) === scheduleSlotKey(schedule),
  );
  if (slotMatches.length > 1) {
    return {
      ...context,
      action: "error",
      message: "같은 시간대 일정이 여러 건이라 자동 판단할 수 없습니다.",
      schedule,
    };
  }
  if (slotMatches.length === 1) {
    const nextSchedule = preserveImportedAssistantRequirement(
      schedule,
      slotMatches[0],
    );
    const changedFields = changedScheduleFields(slotMatches[0], nextSchedule);
    const detail = changedFields
      .slice(0, 3)
      .map(
        ({ label, previousValue, nextValue }) =>
          `${label}: ${previousValue} → ${nextValue}`,
      )
      .join(" · ");
    const remainder =
      changedFields.length > 3 ? ` 외 ${changedFields.length - 3}개` : "";
    return {
      ...context,
      action: "update",
      message: `${detail || "일정 정보가 변경됩니다."}${remainder}`,
      schedule: nextSchedule,
      matchId: slotMatches[0].id,
    };
  }
  return {
    ...context,
    action: "new",
    message: "새 일정으로 등록합니다.",
    schedule: preserveImportedAssistantRequirement(schedule),
  };
}

function roleInstructor(roleKey: RoleKey) {
  return roleKey.startsWith("instructor:")
    ? roleKey.replace("instructor:", "")
    : undefined;
}

function readCellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.text === "string") return record.text.trim();
    if (typeof record.result === "string" || typeof record.result === "number") {
      return String(record.result).trim();
    }
    if (Array.isArray(record.richText)) {
      return record.richText
        .map((part) => {
          if (typeof part === "object" && part && "text" in part) {
            return String((part as { text: unknown }).text);
          }
          return "";
        })
        .join("")
        .trim();
    }
  }
  return String(value).trim();
}

function normalizeLectureKeywords(value: unknown) {
  if (!Array.isArray(value)) return [...DEFAULT_LECTURE_KEYWORDS];
  return Array.from(
    new Set(
      value
        .filter((keyword): keyword is string => typeof keyword === "string")
        .map((keyword) => keyword.trim())
        .filter(Boolean),
    ),
  );
}

function classifyExcelKind(remark: string, lectureKeywords: string[]) {
  const normalizedRemark = remark.toLocaleLowerCase("ko-KR");
  return lectureKeywords.some((keyword) =>
    normalizedRemark.includes(keyword.toLocaleLowerCase("ko-KR")),
  )
    ? "lecture"
    : "other";
}

function regionText(schedule: Schedule) {
  if (schedule.kind === "office" || schedule.kind === "off") return "";
  return schedule.region || "지역 미정";
}

function parseExcelDate(value: unknown, baseYear: number) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return isoFromLocalDate(value);
  }
  if (typeof value === "number") {
    const epoch = Date.UTC(1899, 11, 30);
    const date = new Date(epoch + value * 86_400_000);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
      2,
      "0",
    )}-${String(date.getUTCDate()).padStart(2, "0")}`;
  }
  const text = readCellText(value);
  const koreanDate = text.match(/(?:(\d{4})\s*[년./-]\s*)?(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (koreanDate) {
    const year = Number(koreanDate[1] || baseYear);
    return `${year}-${String(Number(koreanDate[2])).padStart(2, "0")}-${String(
      Number(koreanDate[3]),
    ).padStart(2, "0")}`;
  }
  const plainDate = text.match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (plainDate) {
    return `${plainDate[1]}-${String(Number(plainDate[2])).padStart(
      2,
      "0",
    )}-${String(Number(plainDate[3])).padStart(2, "0")}`;
  }
  return null;
}

function parseTimeRange(value: unknown) {
  const text = readCellText(value).replace(/\s/g, "");
  const match = text.match(
    /(\d{1,2}):(\d{2})[~\-–—〜](\d{1,2}):(\d{2})/,
  );
  if (!match) return null;
  return {
    startTime: `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`,
    endTime: `${String(Number(match[3])).padStart(2, "0")}:${match[4]}`,
  };
}

function emptySchedule(date = TODAY, instructor = ""): Schedule {
  return {
    id: "",
    date,
    startTime: "11:30",
    endTime: "13:00",
    instructor,
    session: "오전",
    kind: "lecture",
    status: "confirmed",
    assistantRequired: true,
    arrivalMinutes: 30,
    source: "manual",
    modifiedAt: new Date().toISOString(),
  };
}

export default function Home() {
  const calendarRef = useRef<FullCalendar | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [schedules, setScheduleState] = useState<Schedule[]>([]);
  const setSchedules = useCallback((next: SetStateAction<Schedule[]>) => {
    setScheduleState((current) =>
      cascadeCancelledLectureAssistants(
        typeof next === "function" ? next(current) : next,
      ),
    );
  }, []);
  const [instructorColors, setInstructorColors] = useState<Record<string, string>>(
    INSTRUCTOR_COLOR_OVERRIDES,
  );
  const [kindColors, setKindColors] = useState<Record<ScheduleKind, string>>(
    DEFAULT_KIND_COLORS,
  );
  const [instructorOrder, setInstructorOrder] = useState<string[]>([
    ...CORE_INSTRUCTORS,
  ]);
  const [hydrated, setHydrated] = useState(false);
  const [roleKey, setRoleKey] = useState<RoleKey>("admin");
  const [calendarView, setCalendarView] =
    useState<CalendarView>("dayGridMonth");
  const [calendarTitle, setCalendarTitle] = useState("2026년 7월");
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);
  const [mobileSelectedDate, setMobileSelectedDate] = useState(TODAY);
  const [instructorFilter, setInstructorFilter] = useState("all");
  const [kindFilters, setKindFilters] = useState<ScheduleKind[]>([
    "lecture",
    "assistant",
    "office",
    "off",
    "other",
  ]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilters, setStatusFilters] = useState<ScheduleStatus[]>([
    "confirmed",
    "pending",
    "cancelled",
  ]);
  const [assistantFilters, setAssistantFilters] = useState<
    AssistantAssignmentStatus[]
  >([...ASSISTANT_ASSIGNMENT_STATUSES]);
  const [editorSchedule, setEditorSchedule] = useState<Schedule | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isBulkSelectionMode, setIsBulkSelectionMode] = useState(false);
  const [bulkSelectedDates, setBulkSelectedDates] = useState<string[]>([]);
  const [bulkSelectedScheduleIds, setBulkSelectedScheduleIds] = useState<
    string[]
  >([]);
  const [bulkEditorDates, setBulkEditorDates] = useState<string[] | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importYear, setImportYear] = useState(new Date().getFullYear());
  const [lectureKeywords, setLectureKeywords] = useState<string[]>(
    DEFAULT_LECTURE_KEYWORDS,
  );
  const [lectureKeywordInput, setLectureKeywordInput] = useState("");
  const [importCandidates, setImportCandidates] = useState<ImportCandidate[]>([]);
  const [importFileName, setImportFileName] = useState("");
  const [importMessage, setImportMessage] = useState(
    "표준 일정표를 선택하면 반영 전에 결과를 확인할 수 있습니다.",
  );
  const [isParsing, setIsParsing] = useState(false);
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);
  const [currentProfile, setCurrentProfile] = useState<UserProfile | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isLoginLoading, setIsLoginLoading] = useState(false);
  const dragSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 820px)");
    const syncLayout = () => {
      setIsMobileLayout(mediaQuery.matches);
      if (!mediaQuery.matches) setIsMobileFiltersOpen(false);
    };
    syncLayout();
    mediaQuery.addEventListener("change", syncLayout);
    return () => mediaQuery.removeEventListener("change", syncLayout);
  }, []);

  useEffect(() => {
    const calendar = calendarRef.current?.getApi();
    if (!calendar) return;
    const displayView = calendarDisplayView(calendarView, isMobileLayout);
    if (calendar.view.type !== displayView) {
      calendar.changeView(displayView);
    }
  }, [calendarView, isMobileLayout]);

  useEffect(() => {
    if (!isMobileFiltersOpen && !isEditorOpen && !isImportOpen) return;
    const previousOverflow = document.body.style.overflow;
    const previousRootOverflow = document.documentElement.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsMobileFiltersOpen(false);
    };
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.documentElement.style.overflow = previousRootOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isEditorOpen, isImportOpen, isMobileFiltersOpen]);

  const hydrateRemoteWorkspace = useCallback(async (userId: string) => {
    const [workspace, profile] = await Promise.all([
      loadRemoteWorkspace(),
      loadCurrentProfile(userId),
    ]);
    setSchedules(workspace.schedules);
    setInstructorOrder(workspace.instructors.map((item) => item.name));
    setInstructorColors({
      ...INSTRUCTOR_COLOR_OVERRIDES,
      ...Object.fromEntries(
        workspace.instructors.map((item) => [item.name, item.color]),
      ),
    });
    setKindColors({
      ...DEFAULT_KIND_COLORS,
      ...workspace.settings.kindColors,
    });
    setLectureKeywords(
      normalizeLectureKeywords(workspace.settings.lectureKeywords),
    );
    setCurrentProfile(profile);
    setRoleKey(
      profile.role === "admin"
        ? "admin"
        : `instructor:${profile.instructorName || ""}`,
    );
    setHydrated(true);
  }, [setSchedules]);

  useEffect(() => {
    if (isSupabaseConfigured) return;
    const timer = window.setTimeout(() => {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const savedSchedules = JSON.parse(saved) as Schedule[];
          setSchedules(
            (Array.isArray(savedSchedules) ? savedSchedules : [])
              .filter((schedule) => schedule.source !== "sample")
              .map(normalizeAssistantRequirement),
          );
        } catch {
          setSchedules([]);
        }
      }
      const savedColors = window.localStorage.getItem(COLOR_STORAGE_KEY);
      if (savedColors) {
        try {
          setInstructorColors({
            ...INSTRUCTOR_COLOR_OVERRIDES,
            ...(JSON.parse(savedColors) as Record<string, string>),
          });
        } catch {
          setInstructorColors(INSTRUCTOR_COLOR_OVERRIDES);
        }
      }
      const savedKindColors = window.localStorage.getItem(KIND_COLOR_STORAGE_KEY);
      if (savedKindColors) {
        try {
          setKindColors({
            ...DEFAULT_KIND_COLORS,
            ...(JSON.parse(savedKindColors) as Partial<
              Record<ScheduleKind, string>
            >),
          });
        } catch {
          setKindColors(DEFAULT_KIND_COLORS);
        }
      }
      const savedInstructorOrder = window.localStorage.getItem(
        INSTRUCTOR_ORDER_STORAGE_KEY,
      );
      if (savedInstructorOrder) {
        try {
          setInstructorOrder(JSON.parse(savedInstructorOrder) as string[]);
        } catch {
          setInstructorOrder([...CORE_INSTRUCTORS]);
        }
      }
      const savedLectureKeywords = window.localStorage.getItem(
        LECTURE_KEYWORDS_STORAGE_KEY,
      );
      if (savedLectureKeywords) {
        try {
          setLectureKeywords(
            normalizeLectureKeywords(JSON.parse(savedLectureKeywords)),
          );
        } catch {
          setLectureKeywords([...DEFAULT_LECTURE_KEYWORDS]);
        }
      }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [setSchedules]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const client = getSupabaseClient();
    if (!client) return;

    let active = true;
    let stopRealtime: (() => void) | undefined;

    const activateSession = async (userId: string) => {
      setIsSyncing(true);
      setSyncMessage("서버 일정을 불러오는 중입니다.");
      try {
        await hydrateRemoteWorkspace(userId);
        if (!active) return;
        stopRealtime?.();
        stopRealtime = subscribeToRemoteWorkspace(() => {
          void hydrateRemoteWorkspace(userId).catch((error: unknown) => {
            setSyncMessage(
              error instanceof Error
                ? `실시간 동기화 실패: ${error.message}`
                : "실시간 동기화에 실패했습니다.",
            );
          });
        });
        setSyncMessage("서버와 동기화되었습니다.");
      } catch (error) {
        if (!active) return;
        setCurrentProfile(null);
        setLoginError(formatAuthError(error, "서버 초기화에 실패했습니다."));
      } finally {
        if (active) {
          setAuthReady(true);
          setIsSyncing(false);
          setIsLoginLoading(false);
        }
      }
    };

    void client.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setLoginError(formatAuthError(error));
        setAuthReady(true);
        return;
      }
      if (data.session?.user.id) {
        void activateSession(data.session.user.id);
      } else {
        setAuthReady(true);
      }
    });

    const { data: authListener } = client.auth.onAuthStateChange(
      (event, session) => {
        if (!active) return;
        if (event === "SIGNED_OUT" || !session) {
          stopRealtime?.();
          stopRealtime = undefined;
          setCurrentProfile(null);
          setSchedules([]);
          setAuthReady(true);
          setIsLoginLoading(false);
          return;
        }
        if (event === "SIGNED_IN") {
          window.setTimeout(() => {
            if (active) void activateSession(session.user.id);
          }, 0);
        }
      },
    );

    return () => {
      active = false;
      stopRealtime?.();
      authListener.subscription.unsubscribe();
    };
  }, [hydrateRemoteWorkspace, setSchedules]);

  useEffect(() => {
    if (hydrated && !isSupabaseConfigured) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(schedules));
    }
  }, [hydrated, schedules]);

  useEffect(() => {
    if (hydrated && !isSupabaseConfigured) {
      window.localStorage.setItem(
        COLOR_STORAGE_KEY,
        JSON.stringify(instructorColors),
      );
    }
  }, [hydrated, instructorColors]);

  useEffect(() => {
    if (hydrated && !isSupabaseConfigured) {
      window.localStorage.setItem(
        KIND_COLOR_STORAGE_KEY,
        JSON.stringify(kindColors),
      );
    }
  }, [hydrated, kindColors]);

  useEffect(() => {
    if (hydrated && !isSupabaseConfigured) {
      window.localStorage.setItem(
        INSTRUCTOR_ORDER_STORAGE_KEY,
        JSON.stringify(instructorOrder),
      );
    }
  }, [hydrated, instructorOrder]);

  useEffect(() => {
    if (hydrated && !isSupabaseConfigured) {
      window.localStorage.setItem(
        LECTURE_KEYWORDS_STORAGE_KEY,
        JSON.stringify(lectureKeywords),
      );
    }
  }, [hydrated, lectureKeywords]);

  const availableInstructors = useMemo(
    () =>
      Array.from(
        new Set([
          ...CORE_INSTRUCTORS,
          ...instructorOrder,
          ...schedules.map((item) => item.instructor),
        ]),
      ).sort((a, b) => a.localeCompare(b, "ko-KR")),
    [instructorOrder, schedules],
  );

  const instructors = useMemo(
    () => [
      ...instructorOrder.filter((name) => availableInstructors.includes(name)),
      ...availableInstructors.filter((name) => !instructorOrder.includes(name)),
    ],
    [availableInstructors, instructorOrder],
  );
  const colorSettingInstructors =
    instructorFilter === "all"
      ? instructors
      : instructors.filter((instructor) => instructor === instructorFilter);

  const mainLectures = useMemo(
    () =>
      schedules
        .filter((schedule) => schedule.kind === "lecture")
        .sort((a, b) =>
          `${a.date}|${a.startTime || "99:99"}|${a.instructor}`.localeCompare(
            `${b.date}|${b.startTime || "99:99"}|${b.instructor}`,
            "ko-KR",
          ),
        ),
    [schedules],
  );

  const activeInstructor = roleInstructor(roleKey);
  const isAdmin = roleKey === "admin";

  const canEdit = (schedule: Schedule) =>
    isAdmin || schedule.instructor === activeInstructor;

  function showSyncError(error: unknown, fallback: string) {
    setSyncMessage(error instanceof Error ? error.message : fallback);
  }

  async function persistInstructorConfiguration(
    nextOrder: string[],
    nextColors: Record<string, string>,
  ) {
    if (!isSupabaseConfigured || !isAdmin) return;
    setIsSyncing(true);
    try {
      await saveRemoteInstructors(
        nextOrder.map((name, index) => ({
          name,
          color: instructorColor(name, nextColors),
          sortOrder: index,
        })),
      );
      setSyncMessage("강사 설정이 서버에 저장되었습니다.");
    } catch (error) {
      showSyncError(error, "강사 설정을 저장하지 못했습니다.");
    } finally {
      setIsSyncing(false);
    }
  }

  async function persistWorkspaceSettings(
    nextKindColors: Record<ScheduleKind, string>,
    nextLectureKeywords: string[],
  ) {
    if (!isSupabaseConfigured || !isAdmin) return;
    setIsSyncing(true);
    try {
      await saveRemoteWorkspaceSettings({
        kindColors: nextKindColors,
        lectureKeywords: nextLectureKeywords,
      });
      setSyncMessage("공용 화면 설정이 서버에 저장되었습니다.");
    } catch (error) {
      showSyncError(error, "공용 화면 설정을 저장하지 못했습니다.");
    } finally {
      setIsSyncing(false);
    }
  }

  const { filteredSchedules, kindCounts, statusCounts, assistantCounts } =
    useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase("ko-KR");
    const instructorAndSearchSchedules = schedules.filter((schedule) => {
      if (instructorFilter !== "all" && schedule.instructor !== instructorFilter) {
        return false;
      }
      if (!query) return true;
      return [
        schedule.instructor,
        schedule.region,
        schedule.venue,
        schedule.topic,
        schedule.note,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("ko-KR")
        .includes(query);
    });
    const passesAssistantFilter = (schedule: Schedule) => {
      if (
        assistantFilters.length === ASSISTANT_ASSIGNMENT_STATUSES.length
      ) {
        return true;
      }
      const assignment = assistantAssignmentStatus(schedule, schedules);
      return assignment !== null && assistantFilters.includes(assignment);
    };
    const kindCountSource = instructorAndSearchSchedules.filter(
      (schedule) =>
        statusFilters.includes(schedule.status) &&
        passesAssistantFilter(schedule),
    );
    const statusCountSource = instructorAndSearchSchedules.filter(
      (schedule) =>
        kindFilters.includes(schedule.kind) &&
        passesAssistantFilter(schedule),
    );
    const assistantCountSource = instructorAndSearchSchedules.filter(
      (schedule) =>
        kindFilters.includes(schedule.kind) &&
        statusFilters.includes(schedule.status),
    );
    return {
      filteredSchedules: instructorAndSearchSchedules.filter(
        (schedule) =>
          kindFilters.includes(schedule.kind) &&
          statusFilters.includes(schedule.status) &&
          passesAssistantFilter(schedule),
      ),
      kindCounts: Object.fromEntries(
        (Object.keys(KIND_META) as ScheduleKind[]).map((kind) => [
          kind,
          kindCountSource.filter((schedule) => schedule.kind === kind).length,
        ]),
      ) as Record<ScheduleKind, number>,
      statusCounts: Object.fromEntries(
        (Object.keys(STATUS_META) as ScheduleStatus[]).map((status) => [
          status,
          statusCountSource.filter((schedule) => schedule.status === status)
            .length,
        ]),
      ) as Record<ScheduleStatus, number>,
      assistantCounts: Object.fromEntries(
        ASSISTANT_ASSIGNMENT_STATUSES.map((status) => [
          status,
          assistantCountSource.filter(
            (schedule) =>
              assistantAssignmentStatus(schedule, schedules) === status,
          ).length,
        ]),
      ) as Record<AssistantAssignmentStatus, number>,
    };
  }, [
    assistantFilters,
    instructorFilter,
    kindFilters,
    schedules,
    searchQuery,
    statusFilters,
  ]);

  const calendarEvents = useMemo<EventInput[]>(
    () =>
      filteredSchedules.map((schedule) => {
        const meta = KIND_META[schedule.kind];
        const isAllDay = !schedule.startTime || !schedule.endTime;
        const assistantStatus = assistantAssignmentStatus(schedule, schedules);
        return {
          id: schedule.id,
          title: [
            schedule.instructor,
            schedule.topic || meta.label,
            regionText(schedule),
          ]
            .filter(Boolean)
            .join(" · "),
          start: isAllDay
            ? schedule.date
            : `${schedule.date}T${schedule.startTime}:00`,
          end: isAllDay
            ? undefined
            : `${schedule.date}T${schedule.endTime}:00`,
          allDay: isAllDay,
          backgroundColor: instructorColor(schedule.instructor, instructorColors),
          borderColor: "transparent",
          textColor: "#ffffff",
          instructorRank: instructors.indexOf(schedule.instructor),
          editable: isAdmin || schedule.instructor === activeInstructor,
          classNames: [
            `schedule-${schedule.kind}`,
            `schedule-${schedule.status}`,
            ...(bulkSelectedScheduleIds.includes(schedule.id)
              ? ["bulk-selected-schedule"]
              : []),
          ],
          extendedProps: {
            schedule,
            kindColor: kindColors[schedule.kind],
            assistantStatus,
          },
        };
      }),
    [
      activeInstructor,
      bulkSelectedScheduleIds,
      filteredSchedules,
      instructorColors,
      instructors,
      isAdmin,
      kindColors,
      schedules,
    ],
  );

  const todaySchedules = filteredSchedules
    .filter(
      (item) =>
        item.date === TODAY &&
        item.kind !== "off" &&
        item.status !== "cancelled",
    )
    .sort((a, b) =>
      `${a.date}|${a.startTime || ""}`.localeCompare(
        `${b.date}|${b.startTime || ""}`,
      ),
    );
  const weekRange = currentWeekRange(TODAY);
  const weekCount = filteredSchedules.filter(
    (item) =>
      item.kind !== "off" &&
      item.status !== "cancelled" &&
      item.date >= weekRange.start &&
      item.date <= weekRange.end,
  ).length;

  const mobileSelectedSchedules = useMemo(
    () =>
      filteredSchedules
        .filter((schedule) => schedule.date === mobileSelectedDate)
        .sort((a, b) => {
          const timeOrder = (a.startTime || "99:99").localeCompare(
            b.startTime || "99:99",
          );
          if (timeOrder !== 0) return timeOrder;
          return instructors.indexOf(a.instructor) - instructors.indexOf(b.instructor);
        }),
    [filteredSchedules, instructors, mobileSelectedDate],
  );

  function changeView(view: CalendarView) {
    setCalendarView(view);
    calendarRef.current
      ?.getApi()
      .changeView(calendarDisplayView(view, isMobileLayout));
  }

  function showCurrentWeek() {
    calendarRef.current?.getApi().gotoDate(TODAY);
    changeView("timeGridWeek");
  }

  function handleInstructorDragEnd(event: DragEndEvent) {
    if (!isAdmin || !event.over || event.active.id === event.over.id) return;
    const oldIndex = instructors.indexOf(String(event.active.id));
    const newIndex = instructors.indexOf(String(event.over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const nextOrder = arrayMove(instructors, oldIndex, newIndex);
    setInstructorOrder(nextOrder);
    void persistInstructorConfiguration(nextOrder, instructorColors);
  }

  function openNewSchedule(date = TODAY, startTime?: string) {
    const preferredInstructor =
      activeInstructor ||
      (instructorFilter !== "all" ? instructorFilter : instructors[0] || "");
    const schedule = emptySchedule(date, preferredInstructor);
    setEditorSchedule(
      startTime
        ? {
            ...schedule,
            startTime,
            endTime: addMinutesToTime(startTime, 60),
            session: deriveSession(startTime),
          }
        : schedule,
    );
    setIsBulkSelectionMode(false);
    setBulkSelectedDates([]);
    setBulkSelectedScheduleIds([]);
    setBulkEditorDates(null);
    setIsEditorOpen(true);
  }

  function openScheduleForVisibleDate() {
    const calendarDate = calendarRef.current?.getApi().getDate();
    openNewSchedule(
      calendarView === "dayGridMonth"
        ? mobileSelectedDate
        : calendarDate
          ? isoFromLocalDate(calendarDate)
          : TODAY,
    );
  }

  function toggleBulkDate(date: string) {
    setBulkSelectedDates((current) =>
      current.includes(date)
        ? current.filter((item) => item !== date)
        : [...current, date].sort(),
    );
  }

  function toggleBulkSelectionMode() {
    if (isBulkSelectionMode) {
      setBulkSelectedDates([]);
      setBulkSelectedScheduleIds([]);
      setIsBulkSelectionMode(false);
      return;
    }
    setIsBulkSelectionMode(true);
  }

  function openBulkScheduleEditor() {
    if (bulkSelectedDates.length === 0) return;
    const preferredInstructor =
      activeInstructor ||
      (instructorFilter !== "all" ? instructorFilter : instructors[0] || "");
    setEditorSchedule(emptySchedule(bulkSelectedDates[0], preferredInstructor));
    setBulkEditorDates([...bulkSelectedDates]);
    setIsEditorOpen(true);
  }

  function handleScheduleClick(schedule: Schedule) {
    if (isBulkSelectionMode) {
      if (
        schedule.kind === "lecture" &&
        schedule.status !== "cancelled" &&
        canEdit(schedule)
      ) {
        setBulkSelectedScheduleIds((current) =>
          current.includes(schedule.id)
            ? current.filter((item) => item !== schedule.id)
            : [...current, schedule.id],
        );
      } else {
        toggleBulkDate(schedule.date);
      }
      return;
    }
    setEditorSchedule(schedule);
    setBulkEditorDates(null);
    setIsEditorOpen(true);
  }

  function handleEventClick(info: EventClickArg) {
    const schedule = schedules.find((item) => item.id === info.event.id);
    if (schedule) handleScheduleClick(schedule);
  }

  function handleDateClick(info: DateClickArg) {
    if (isBulkSelectionMode) {
      toggleBulkDate(info.dateStr.slice(0, 10));
      return;
    }
    if (isMobileLayout && calendarView === "dayGridMonth") {
      setMobileSelectedDate(info.dateStr.slice(0, 10));
      return;
    }
    openNewSchedule(
      info.dateStr.slice(0, 10),
      info.allDay ? undefined : timeFromLocalDate(info.date),
    );
  }

  function handleDatesSet(info: DatesSetArg) {
    setCalendarTitle(info.view.title);
    const logicalView = logicalCalendarView(info.view.type);
    if (logicalView) setCalendarView(logicalView);
  }

  async function saveSchedule(schedule: Schedule) {
    const nextSchedule: Schedule = {
      ...schedule,
      id: schedule.id || crypto.randomUUID(),
      session: schedule.session || deriveSession(schedule.startTime),
      assistantRequired:
        schedule.kind === "lecture" && schedule.assistantRequired,
      modifiedAt: new Date().toISOString(),
    };

    if (isSupabaseConfigured) {
      setIsSyncing(true);
      try {
        if (isAdmin) {
          await saveRemoteInstructors([
            {
              name: nextSchedule.instructor,
              color: instructorColor(nextSchedule.instructor, instructorColors),
              sortOrder: Math.max(instructors.indexOf(nextSchedule.instructor), 0),
            },
          ]);
        }
        const [saved] = await saveRemoteSchedules([nextSchedule]);
        setSchedules((items) => {
          const exists = items.some((item) => item.id === saved.id);
          return exists
            ? items.map((item) => (item.id === saved.id ? saved : item))
            : [...items, saved];
        });
        setSyncMessage("일정이 서버에 저장되었습니다.");
      } catch (error) {
        showSyncError(error, "일정을 저장하지 못했습니다.");
        setIsSyncing(false);
        return;
      }
      setIsSyncing(false);
    } else {
      setSchedules((items) => {
        const exists = items.some((item) => item.id === nextSchedule.id);
        return exists
          ? items.map((item) =>
              item.id === nextSchedule.id ? nextSchedule : item,
            )
          : [...items, nextSchedule];
      });
    }
    setIsEditorOpen(false);
    setBulkEditorDates(null);
  }

  async function saveBulkSchedules(
    template: Schedule,
    dates: string[],
    parentScheduleIds: Record<string, string>,
  ) {
    const created = dates.flatMap((date) => {
      const parentScheduleId = parentScheduleIds[date];
      const parentLecture = schedules.find(
        (item) => item.id === parentScheduleId && item.kind === "lecture",
      );
      if (template.kind === "assistant" && !parentLecture) return [];

      const nextSchedule: Schedule = parentLecture
        ? {
            ...template,
            id: crypto.randomUUID(),
            date,
            startTime: parentLecture.startTime,
            endTime: parentLecture.endTime,
            region: parentLecture.region,
            venue: parentLecture.venue,
            session:
              parentLecture.session || deriveSession(parentLecture.startTime),
            topic: parentLecture.topic,
            status: parentLecture.status,
            parentScheduleId: parentLecture.id,
            assistantRequired: false,
            modifiedAt: new Date().toISOString(),
          }
        : {
            ...template,
            id: crypto.randomUUID(),
            date,
            parentScheduleId: undefined,
            session: template.session || deriveSession(template.startTime),
            assistantRequired:
              template.kind === "lecture" && template.assistantRequired,
            modifiedAt: new Date().toISOString(),
          };
      return [nextSchedule];
    });

    if (isSupabaseConfigured) {
      setIsSyncing(true);
      try {
        if (isAdmin && created[0]) {
          await saveRemoteInstructors([
            {
              name: created[0].instructor,
              color: instructorColor(created[0].instructor, instructorColors),
              sortOrder: Math.max(instructors.indexOf(created[0].instructor), 0),
            },
          ]);
        }
        const saved = await saveRemoteSchedules(created);
        setSchedules((items) => [...items, ...saved]);
        setSyncMessage(`${saved.length}개 일정이 서버에 저장되었습니다.`);
      } catch (error) {
        showSyncError(error, "여러 일정을 저장하지 못했습니다.");
        setIsSyncing(false);
        return;
      }
      setIsSyncing(false);
    } else {
      setSchedules((items) => [...items, ...created]);
    }
    setIsEditorOpen(false);
    setBulkEditorDates(null);
    setBulkSelectedDates([]);
    setBulkSelectedScheduleIds([]);
    setIsBulkSelectionMode(false);
  }

  async function updateBulkAssistantRequirement(required: boolean) {
    const updates = schedules
      .filter(
        (schedule) =>
          bulkSelectedScheduleIds.includes(schedule.id) &&
          schedule.kind === "lecture" &&
          schedule.status !== "cancelled" &&
          canEdit(schedule),
      )
      .map((schedule) => ({
        ...schedule,
        assistantRequired: required,
        modifiedAt: new Date().toISOString(),
      }));
    if (updates.length === 0) return;

    if (isSupabaseConfigured) {
      setIsSyncing(true);
      try {
        const saved = await saveRemoteSchedules(updates);
        const savedById = new Map(saved.map((schedule) => [schedule.id, schedule]));
        setSchedules((items) =>
          items.map((item) => savedById.get(item.id) || item),
        );
        setSyncMessage(
          `${saved.length}개 본강의를 ${
            required ? "보조 필요" : "보조 불필요"
          }로 변경했습니다.`,
        );
      } catch (error) {
        showSyncError(error, "보조강사 상태를 일괄 변경하지 못했습니다.");
        setIsSyncing(false);
        return;
      }
      setIsSyncing(false);
    } else {
      const updateIds = new Set(updates.map((schedule) => schedule.id));
      const updatesById = new Map(
        updates.map((schedule) => [schedule.id, schedule]),
      );
      setSchedules((items) =>
        items.map((item) =>
          updateIds.has(item.id) ? updatesById.get(item.id) || item : item,
        ),
      );
    }
    setBulkSelectedScheduleIds([]);
  }

  async function deleteSchedule(schedule: Schedule) {
    if (isSupabaseConfigured) {
      setIsSyncing(true);
      try {
        if (isAdmin) {
          await deleteRemoteSchedule(schedule.id);
          setSchedules((items) =>
            items.filter((item) => item.id !== schedule.id),
          );
        } else if (schedule.instructor === activeInstructor) {
          const cancelled: Schedule = {
            ...schedule,
            status: "cancelled",
            modifiedAt: new Date().toISOString(),
          };
          const [saved] = await saveRemoteSchedules([cancelled]);
          setSchedules((items) =>
            items.map((item) => (item.id === saved.id ? saved : item)),
          );
        }
        setSyncMessage("일정 변경이 서버에 반영되었습니다.");
      } catch (error) {
        showSyncError(error, "일정을 삭제하지 못했습니다.");
        setIsSyncing(false);
        return;
      }
      setIsSyncing(false);
    } else if (isAdmin) {
      setSchedules((items) => items.filter((item) => item.id !== schedule.id));
    } else if (schedule.instructor === activeInstructor) {
      setSchedules((items) =>
        items.map((item) =>
          item.id === schedule.id
            ? { ...item, status: "cancelled", modifiedAt: new Date().toISOString() }
            : item,
        ),
      );
    }
    setIsEditorOpen(false);
  }

  async function parseWorkbook(file: File) {
    setIsParsing(true);
    setImportCandidates([]);
    setImportFileName(file.name);
    setImportMessage("일정표 구조와 날짜 형식을 확인하고 있습니다.");

    try {
      const ExcelJS = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      const buffer = await file.arrayBuffer();
      await workbook.xlsx.load(buffer);
      const parsed: ImportCandidate[] = [];

      workbook.eachSheet((worksheet) => {
        let headerRowNumber = 0;
        const headers = new Map<string, number>();

        for (let rowNumber = 1; rowNumber <= Math.min(10, worksheet.rowCount); rowNumber += 1) {
          const row = worksheet.getRow(rowNumber);
          const rowValues: string[] = [];
          row.eachCell({ includeEmpty: true }, (cell) => {
            rowValues.push(readCellText(cell.value));
          });
          if (rowValues.includes("날짜") && rowValues.includes("강사")) {
            headerRowNumber = rowNumber;
            row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
              headers.set(readCellText(cell.value).replace(/\s/g, ""), columnNumber);
            });
            break;
          }
        }

        if (!headerRowNumber) {
          parsed.push({
            key: `${worksheet.name}-header`,
            rowNumber: 0,
            sheetName: worksheet.name,
            action: "error",
            message: "날짜와 강사 열을 찾지 못했습니다.",
          });
          return;
        }

        const column = (label: string) => {
          const normalized = label.replace(/\s/g, "");
          const direct = headers.get(normalized);
          if (direct) return direct;
          for (const [header, index] of headers) {
            if (header.includes(normalized)) return index;
          }
          return 0;
        };

        const dateColumn = column("날짜");
        const instructorColumn = column("강사");
        const regionColumn = column("지역");
        const venueColumn = column("장소");
        const sessionColumn = column("전/후");
        const timeColumn = column("강연시간");
        const noteColumn = column("비고");

        for (
          let rowNumber = headerRowNumber + 1;
          rowNumber <= worksheet.rowCount;
          rowNumber += 1
        ) {
          const row = worksheet.getRow(rowNumber);
          const rawDate = row.getCell(dateColumn).value;
          const instructor = readCellText(row.getCell(instructorColumn).value);
          const date = parseExcelDate(rawDate, importYear);
          const rawTime = readCellText(row.getCell(timeColumn).value);
          const timeRange = parseTimeRange(rawTime);

          if (!date && !instructor && !rawTime) continue;
          if (!date || !instructor) {
            parsed.push({
              key: `${worksheet.name}-${rowNumber}`,
              rowNumber,
              sheetName: worksheet.name,
              action: "error",
              message: !date ? "날짜를 읽을 수 없습니다." : "강사명이 비어 있습니다.",
            });
            continue;
          }

          const region = readCellText(row.getCell(regionColumn).value);
          const rawVenue = readCellText(row.getCell(venueColumn).value);
          const rawSession = readCellText(row.getCell(sessionColumn).value);
          const rawNote = readCellText(row.getCell(noteColumn).value);
          const cancelled = /연기|취소/.test(rawNote);
          const pending = /미정|연기/.test(rawVenue);
          const importedKind = classifyExcelKind(rawNote, lectureKeywords);
          const sourceNote = [
            pending && rawVenue ? `원본 장소 표기: ${rawVenue}` : "",
            cancelled && rawVenue ? rawVenue : "",
          ]
            .filter(Boolean)
            .join(" · ");

          const schedule: Schedule = {
            id: "",
            date,
            startTime: timeRange?.startTime,
            endTime: timeRange?.endTime,
            instructor,
            region: region || undefined,
            venue: pending && rawVenue.includes("연기") ? undefined : rawVenue || undefined,
            session: rawSession || deriveSession(timeRange?.startTime),
            topic: rawNote || undefined,
            kind: importedKind,
            status: cancelled ? "cancelled" : pending ? "pending" : "confirmed",
            note: sourceNote || undefined,
            assistantRequired: importedKind === "lecture",
            arrivalMinutes: timeRange ? 30 : 0,
            source: "excel",
            modifiedAt: new Date().toISOString(),
          };

          parsed.push(
            classifyImportCandidate(schedule, schedules, {
              key: `${worksheet.name}-${rowNumber}`,
              rowNumber,
              sheetName: worksheet.name,
            }),
          );
        }
      });

      setImportCandidates(parsed);
      const validCount = parsed.filter((item) => item.action !== "error").length;
      setImportMessage(
        `${workbook.worksheets.length}개 시트에서 ${validCount}개 일정을 확인했습니다.`,
      );
    } catch (error) {
      setImportCandidates([]);
      setImportMessage(
        error instanceof Error
          ? `파일을 읽지 못했습니다: ${error.message}`
          : "파일을 읽지 못했습니다.",
      );
    } finally {
      setIsParsing(false);
    }
  }

  function applyLectureKeywords(nextKeywords: string[]) {
    const normalizedKeywords = normalizeLectureKeywords(nextKeywords);
    setLectureKeywords(normalizedKeywords);
    void persistWorkspaceSettings(kindColors, normalizedKeywords);
    setImportCandidates((current) =>
      current.map((candidate) => {
        if (!candidate.schedule) return candidate;
        const kind = classifyExcelKind(
          candidate.schedule.topic || "",
          normalizedKeywords,
        );
        const schedule = {
          ...candidate.schedule,
          kind,
          assistantRequired:
            kind === "lecture"
              ? candidate.schedule.kind === "lecture"
                ? candidate.schedule.assistantRequired
                : true
              : false,
        };
        return classifyImportCandidate(
          schedule,
          schedules,
          {
            key: candidate.key,
            rowNumber: candidate.rowNumber,
            sheetName: candidate.sheetName,
          },
        );
      }),
    );
    if (importCandidates.length > 0) {
      setImportMessage(
        "본강의 판별 항목을 변경하고 가져오기 결과를 다시 계산했습니다.",
      );
    }
  }

  function addLectureKeyword() {
    const keyword = lectureKeywordInput.trim();
    if (!keyword) return;
    const normalizedKeyword = keyword.toLocaleLowerCase("ko-KR");
    if (
      lectureKeywords.some(
        (item) => item.toLocaleLowerCase("ko-KR") === normalizedKeyword,
      )
    ) {
      setLectureKeywordInput("");
      return;
    }
    applyLectureKeywords([...lectureKeywords, keyword]);
    setLectureKeywordInput("");
  }

  function removeLectureKeyword(keyword: string) {
    applyLectureKeywords(
      lectureKeywords.filter((item) => item !== keyword),
    );
  }

  async function applyImport() {
    const importedInstructors = Array.from(
      new Set(
        importCandidates.flatMap((candidate) =>
          candidate.schedule ? [candidate.schedule.instructor] : [],
        ),
      ),
    );
    const nextInstructorOrder = [
      ...instructorOrder,
      ...importedInstructors.filter((name) => !instructorOrder.includes(name)),
    ];
    const changedSchedules = importCandidates.flatMap((candidate) => {
      if (!candidate.schedule) return [];
      if (candidate.action === "new") {
        return [{ ...candidate.schedule, id: crypto.randomUUID() }];
      }
      if (candidate.action === "update" && candidate.matchId) {
        return [{ ...candidate.schedule, id: candidate.matchId }];
      }
      return [];
    });

    if (isSupabaseConfigured) {
      setIsSyncing(true);
      try {
        await saveRemoteInstructors(
          nextInstructorOrder.map((name, index) => ({
            name,
            color: instructorColor(name, instructorColors),
            sortOrder: index,
          })),
        );
        await saveRemoteSchedules(changedSchedules);
        if (currentProfile) {
          await hydrateRemoteWorkspace(currentProfile.id);
        }
        setSyncMessage(
          changedSchedules.length > 0
            ? `${changedSchedules.length}개 엑셀 일정이 서버에 반영되었습니다.`
            : "변경 사항이 없어 서버 데이터를 유지했습니다.",
        );
      } catch (error) {
        setImportMessage(
          error instanceof Error
            ? `서버 반영 실패: ${error.message}`
            : "서버에 일정을 반영하지 못했습니다.",
        );
        setIsSyncing(false);
        return;
      }
      setIsSyncing(false);
    } else {
      setInstructorOrder(nextInstructorOrder);
      setSchedules((items) => {
        const next = [...items];
        changedSchedules.forEach((schedule) => {
          const index = next.findIndex((item) => item.id === schedule.id);
          if (index >= 0) next[index] = schedule;
          else next.push(schedule);
        });
        return next;
      });
    }
    const applied = importCandidates.filter(
      (item) => item.action === "new" || item.action === "update",
    ).length;
    setImportMessage(
      applied > 0
        ? `${applied}개 일정이 달력에 반영되었습니다.`
        : "변경된 내용이 없어 기존 일정을 그대로 유지했습니다.",
    );
    setImportCandidates([]);
    setImportFileName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    setIsImportOpen(false);
  }

  function toggleKind(kind: ScheduleKind) {
    setKindFilters((current) =>
      current.includes(kind)
        ? current.filter((item) => item !== kind)
        : [...current, kind],
    );
  }

  function toggleStatus(status: ScheduleStatus) {
    setStatusFilters((current) =>
      current.includes(status)
        ? current.filter((item) => item !== status)
        : [...current, status],
    );
  }

  function toggleAssistantFilter(status: AssistantAssignmentStatus) {
    setAssistantFilters((current) =>
      current.includes(status)
        ? current.filter((item) => item !== status)
        : [...current, status],
    );
  }

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const client = getSupabaseClient();
    if (!client) return;
    setIsLoginLoading(true);
    setLoginError("");
    try {
      const { error } = await client.auth.signInWithPassword({
        email: loginEmail.trim(),
        password: loginPassword,
      });
      if (error) {
        setLoginError(formatAuthError(error));
      }
    } catch (error) {
      setLoginError(formatAuthError(error));
    } finally {
      setIsLoginLoading(false);
    }
  }

  async function handleLogout() {
    const client = getSupabaseClient();
    if (!client) return;
    setIsSyncing(true);
    const { error } = await client.auth.signOut();
    if (error) showSyncError(error, "로그아웃하지 못했습니다.");
    setIsSyncing(false);
  }

  if (isSupabaseConfigured && (!authReady || !currentProfile)) {
    return (
      <AuthScreen
        ready={authReady}
        email={loginEmail}
        password={loginPassword}
        error={loginError}
        loading={isLoginLoading}
        onEmailChange={setLoginEmail}
        onPasswordChange={setLoginPassword}
        onSubmit={handleLogin}
      />
    );
  }

  return (
    <main
      className={`app-shell ${
        isMobileFiltersOpen ? "mobile-filters-open" : ""
      }`}
    >
      {isMobileFiltersOpen && (
        <button
          type="button"
          className="mobile-sidebar-backdrop"
          aria-label="필터 닫기"
          onClick={() => setIsMobileFiltersOpen(false)}
        />
      )}
      <aside
        className="sidebar"
        role={isMobileLayout ? "dialog" : undefined}
        aria-modal={isMobileLayout ? true : undefined}
        aria-label={isMobileLayout ? "일정 필터" : undefined}
      >
        <div className="brand-row">
          <div className="brand-mark">
            <CalendarDays size={20} />
          </div>
          <div>
            <strong>강사 일정 보드</strong>
            <span>사내 통합 스케줄</span>
          </div>
          <button
            type="button"
            className="mobile-sidebar-close"
            aria-label="필터 닫기"
            onClick={() => setIsMobileFiltersOpen(false)}
          >
            <X size={19} />
          </button>
        </div>

        <button className="primary-action" onClick={() => openNewSchedule()}>
          <Plus size={18} />
          일정 등록
        </button>

        <section className="filter-section">
          <div className="section-label">
            <UsersRound size={15} />
            강사
          </div>
          <label className="select-wrap">
            <select
              value={instructorFilter}
              onChange={(event) => setInstructorFilter(event.target.value)}
            >
              <option value="all">전체 강사</option>
              {instructors.map((instructor) => (
                <option value={instructor} key={instructor}>
                  {instructor}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="filter-section instructor-color-section">
          <div className="section-label">
            <Palette size={15} />
            강사별 색상
          </div>
          {hydrated ? (
            <DndContext
              sensors={dragSensors}
              collisionDetection={closestCenter}
              onDragEnd={handleInstructorDragEnd}
            >
              <SortableContext
                items={colorSettingInstructors}
                strategy={verticalListSortingStrategy}
              >
                <div className="instructor-color-list">
                  {colorSettingInstructors.map((instructor) => (
                    <SortableInstructorColorRow
                      key={instructor}
                      instructor={instructor}
                      color={instructorColor(instructor, instructorColors)}
                      canChangeColor={
                        isAdmin ||
                        (!isSupabaseConfigured && instructor === activeInstructor)
                      }
                      canReorder={isAdmin && instructorFilter === "all"}
                      onColorChange={(color) => {
                        const nextColors = {
                          ...instructorColors,
                          [instructor]: color,
                        };
                        setInstructorColors(nextColors);
                        void persistInstructorConfiguration(
                          instructors,
                          nextColors,
                        );
                      }}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <div className="instructor-color-list" aria-hidden="true">
              {colorSettingInstructors.map((instructor) => (
                <div className="instructor-color-row" key={instructor}>
                  <button className="drag-handle" type="button" disabled>
                    <GripVertical size={18} />
                  </button>
                  <span
                    className="instructor-color-preview"
                    style={{
                      background: instructorColor(instructor, instructorColors),
                    }}
                  />
                  <span className="instructor-name">{instructor}</span>
                  <input
                    type="color"
                    value={instructorColor(instructor, instructorColors)}
                    disabled
                  />
                </div>
              ))}
            </div>
          )}
          <small className="color-setting-help">
            {instructorFilter !== "all"
              ? "선택한 강사의 달력 색상을 지정하세요."
              : isAdmin
              ? "손잡이로 순서를 바꾸고, 색상 칸에서 달력 색상을 지정하세요."
              : "내 강사 색상만 변경할 수 있습니다."}
          </small>
        </section>

        <section className="filter-section">
          <div className="section-label with-actions">
            <span className="section-label-title">
              <Filter size={15} />
              일정 종류
            </span>
            <span className="filter-bulk-actions">
              <button
                type="button"
                onClick={() =>
                  setKindFilters(
                    kindFilters.length === Object.keys(KIND_META).length
                      ? []
                      : (Object.keys(KIND_META) as ScheduleKind[]),
                  )
                }
              >
                {kindFilters.length === Object.keys(KIND_META).length
                  ? "전체 해제"
                  : "전체 선택"}
              </button>
            </span>
          </div>
          <div className="kind-filter-list">
            {(Object.keys(KIND_META) as ScheduleKind[]).map((kind) => {
              const meta = KIND_META[kind];
              const color = kindColors[kind];
              const checked = kindFilters.includes(kind);
              return (
                <div className="kind-filter-row" key={kind}>
                  <label className="filter-check">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleKind(kind)}
                    />
                    <span
                      className="check-box"
                      style={{
                        background: checked ? color : "transparent",
                        borderColor: checked ? color : "#cbd5e1",
                      }}
                    >
                      {checked && <Check size={12} />}
                    </span>
                    <span className="kind-dot" style={{ background: color }} />
                    {meta.label}
                    <span className="filter-count">
                      {kindCounts[kind]}
                    </span>
                  </label>
                  <input
                    className="kind-color-input"
                    type="color"
                    value={color}
                    disabled={!isAdmin}
                    aria-label={`${meta.label} 색상 선택`}
                    title={
                      isAdmin
                        ? `${meta.label} 색상 선택`
                        : "전체 관리자만 변경할 수 있습니다"
                    }
                    onChange={(event) => {
                      const nextColors = {
                        ...kindColors,
                        [kind]: event.target.value,
                      };
                      setKindColors(nextColors);
                      void persistWorkspaceSettings(
                        nextColors,
                        lectureKeywords,
                      );
                    }}
                  />
                </div>
              );
            })}
          </div>
        </section>

        <section className="filter-section">
          <div className="section-label with-actions">
            <span className="section-label-title">
              <CircleAlert size={15} />
              일정 상태
            </span>
            <span className="filter-bulk-actions">
              <button
                type="button"
                onClick={() =>
                  setStatusFilters(
                    statusFilters.length === Object.keys(STATUS_META).length
                      ? []
                      : (Object.keys(STATUS_META) as ScheduleStatus[]),
                  )
                }
              >
                {statusFilters.length === Object.keys(STATUS_META).length
                  ? "전체 해제"
                  : "전체 선택"}
              </button>
            </span>
          </div>
          <div className="status-filter-list">
            {(Object.keys(STATUS_META) as ScheduleStatus[]).map((status) => {
              const meta = STATUS_META[status];
              const checked = statusFilters.includes(status);
              return (
                <label className="filter-check" key={status}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleStatus(status)}
                  />
                  <span
                    className="check-box"
                    style={{
                      background: checked ? meta.color : "transparent",
                      borderColor: checked ? meta.color : "#cbd5e1",
                    }}
                  >
                    {checked && <Check size={12} />}
                  </span>
                  <span className="kind-dot" style={{ background: meta.color }} />
                  {meta.label}
                  <span className="filter-count">
                    {statusCounts[status]}
                  </span>
                </label>
              );
            })}
          </div>
          <small className="status-filter-help">
            장소가 미정·연기이거나 직접 상태를 지정한 일정은 확인 필요로
            표시됩니다.
          </small>
        </section>

        <section className="filter-section">
          <div className="section-label with-actions">
            <span className="section-label-title">
              <Link2 size={15} />
              보조강사
            </span>
            <span className="filter-bulk-actions">
              <button
                type="button"
                onClick={() =>
                  setAssistantFilters(
                    assistantFilters.length ===
                      ASSISTANT_ASSIGNMENT_STATUSES.length
                      ? []
                      : [...ASSISTANT_ASSIGNMENT_STATUSES],
                  )
                }
              >
                {assistantFilters.length ===
                ASSISTANT_ASSIGNMENT_STATUSES.length
                  ? "전체 해제"
                  : "전체 선택"}
              </button>
            </span>
          </div>
          <div className="status-filter-list">
            {ASSISTANT_ASSIGNMENT_STATUSES.map((status) => {
              const meta = ASSISTANT_ASSIGNMENT_META[status];
              const checked = assistantFilters.includes(status);
              return (
                <label className="filter-check" key={status}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleAssistantFilter(status)}
                  />
                  <span
                    className="check-box"
                    style={{
                      background: checked ? meta.color : "transparent",
                      borderColor: checked ? meta.color : "#cbd5e1",
                    }}
                  >
                    {checked && <Check size={12} />}
                  </span>
                  <span className="kind-dot" style={{ background: meta.color }} />
                  {meta.label}
                  <span className="filter-count">
                    {assistantCounts[status]}
                  </span>
                </label>
              );
            })}
          </div>
          <small className="status-filter-help">
            취소되지 않은 연결 보조강의가 한 건 이상이면 배정 완료입니다.
          </small>
        </section>

        <section className="today-card">
          <span className="eyebrow">오늘의 일정</span>
          <strong>{todaySchedules.length}건</strong>
          <div className="today-stack">
            {todaySchedules.length ? (
              todaySchedules.slice(0, 3).map((schedule) => (
                <button
                  key={schedule.id}
                  onClick={() => {
                    setEditorSchedule(schedule);
                    setBulkEditorDates(null);
                    setIsEditorOpen(true);
                  }}
                >
                  <span
                    style={{
                      background: instructorColor(
                        schedule.instructor,
                        instructorColors,
                      ),
                    }}
                  />
                  <div>
                    <b>{schedule.instructor}</b>
                    <small>
                      {[
                        schedule.startTime || "종일",
                        schedule.topic || KIND_META[schedule.kind].label,
                        regionText(schedule),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                  </div>
                </button>
              ))
            ) : (
              <p>조건에 맞는 오늘 일정이 없습니다.</p>
            )}
          </div>
        </section>

      </aside>

      <section className="workspace">
        <header className="topbar">
          <button
            type="button"
            className="mobile-filter-button"
            aria-label="필터 열기"
            onClick={() => setIsMobileFiltersOpen(true)}
          >
            <Filter size={19} />
          </button>
          <div className="search-box">
            <Search size={17} />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="강사, 지역, 장소 검색"
              aria-label="일정 검색"
            />
            {searchQuery && (
              <button aria-label="검색 지우기" onClick={() => setSearchQuery("")}>
                <X size={15} />
              </button>
            )}
          </div>
          <div className="topbar-spacer" />
          {isSupabaseConfigured ? (
            <>
              <span
                className={`prototype-badge server-badge ${
                  isSyncing ? "is-syncing" : ""
                }`}
                title={syncMessage || "Supabase 서버 연결됨"}
              >
                {isSyncing ? (
                  <LoaderCircle size={14} className="spin" />
                ) : (
                  <Cloud size={14} />
                )}
                {isSyncing ? "동기화 중" : "서버 연결"}
              </span>
              <div className="account-chip">
                <ShieldCheck size={17} />
                <span>
                  <b>
                    {currentProfile?.displayName ||
                      currentProfile?.instructorName ||
                      currentProfile?.email}
                  </b>
                  <small>
                    {isAdmin
                      ? "전체 관리자"
                      : activeInstructor
                        ? `${activeInstructor} 강사`
                        : "강사 연결 필요"}
                  </small>
                </span>
                <button
                  type="button"
                  aria-label="로그아웃"
                  title="로그아웃"
                  onClick={() => void handleLogout()}
                >
                  <LogOut size={16} />
                </button>
              </div>
            </>
          ) : (
            <>
              <span className="prototype-badge">로컬 프로토타입</span>
              <label className="role-switcher">
                <ShieldCheck size={17} />
                <select
                  value={roleKey}
                  onChange={(event) => setRoleKey(event.target.value as RoleKey)}
                  aria-label="권한 미리보기"
                >
                  <option value="admin">전체 관리자</option>
                  {instructors.map((instructor) => (
                    <option key={instructor} value={`instructor:${instructor}`}>
                      {instructor} 강사
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
        </header>

        <div className="dashboard-strip">
          <div className="strip-heading">
            <p>통합 일정</p>
            <h1>{calendarTitle}</h1>
          </div>
          <button
            type="button"
            className="mini-stat"
            onClick={showCurrentWeek}
            title="현재 필터가 적용된 일요일~토요일 일정을 봅니다"
          >
            <span>이번 주</span>
            <b>{weekCount}</b>
            <small>개 일정</small>
          </button>
        </div>

        <div className="calendar-card">
          <div className="calendar-toolbar">
            <div className="calendar-nav">
              <button
                className="icon-button"
                aria-label="이전 기간"
                onClick={() => calendarRef.current?.getApi().prev()}
              >
                <ChevronLeft size={18} />
              </button>
              <button
                className="today-button"
                onClick={() => calendarRef.current?.getApi().today()}
              >
                오늘
              </button>
              <button
                className="icon-button"
                aria-label="다음 기간"
                onClick={() => calendarRef.current?.getApi().next()}
              >
                <ChevronRight size={18} />
              </button>
            </div>

            <div className="view-switch" aria-label="달력 보기 선택">
              {(
                [
                  ["dayGridMonth", "월"],
                  ["timeGridWeek", "주"],
                  ["timeGridDay", "일"],
                ] as [CalendarView, string][]
              ).map(([view, label]) => (
                <button
                  key={view}
                  className={calendarView === view ? "active" : ""}
                  onClick={() => changeView(view)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="toolbar-actions">
              <button
                className={`bulk-select-button ${
                  isBulkSelectionMode ? "active" : ""
                }`}
                aria-pressed={isBulkSelectionMode}
                onClick={toggleBulkSelectionMode}
              >
                <ListPlus size={17} />
                {isBulkSelectionMode ? "선택 모드 종료" : "여러 항목 선택"}
              </button>
              <button
                className="excel-button"
                onClick={() => setIsImportOpen(true)}
                disabled={!isAdmin}
                title={isAdmin ? "엑셀 일정 가져오기" : "전체 관리자만 사용할 수 있습니다"}
              >
                <FileSpreadsheet size={17} />
                엑셀 가져오기
              </button>
            </div>
          </div>

          {isBulkSelectionMode && (
            <div className="bulk-selection-bar">
              <div>
                <ListPlus size={19} />
                <p>
                  <strong>
                    {bulkSelectedDates.length}개 날짜 ·{" "}
                    {bulkSelectedScheduleIds.length}개 본강의 선택
                  </strong>
                  <span>
                    빈 날짜는 일괄 등록, 본강의 일정은 보조 상태 변경에 사용합니다.
                  </span>
                </p>
              </div>
              <div className="bulk-selection-actions">
                <button
                  className="secondary-button"
                  disabled={
                    bulkSelectedDates.length === 0 &&
                    bulkSelectedScheduleIds.length === 0
                  }
                  onClick={() => {
                    setBulkSelectedDates([]);
                    setBulkSelectedScheduleIds([]);
                  }}
                >
                  선택 해제
                </button>
                <button
                  className="secondary-button"
                  disabled={bulkSelectedScheduleIds.length === 0}
                  onClick={() => void updateBulkAssistantRequirement(true)}
                >
                  보조 필요
                </button>
                <button
                  className="secondary-button"
                  disabled={bulkSelectedScheduleIds.length === 0}
                  onClick={() => void updateBulkAssistantRequirement(false)}
                >
                  보조 불필요
                </button>
                <button
                  className="primary-button"
                  disabled={bulkSelectedDates.length === 0}
                  onClick={openBulkScheduleEditor}
                >
                  {bulkSelectedDates.length > 0
                    ? `${bulkSelectedDates.length}개 날짜 일괄 등록`
                    : "날짜를 선택하세요"}
                </button>
              </div>
            </div>
          )}

          <div className="calendar-stage">
            <FullCalendar
              ref={calendarRef}
              plugins={[
                dayGridPlugin,
                timeGridPlugin,
                listPlugin,
                interactionPlugin,
              ]}
              initialView="dayGridMonth"
              initialDate={TODAY}
              headerToolbar={false}
              locale="ko"
              noEventsContent="표시할 일정이 없습니다."
              firstDay={0}
              height={isMobileLayout ? "auto" : "100%"}
              expandRows={!isMobileLayout}
              nowIndicator
              navLinks={false}
              selectable
              dayMaxEvents={isMobileLayout ? 4 : 3}
              moreLinkText={(count) => `+${count}개`}
              allDayText="시간 미정·종일"
              slotMinTime="08:00:00"
              slotMaxTime="23:30:00"
              slotDuration="00:30:00"
              slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
              eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
              events={calendarEvents}
              eventOrder="start,instructorRank"
              eventOrderStrict
              dayCellClassNames={(info) => {
                const date = isoFromLocalDate(info.date);
                return [
                  ...(bulkSelectedDates.includes(date)
                    ? ["bulk-selected-day"]
                    : []),
                  ...(isMobileLayout &&
                  calendarView === "dayGridMonth" &&
                  mobileSelectedDate === date
                    ? ["mobile-selected-day"]
                    : []),
                ];
              }}
              dateClick={handleDateClick}
              eventClick={handleEventClick}
              datesSet={handleDatesSet}
              eventDrop={(info) => {
                const schedule = schedules.find((item) => item.id === info.event.id);
                if (!schedule || !canEdit(schedule) || !info.event.start) {
                  info.revert();
                  return;
                }
                const nextDate = isoFromLocalDate(info.event.start);
                const updated: Schedule = {
                  ...schedule,
                  date: nextDate,
                  startTime: info.event.allDay
                    ? undefined
                    : timeFromLocalDate(info.event.start),
                  endTime:
                    info.event.allDay || !info.event.end
                      ? undefined
                      : timeFromLocalDate(info.event.end),
                  modifiedAt: new Date().toISOString(),
                };
                if (isSupabaseConfigured) {
                  setIsSyncing(true);
                  void saveRemoteSchedules([updated])
                    .then(([saved]) => {
                      setSchedules((items) =>
                        items.map((item) =>
                          item.id === saved.id ? saved : item,
                        ),
                      );
                      setSyncMessage("이동한 일정이 서버에 저장되었습니다.");
                    })
                    .catch((error: unknown) => {
                      info.revert();
                      showSyncError(error, "일정 이동을 저장하지 못했습니다.");
                    })
                    .finally(() => setIsSyncing(false));
                } else {
                  setSchedules((items) =>
                    items.map((item) =>
                      item.id === schedule.id ? updated : item,
                    ),
                  );
                }
              }}
              eventContent={(content: EventContentArg) => {
                const schedule = content.event.extendedProps.schedule as Schedule;
                const kindColor = content.event.extendedProps.kindColor as string;
                const assistantStatus = content.event.extendedProps
                  .assistantStatus as AssistantAssignmentStatus | null;
                const meta = KIND_META[schedule.kind];
                const eventColor = instructorColor(
                  schedule.instructor,
                  instructorColors,
                );
                return (
                  <div
                    className={`calendar-event-content ${
                      content.view.type === "dayGridMonth"
                        ? "month-event-content"
                        : content.view.type === "listWeek"
                          ? "list-event-content"
                          : "time-event-content"
                    }`}
                    style={{ "--event-color": eventColor } as React.CSSProperties}
                  >
                    <span
                      className="event-kind-badge"
                      style={
                        {
                          "--badge-color": kindColor,
                        } as React.CSSProperties
                      }
                    >
                      {meta.label}
                    </span>
                    {schedule.status !== "confirmed" && (
                      <span
                        className="event-kind-badge event-status-badge"
                        style={
                          {
                            "--badge-color": STATUS_META[schedule.status].color,
                          } as React.CSSProperties
                        }
                      >
                        {STATUS_META[schedule.status].label}
                      </span>
                    )}
                    {(assistantStatus === "unassigned" ||
                      assistantStatus === "not_required") && (
                      <span
                        className="event-kind-badge event-assistant-badge"
                        style={
                          {
                            "--badge-color":
                              ASSISTANT_ASSIGNMENT_META[assistantStatus].color,
                          } as React.CSSProperties
                        }
                      >
                        {ASSISTANT_ASSIGNMENT_META[assistantStatus].label}
                      </span>
                    )}
                    <b>{schedule.instructor}</b>
                    <span className="event-topic">
                      {schedule.topic || meta.label}
                    </span>
                    {regionText(schedule) && (
                      <span className="event-region">{regionText(schedule)}</span>
                    )}
                    <span className="event-time">
                      {schedule.startTime ||
                        (schedule.kind === "off" ? "종일" : "시간 미정")}
                    </span>
                  </div>
                );
              }}
            />
          </div>

          {isMobileLayout && calendarView === "dayGridMonth" && (
            <section className="mobile-day-agenda" aria-live="polite">
              <div className="mobile-agenda-heading">
                <div>
                  <span>선택한 날짜</span>
                  <strong>
                    {new Intl.DateTimeFormat("ko-KR", {
                      month: "long",
                      day: "numeric",
                      weekday: "long",
                    }).format(new Date(`${mobileSelectedDate}T00:00:00`))}
                  </strong>
                </div>
                <b>{mobileSelectedSchedules.length}건</b>
              </div>

              <div className="mobile-agenda-list">
                {mobileSelectedSchedules.length ? (
                  mobileSelectedSchedules.map((schedule) => (
                    <button
                      type="button"
                      className={`mobile-agenda-event schedule-${schedule.status}`}
                      key={schedule.id}
                      style={
                        {
                          "--instructor-color": instructorColor(
                            schedule.instructor,
                            instructorColors,
                          ),
                        } as React.CSSProperties
                      }
                      onClick={() => handleScheduleClick(schedule)}
                    >
                      <span className="mobile-agenda-time">
                        {schedule.startTime ||
                          (schedule.kind === "off" ? "종일" : "미정")}
                      </span>
                      <span className="mobile-agenda-copy">
                        <strong>{schedule.instructor}</strong>
                        <span>{schedule.topic || KIND_META[schedule.kind].label}</span>
                        {regionText(schedule) && <small>{regionText(schedule)}</small>}
                      </span>
                      <span
                        className="mobile-agenda-kind"
                        style={{ background: kindColors[schedule.kind] }}
                      >
                        {KIND_META[schedule.kind].label}
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="mobile-agenda-empty">
                    현재 필터에 맞는 일정이 없습니다.
                  </p>
                )}
              </div>
            </section>
          )}
        </div>

        <nav className="mobile-action-bar" aria-label="모바일 빠른 작업">
          <button type="button" onClick={() => setIsMobileFiltersOpen(true)}>
            <Filter size={19} />
            <span>필터</span>
          </button>
          <button type="button" onClick={openScheduleForVisibleDate}>
            <Plus size={20} />
            <span>등록</span>
          </button>
          <button
            type="button"
            className={isBulkSelectionMode ? "active" : ""}
            aria-pressed={isBulkSelectionMode}
            onClick={toggleBulkSelectionMode}
          >
            <ListPlus size={19} />
            <span>복수 선택</span>
          </button>
          <button
            type="button"
            disabled={!isAdmin}
            onClick={() => setIsImportOpen(true)}
          >
            <FileSpreadsheet size={19} />
            <span>엑셀</span>
          </button>
        </nav>
      </section>

      {isEditorOpen && editorSchedule && (
        <ScheduleEditor
          key={`${editorSchedule.id || "new"}-${editorSchedule.date}`}
          schedule={editorSchedule}
          instructors={instructors}
          mainLectures={mainLectures}
          bulkDates={bulkEditorDates || undefined}
          kindColors={kindColors}
          isAdmin={isAdmin}
          editable={canEdit(editorSchedule)}
          currentInstructor={activeInstructor}
          assistantStatus={assistantAssignmentStatus(
            { ...editorSchedule, assistantRequired: true },
            schedules,
          )}
          onClose={() => setIsEditorOpen(false)}
          onSave={saveSchedule}
          onBulkSave={saveBulkSchedules}
          onDelete={deleteSchedule}
        />
      )}

      {isImportOpen && (
        <div className="modal-layer" role="presentation">
          <button
            className="modal-backdrop"
            aria-label="엑셀 가져오기 닫기"
            onClick={() => setIsImportOpen(false)}
          />
          <section className="import-modal" role="dialog" aria-modal="true" aria-label="엑셀 일정 가져오기">
            <div className="modal-header">
              <div className="modal-title-row">
                <div className="modal-icon excel">
                  <FileSpreadsheet size={21} />
                </div>
                <div>
                  <span>표준 일정표</span>
                  <h2>엑셀 일정 가져오기</h2>
                </div>
              </div>
              <button className="icon-button" aria-label="닫기" onClick={() => setIsImportOpen(false)}>
                <X size={19} />
              </button>
            </div>

            <div className="import-settings">
              <label>
                <span>기준 연도</span>
                <input
                  type="number"
                  value={importYear}
                  min={2020}
                  max={2100}
                  onChange={(event) => setImportYear(Number(event.target.value))}
                />
                <small>
                  엑셀 날짜에 연도가 없을 때만 사용합니다. 예: 08월 03일
                </small>
              </label>
              <div className="import-auto-rule">
                <span>자동 분류 규칙</span>
                <strong>항목 일치 → 본강의 · 나머지 → 기타</strong>
                <small>
                  비고에 연기 또는 취소가 있으면 일정 상태는 취소가 됩니다.
                </small>
              </div>
              <div className="import-keyword-setting">
                <div className="import-keyword-heading">
                  <div>
                    <span>본강의 판별 항목</span>
                    <small>비고에 아래 항목이 포함된 행만 본강의로 분류합니다.</small>
                  </div>
                  <b>{lectureKeywords.length}개</b>
                </div>
                <div className="import-keyword-chips">
                  {lectureKeywords.length > 0 ? (
                    lectureKeywords.map((keyword) => (
                      <span key={keyword}>
                        {keyword}
                        <button
                          type="button"
                          aria-label={`${keyword} 항목 삭제`}
                          onClick={() => removeLectureKeyword(keyword)}
                        >
                          <X size={13} />
                        </button>
                      </span>
                    ))
                  ) : (
                    <small>등록된 항목이 없어 모든 행이 기타로 분류됩니다.</small>
                  )}
                </div>
                <form
                  className="import-keyword-entry"
                  onSubmit={(event) => {
                    event.preventDefault();
                    addLectureKeyword();
                  }}
                >
                  <input
                    value={lectureKeywordInput}
                    aria-label="추가할 본강의 판별 항목"
                    placeholder="추가할 항목 입력"
                    onChange={(event) =>
                      setLectureKeywordInput(event.target.value)
                    }
                  />
                  <button
                    type="submit"
                    className="secondary-button"
                    disabled={!lectureKeywordInput.trim()}
                  >
                    <Plus size={16} />
                    추가
                  </button>
                </form>
              </div>
            </div>

            <label className={`upload-zone ${isParsing ? "is-loading" : ""}`}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xlsm"
                disabled={isParsing}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void parseWorkbook(file);
                }}
              />
              <div className="upload-icon">
                <Upload size={22} />
              </div>
              <div>
                <strong>{isParsing ? "일정표 분석 중..." : importFileName || "엑셀 파일을 선택하세요"}</strong>
                <span>.xlsx 표준 일정표 · 날짜와 시간을 자동 정리합니다.</span>
              </div>
              <em>파일 선택</em>
            </label>

            <div className="import-summary-line">
              <CircleAlert size={16} />
              <span>{importMessage}</span>
            </div>

            {importCandidates.length > 0 && (
              <>
                <div className="import-counts">
                  {(
                    [
                      ["new", "신규"],
                      ["update", "수정"],
                      ["unchanged", "변경 없음"],
                      ["error", "확인 필요"],
                    ] as [ImportAction, string][]
                  ).map(([action, label]) => (
                    <div className={`import-count ${action}`} key={action}>
                      <span>{label}</span>
                      <b>{importCandidates.filter((item) => item.action === action).length}</b>
                    </div>
                  ))}
                </div>
                <div className="preview-table-wrap">
                  <table className="preview-table">
                    <thead>
                      <tr>
                        <th>결과</th>
                        <th>행</th>
                        <th>날짜</th>
                        <th>강사</th>
                        <th>종류</th>
                        <th>시간</th>
                        <th>지역·장소</th>
                        <th>설명</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importCandidates.slice(0, 80).map((candidate) => (
                        <tr key={candidate.key}>
                          <td>
                            <span className={`action-pill ${candidate.action}`}>
                              {candidate.action === "new" && "신규"}
                              {candidate.action === "update" && "수정"}
                              {candidate.action === "unchanged" && "동일"}
                              {candidate.action === "error" && "확인"}
                            </span>
                          </td>
                          <td>{candidate.rowNumber || "-"}</td>
                          <td>{candidate.schedule?.date || "-"}</td>
                          <td>{candidate.schedule?.instructor || "-"}</td>
                          <td>
                            {candidate.schedule
                              ? KIND_META[candidate.schedule.kind].label
                              : "-"}
                          </td>
                          <td>
                            {candidate.schedule?.startTime
                              ? `${candidate.schedule.startTime}–${candidate.schedule.endTime}`
                              : "-"}
                          </td>
                          <td>
                            {[candidate.schedule?.region, candidate.schedule?.venue]
                              .filter(Boolean)
                              .join(" · ") || "-"}
                          </td>
                          <td>{candidate.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div className="modal-footer">
              <button className="secondary-button" onClick={() => setIsImportOpen(false)}>
                닫기
              </button>
              <button
                className="primary-button"
                disabled={
                  isParsing ||
                  !importCandidates.some(
                    (item) => item.action !== "error" && item.schedule,
                  )
                }
                onClick={applyImport}
              >
                <Check size={17} />
                일정 반영
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function AuthScreen({
  ready,
  email,
  password,
  error,
  loading,
  onEmailChange,
  onPasswordChange,
  onSubmit,
}: {
  ready: boolean;
  email: string;
  password: string;
  error: string;
  loading: boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-brand-mark">
          <CalendarDays size={28} />
        </div>
        <div className="auth-heading">
          <span>사내 통합 스케줄</span>
          <h1>강사 일정 보드</h1>
          <p>회사에서 발급받은 계정으로 로그인하세요.</p>
        </div>

        {!ready ? (
          <div className="auth-loading">
            <LoaderCircle size={23} className="spin" />
            서버 연결을 확인하고 있습니다.
          </div>
        ) : (
          <form className="auth-form" onSubmit={onSubmit}>
            <label>
              <span>이메일</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                placeholder="name@company.com"
                required
                onChange={(event) => onEmailChange(event.target.value)}
              />
            </label>
            <label>
              <span>비밀번호</span>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                required
                minLength={6}
                onChange={(event) => onPasswordChange(event.target.value)}
              />
            </label>
            {error && <div className="auth-error">{error}</div>}
            <button type="submit" disabled={loading}>
              {loading ? (
                <LoaderCircle size={18} className="spin" />
              ) : (
                <ShieldCheck size={18} />
              )}
              {loading ? "로그인 중..." : "로그인"}
            </button>
            <small>
              회원가입은 열려 있지 않습니다. 계정 생성과 권한 설정은 전체
              관리자가 담당합니다.
            </small>
          </form>
        )}
      </section>
    </main>
  );
}

function SortableInstructorColorRow({
  instructor,
  color,
  canChangeColor,
  canReorder,
  onColorChange,
}: {
  instructor: string;
  color: string;
  canChangeColor: boolean;
  canReorder: boolean;
  onColorChange: (color: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: instructor, disabled: !canReorder });

  return (
    <div
      ref={setNodeRef}
      className={`instructor-color-row ${
        canChangeColor ? "" : "is-locked"
      } ${isDragging ? "is-dragging" : ""}`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <button
        type="button"
        className="drag-handle"
        disabled={!canReorder}
        aria-label={`${instructor} 강사 순서 이동`}
        title={canReorder ? "드래그해서 강사 순서 변경" : "전체 관리자만 변경 가능"}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={18} />
      </button>
      <span
        className="instructor-color-preview"
        style={{ background: color }}
      />
      <span className="instructor-name">{instructor}</span>
      <input
        type="color"
        value={color}
        disabled={!canChangeColor}
        aria-label={`${instructor} 강사 색상 선택`}
        title={
          canChangeColor
            ? `${instructor} 강사 색상 선택`
            : "본인 색상만 변경할 수 있습니다"
        }
        onChange={(event) => onColorChange(event.target.value)}
      />
    </div>
  );
}

function ScheduleEditor({
  schedule,
  instructors,
  mainLectures,
  bulkDates,
  kindColors,
  isAdmin,
  editable,
  currentInstructor,
  assistantStatus,
  onClose,
  onSave,
  onBulkSave,
  onDelete,
}: {
  schedule: Schedule;
  instructors: string[];
  mainLectures: Schedule[];
  bulkDates?: string[];
  kindColors: Record<ScheduleKind, string>;
  isAdmin: boolean;
  editable: boolean;
  currentInstructor?: string;
  assistantStatus: AssistantAssignmentStatus | null;
  onClose: () => void;
  onSave: (schedule: Schedule) => void;
  onBulkSave: (
    schedule: Schedule,
    dates: string[],
    parentScheduleIds: Record<string, string>,
  ) => void;
  onDelete: (schedule: Schedule) => void;
}) {
  const [form, setForm] = useState(schedule);
  const [bulkParentScheduleIds, setBulkParentScheduleIds] = useState<
    Record<string, string>
  >({});
  const isNew = !schedule.id;
  const isBulk = Boolean(bulkDates?.length);
  const [showDetails, setShowDetails] = useState(!isNew);
  const [attemptedSave, setAttemptedSave] = useState(false);
  const isOff = form.kind === "off";
  const isOffice = form.kind === "office";
  const isOther = form.kind === "other";
  const isAssistant = form.kind === "assistant";
  const isBulkAssistant = isBulk && isAssistant;
  const displayedAssistantStatus: AssistantAssignmentStatus =
    !form.assistantRequired
      ? "not_required"
      : assistantStatus === "assigned"
        ? "assigned"
        : "unassigned";
  const availableMainLectures = useMemo(
    () =>
      mainLectures.filter(
        (lecture) =>
          lecture.id !== schedule.id && lecture.date === form.date,
      ),
    [form.date, mainLectures, schedule.id],
  );
  const selectedMainLecture = availableMainLectures.find(
    (lecture) => lecture.id === form.parentScheduleId,
  );
  const hasAllBulkParentLectures = Boolean(
    bulkDates?.every((date) => {
      const selectedId = bulkParentScheduleIds[date];
      return mainLectures.some(
        (lecture) =>
          lecture.id === selectedId &&
          lecture.date === date &&
          lecture.status !== "cancelled",
      );
    }),
  );
  const hasPartialTime = Boolean(form.startTime) !== Boolean(form.endTime);
  const hasInvalidTime = Boolean(
    form.startTime && form.endTime && form.endTime <= form.startTime,
  );
  const needsOtherDescription = isOther && !form.topic?.trim();
  const needsParentLecture =
    isAssistant &&
    (isBulk ? !hasAllBulkParentLectures : !selectedMainLecture);
  const canSubmit = Boolean(
    form.date &&
      form.instructor &&
      !needsOtherDescription &&
      !needsParentLecture &&
      !hasPartialTime &&
      !hasInvalidTime,
  );
  const arrivalTime = calculateArrival(form.startTime, form.arrivalMinutes);
  const lockedInstructor = !isAdmin && currentInstructor;

  function update<K extends keyof Schedule>(key: K, value: Schedule[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function chooseKind(kind: ScheduleKind) {
    if (kind === "assistant" && bulkDates) {
      const automaticParents = Object.fromEntries(
        bulkDates.flatMap((date) => {
          const candidates = mainLectures.filter(
            (lecture) =>
              lecture.date === date && lecture.status !== "cancelled",
          );
          return candidates.length === 1 ? [[date, candidates[0].id]] : [];
        }),
      );
      setBulkParentScheduleIds(automaticParents);
    } else if (kind !== "assistant") {
      setBulkParentScheduleIds({});
    }
    setForm((current) => ({
      ...current,
      kind,
      assistantRequired:
        kind === "lecture"
          ? current.kind === "lecture"
            ? current.assistantRequired
            : true
          : false,
      ...(kind !== "assistant" ? { parentScheduleId: undefined } : {}),
      ...(kind === "office" ? { region: undefined } : {}),
      ...(kind === "off"
        ? {
            startTime: undefined,
            endTime: undefined,
            region: undefined,
            venue: undefined,
            session: "종일",
            arrivalMinutes: 0,
          }
        : {}),
    }));
  }

  function chooseParentLecture(parentScheduleId: string) {
    const parentLecture = availableMainLectures.find(
      (lecture) => lecture.id === parentScheduleId,
    );
    if (!parentLecture) {
      update("parentScheduleId", undefined);
      return;
    }
    setForm((current) => ({
      ...current,
      parentScheduleId: parentLecture.id,
      date: parentLecture.date,
      startTime: parentLecture.startTime,
      endTime: parentLecture.endTime,
      region: parentLecture.region,
      venue: parentLecture.venue,
      session: parentLecture.session || deriveSession(parentLecture.startTime),
      topic: parentLecture.topic,
      status: parentLecture.status,
    }));
  }

  function submit() {
    setAttemptedSave(true);
    if (!canSubmit) return;
    const normalizedForm: Schedule = {
      ...form,
      assistantRequired:
        form.kind === "lecture" && form.assistantRequired,
      ...(form.kind === "office" || form.kind === "off"
        ? { region: undefined }
        : {}),
    };
    if (isBulk && bulkDates) {
      onBulkSave(normalizedForm, bulkDates, bulkParentScheduleIds);
      return;
    }
    onSave(normalizedForm);
  }

  return (
    <div className="drawer-layer" role="presentation">
      <button className="drawer-backdrop" aria-label="일정 닫기" onClick={onClose} />
      <section className="schedule-drawer" role="dialog" aria-modal="true" aria-label="일정 상세">
        <div className="drawer-header">
          <div>
            <span>{isBulk ? "여러 날짜 일정" : isNew ? "새로운 일정" : "일정 상세"}</span>
            <h2>
              {isBulk
                ? `${bulkDates?.length || 0}개 날짜 일괄 등록`
                : isNew
                  ? "일정 등록"
                  : form.topic || KIND_META[form.kind].label}
            </h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="닫기">
            <X size={19} />
          </button>
        </div>

        {!editable && (
          <div className="permission-notice">
            <ShieldCheck size={17} />
            다른 강사의 일정은 조회만 가능합니다.
          </div>
        )}

        <div className="drawer-body">
          <div className="form-section-heading">
            <div>
              <span>필수 정보</span>
              <strong>
                {isBulk
                  ? "선택한 날짜에 공통으로 적용할 내용을 입력하세요"
                  : "일정의 핵심 내용부터 입력하세요"}
              </strong>
            </div>
            <small>* 기타 일정 내용은 필수입니다.</small>
          </div>

          <div className="field full">
            <span>일정 종류</span>
            <div className="kind-choice-grid">
              {(Object.keys(KIND_META) as ScheduleKind[]).map((kind) => {
                const active = form.kind === kind;
                return (
                  <button
                    key={kind}
                    type="button"
                    disabled={!editable}
                    className={active ? "active" : ""}
                    style={
                      {
                        "--choice-color": kindColors[kind],
                        borderColor: active ? kindColors[kind] : undefined,
                      } as React.CSSProperties
                    }
                    onClick={() => chooseKind(kind)}
                  >
                    <span style={{ background: kindColors[kind] }} />
                    {KIND_META[kind].label}
                  </button>
                );
              })}
            </div>
          </div>

          {form.kind === "lecture" && (
            <div className="assistant-requirement-panel">
              <div className="assistant-requirement-heading">
                <div>
                  <Link2 size={18} />
                  <span>
                    <strong>보조강사</strong>
                    <small>
                      필요로 설정하면 연결된 보조강의가 없을 때 미배정으로 표시됩니다.
                    </small>
                  </span>
                </div>
                <b
                  style={{
                    color:
                      ASSISTANT_ASSIGNMENT_META[displayedAssistantStatus].color,
                  }}
                >
                  {ASSISTANT_ASSIGNMENT_META[displayedAssistantStatus].label}
                </b>
              </div>
              <div className="assistant-requirement-actions">
                <button
                  type="button"
                  disabled={!editable}
                  className={form.assistantRequired ? "active" : ""}
                  onClick={() => update("assistantRequired", true)}
                >
                  보조 필요
                </button>
                <button
                  type="button"
                  disabled={!editable}
                  className={!form.assistantRequired ? "active" : ""}
                  onClick={() => update("assistantRequired", false)}
                >
                  보조 불필요
                </button>
              </div>
            </div>
          )}

          <label className="field full">
            <span>담당 강사</span>
            <div className="field-with-icon">
              <UserRound size={16} />
              <select
                value={lockedInstructor || form.instructor}
                disabled={!editable || !isAdmin}
                onChange={(event) => update("instructor", event.target.value)}
              >
                {instructors.map((instructor) => (
                  <option key={instructor} value={instructor}>
                    {instructor}
                  </option>
                ))}
              </select>
            </div>
          </label>

          {isBulk ? (
            <div className="bulk-date-summary">
              <div>
                <CalendarDays size={18} />
                <strong>선택한 날짜 {bulkDates?.length || 0}개</strong>
              </div>
              <div className="bulk-date-chips">
                {bulkDates?.map((date) => <span key={date}>{date}</span>)}
              </div>
            </div>
          ) : (
            <label className="field full">
              <span>날짜</span>
              <input
                type="date"
                value={form.date}
                disabled={!editable}
                onChange={(event) => {
                  const date = event.target.value;
                  setForm((current) => {
                    const linkedLecture = mainLectures.find(
                      (lecture) => lecture.id === current.parentScheduleId,
                    );
                    return {
                      ...current,
                      date,
                      parentScheduleId:
                        linkedLecture && linkedLecture.date === date
                          ? current.parentScheduleId
                          : undefined,
                    };
                  });
                }}
              />
            </label>
          )}

          {isAssistant && (
            <div className="parent-lecture-panel">
              <div className="parent-lecture-heading">
                <div>
                  <Link2 size={17} />
                  <strong>{isBulk ? "날짜별 연결할 본강의" : "연결할 본강의"}</strong>
                </div>
                <span>필수</span>
              </div>
              {isBulk ? (
                <div className="bulk-parent-lecture-list">
                  {bulkDates?.map((date) => {
                    const candidates = mainLectures.filter(
                      (lecture) =>
                        lecture.date === date && lecture.status !== "cancelled",
                    );
                    return (
                      <label className="bulk-parent-lecture-row" key={date}>
                        <span>{date}</span>
                        <select
                          value={bulkParentScheduleIds[date] || ""}
                          disabled={!editable || candidates.length === 0}
                          onChange={(event) =>
                            setBulkParentScheduleIds((current) => ({
                              ...current,
                              [date]: event.target.value,
                            }))
                          }
                        >
                          <option value="">
                            {candidates.length > 0
                              ? "본강의를 선택하세요"
                              : "해당 날짜에 본강의가 없습니다"}
                          </option>
                          {candidates.map((lecture) => (
                            <option key={lecture.id} value={lecture.id}>
                              {parentLectureLabel(lecture)}
                            </option>
                          ))}
                        </select>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <label className="field full">
                  <span>본강의 선택</span>
                  <select
                    value={selectedMainLecture?.id || ""}
                    disabled={!editable || availableMainLectures.length === 0}
                    onChange={(event) => chooseParentLecture(event.target.value)}
                  >
                    <option value="">
                      {availableMainLectures.length > 0
                        ? "본강의를 선택하세요"
                        : "이 날짜에는 등록된 본강의가 없습니다"}
                    </option>
                    {availableMainLectures.map((lecture) => (
                      <option
                        key={lecture.id}
                        value={lecture.id}
                        disabled={
                          lecture.status === "cancelled" &&
                          lecture.id !== form.parentScheduleId
                        }
                      >
                        {parentLectureLabel(lecture)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <small>
                {isBulk
                  ? "후보가 하나뿐인 날짜는 자동 선택됩니다. 각 본강의의 시간, 지역, 장소, 강의명과 상태가 적용됩니다."
                  : "선택한 본강의의 날짜, 시간, 지역, 장소, 강의명과 상태를 가져옵니다. 가져온 내용은 아래에서 개별 수정할 수 있습니다."}
              </small>
              {!isBulk && selectedMainLecture && (
                <div className="parent-lecture-summary">
                  <span>연결됨</span>
                  <strong>{selectedMainLecture.topic || "본강의"}</strong>
                  <small>
                    {selectedMainLecture.instructor} · {selectedMainLecture.date} · {selectedMainLecture.startTime || "시간 미정"}
                  </small>
                </div>
              )}
              {attemptedSave && needsParentLecture && (
                <small className="field-error">연결할 본강의를 선택해주세요.</small>
              )}
            </div>
          )}

          {!isOff && !isBulkAssistant && (
            <>
              <div className="field-grid">
                <label className="field">
                  <span>시작 시간</span>
                  <input
                    type="time"
                    value={form.startTime || ""}
                    disabled={!editable}
                    onChange={(event) => {
                      const startTime = event.target.value || undefined;
                      setForm((current) => ({
                        ...current,
                        startTime,
                        session: deriveSession(startTime),
                      }));
                    }}
                  />
                </label>
                <label className="field">
                  <span>종료 시간</span>
                  <input
                    type="time"
                    value={form.endTime || ""}
                    disabled={!editable}
                    onChange={(event) =>
                      update("endTime", event.target.value || undefined)
                    }
                  />
                </label>
              </div>
              <small className="field-helper">
                시간을 모르면 시작·종료 시간을 모두 비워두세요.
              </small>
              {(hasPartialTime || hasInvalidTime) && (
                <small className="field-error">
                  {hasPartialTime
                    ? "시작 시간과 종료 시간을 모두 입력하거나 모두 비워주세요."
                    : "종료 시간은 시작 시간보다 늦어야 합니다."}
                </small>
              )}
            </>
          )}

          {!isOff && !isOffice && !isBulkAssistant && (
            <label className="field full">
              <span>지역</span>
              <input
                value={form.region || ""}
                disabled={!editable}
                placeholder="비워두면 지역 미정으로 표시됩니다."
                onChange={(event) => update("region", event.target.value)}
              />
            </label>
          )}

          {!isBulkAssistant && (
            <>
              <label className="field full">
                <span>
                  {isOther
                    ? "기타 일정 내용 *"
                    : isOff
                      ? "휴무 사유"
                      : "강의명·업무명"}
                </span>
                <input
                  value={form.topic || ""}
                  disabled={!editable}
                  placeholder={
                    isOther
                      ? "예: 팀 회의, 외부 행사, 장비 점검"
                      : isOff
                        ? "예: 연차, 대체 휴무"
                        : "예: 제미나이, 클로드, 교안 정리"
                  }
                  onChange={(event) => update("topic", event.target.value)}
                />
              </label>
              {attemptedSave && needsOtherDescription && (
                <small className="field-error">기타 일정 내용을 입력해주세요.</small>
              )}
            </>
          )}

          {!isBulkAssistant && (
            <>
              <button
                type="button"
                className="details-toggle"
                aria-expanded={showDetails}
                onClick={() => setShowDetails((current) => !current)}
              >
                <div>
                  <strong>상세 정보</strong>
                  <span>상태, 장소, 도착 준비 시간, 메모</span>
                </div>
                <ChevronRight
                  size={20}
                  className={showDetails ? "is-open" : ""}
                />
              </button>

              {showDetails && (
                <div className="optional-fields">
              <div className="status-choice">
                {(Object.keys(STATUS_META) as ScheduleStatus[]).map((status) => (
                  <button
                    key={status}
                    type="button"
                    disabled={!editable}
                    className={form.status === status ? "active" : ""}
                    style={{
                      borderColor:
                        form.status === status
                          ? STATUS_META[status].color
                          : undefined,
                      color:
                        form.status === status
                          ? STATUS_META[status].color
                          : undefined,
                      background:
                        form.status === status
                          ? `${STATUS_META[status].color}12`
                          : undefined,
                    }}
                    onClick={() => update("status", status)}
                  >
                    <span style={{ background: STATUS_META[status].color }} />
                    {STATUS_META[status].label}
                  </button>
                ))}
              </div>

              {!isOff && (
                <>
                  <label className="field full">
                    <span>장소</span>
                    <div className="field-with-icon">
                      <MapPin size={18} />
                      <input
                        value={form.venue || ""}
                        disabled={!editable}
                        placeholder="장소 또는 미정"
                        onChange={(event) => update("venue", event.target.value)}
                      />
                    </div>
                  </label>

                  <div className="field-grid">
                    <label className="field">
                      <span>시간대</span>
                      <select
                        value={form.session || deriveSession(form.startTime)}
                        disabled={!editable}
                        onChange={(event) => update("session", event.target.value)}
                      >
                        <option value="종일">시간 미정</option>
                        <option value="오전">오전</option>
                        <option value="오후">오후</option>
                        <option value="야간">야간</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>도착 준비 시간</span>
                      <select
                        value={form.arrivalMinutes}
                        disabled={!editable}
                        onChange={(event) =>
                          update("arrivalMinutes", Number(event.target.value))
                        }
                      >
                        <option value={0}>설정 안 함</option>
                        <option value={15}>15분 전</option>
                        <option value={30}>30분 전</option>
                        <option value={45}>45분 전</option>
                        <option value={60}>60분 전</option>
                      </select>
                    </label>
                  </div>

                  {arrivalTime && (
                    <div className="arrival-callout">
                      <Clock3 size={19} />
                      <div>
                        <span>권장 도착 시각</span>
                        <b>{arrivalTime}</b>
                        <small>시작 {form.arrivalMinutes}분 전</small>
                      </div>
                    </div>
                  )}
                </>
              )}

              <label className="field full">
                <span>메모</span>
                <textarea
                  value={form.note || ""}
                  disabled={!editable}
                  rows={4}
                  placeholder="담당자 전달사항을 입력하세요."
                  onChange={(event) => update("note", event.target.value)}
                />
              </label>
                </div>
              )}
            </>
          )}

          {isBulkAssistant && (
            <label className="field full bulk-common-note">
              <span>공통 메모</span>
              <textarea
                value={form.note || ""}
                disabled={!editable}
                rows={4}
                placeholder="선택한 모든 보조강의에 적용할 메모를 입력하세요."
                onChange={(event) => update("note", event.target.value)}
              />
              <small>
                시간, 지역, 장소, 강의명과 상태는 날짜별 본강의를 그대로 따릅니다.
              </small>
            </label>
          )}

          {!isNew && (
            <div className="source-line">
              <span>등록 경로</span>
              <b>{form.source === "excel" ? "엑셀 가져오기" : "직접 등록"}</b>
            </div>
          )}
        </div>

        <div className="drawer-footer">
          {!isNew && editable && (
            <button className="danger-button" onClick={() => onDelete(form)}>
              {isAdmin ? "삭제" : "일정 취소"}
            </button>
          )}
          <div className="drawer-footer-spacer" />
          <button className="secondary-button" onClick={onClose}>
            닫기
          </button>
          {editable && (
            <button
              className="primary-button"
              disabled={
                !form.date ||
                !form.instructor ||
                hasPartialTime ||
                hasInvalidTime
              }
              onClick={submit}
            >
              <Check size={17} />
              {isBulk
                ? `${bulkDates?.length || 0}개 등록`
                : isNew
                  ? "등록"
                  : "저장"}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
