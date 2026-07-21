import assert from "node:assert/strict";
import test from "node:test";

import {
  calendarDisplayView,
  logicalCalendarView,
  registrationDate,
} from "../lib/calendar-responsive.ts";

test("mobile keeps month and day views but turns week into an agenda list", () => {
  assert.equal(calendarDisplayView("dayGridMonth", true), "dayGridMonth");
  assert.equal(calendarDisplayView("timeGridWeek", true), "listWeek");
  assert.equal(calendarDisplayView("timeGridDay", true), "timeGridDay");
});

test("desktop preserves every existing calendar view", () => {
  assert.equal(calendarDisplayView("dayGridMonth", false), "dayGridMonth");
  assert.equal(calendarDisplayView("timeGridWeek", false), "timeGridWeek");
  assert.equal(calendarDisplayView("timeGridDay", false), "timeGridDay");
});

test("display views map back to the logical month, week, and day controls", () => {
  assert.equal(logicalCalendarView("listWeek"), "timeGridWeek");
  assert.equal(logicalCalendarView("timeGridDay"), "timeGridDay");
  assert.equal(logicalCalendarView("unknown"), null);
});

test("desktop registration follows the visible calendar date", () => {
  assert.equal(
    registrationDate({
      view: "dayGridMonth",
      mobile: false,
      mobileSelectedDate: "2026-07-21",
      calendarDate: "2026-08-21",
      today: "2026-07-21",
    }),
    "2026-08-21",
  );
});

test("mobile month registration follows the tapped date", () => {
  assert.equal(
    registrationDate({
      view: "dayGridMonth",
      mobile: true,
      mobileSelectedDate: "2026-08-05",
      calendarDate: "2026-08-21",
      today: "2026-07-21",
    }),
    "2026-08-05",
  );
});

test("mobile month registration drops a selection from another month", () => {
  assert.equal(
    registrationDate({
      view: "dayGridMonth",
      mobile: true,
      mobileSelectedDate: "2026-08-05",
      calendarDate: "2026-09-21",
      today: "2026-07-21",
    }),
    "2026-09-21",
  );
});

test("week and day registration always follow the calendar date", () => {
  for (const view of ["timeGridWeek", "timeGridDay"]) {
    assert.equal(
      registrationDate({
        view,
        mobile: true,
        mobileSelectedDate: "2026-08-05",
        calendarDate: "2026-09-21",
        today: "2026-07-21",
      }),
      "2026-09-21",
    );
  }
});
