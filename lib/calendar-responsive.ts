export type CalendarView =
  | "dayGridMonth"
  | "timeGridWeek"
  | "timeGridDay";

export type CalendarDisplayView = CalendarView | "listWeek";

type RegistrationDateOptions = {
  view: CalendarView;
  mobile: boolean;
  mobileSelectedDate: string;
  calendarDate?: string;
  today: string;
};

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

export function registrationDate({
  view,
  mobile,
  mobileSelectedDate,
  calendarDate,
  today,
}: RegistrationDateOptions): string {
  if (
    mobile &&
    view === "dayGridMonth" &&
    (!calendarDate ||
      mobileSelectedDate.slice(0, 7) === calendarDate.slice(0, 7))
  ) {
    return mobileSelectedDate;
  }
  return calendarDate || today;
}
