import assert from "node:assert/strict";
import test from "node:test";

import {
  calendarDisplayView,
  logicalCalendarView,
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
