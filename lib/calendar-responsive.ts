export type CalendarView =
  | "dayGridMonth"
  | "timeGridWeek"
  | "timeGridDay";

export type CalendarDisplayView = CalendarView | "listWeek";

export function calendarDisplayView(
  view: CalendarView,
  mobile: boolean,
): CalendarDisplayView {
  return mobile && view === "timeGridWeek" ? "listWeek" : view;
}

export function logicalCalendarView(
  view: string,
): CalendarView | null {
  if (view === "listWeek") return "timeGridWeek";
  if (
    view === "dayGridMonth" ||
    view === "timeGridWeek" ||
    view === "timeGridDay"
  ) {
    return view;
  }
  return null;
}
