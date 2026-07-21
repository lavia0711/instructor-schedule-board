import assert from "node:assert/strict";
import test from "node:test";

import {
  distributeInstructorColors,
  ensureLectureKeywordColors,
  lectureClassificationColor,
  lectureKeywordColorKey,
} from "../lib/schedule-colors.ts";

function schedule(overrides) {
  return {
    id: crypto.randomUUID(),
    date: "2026-08-01",
    instructor: "강사",
    kind: "lecture",
    status: "confirmed",
    assistantRequired: true,
    arrivalMinutes: 0,
    source: "manual",
    modifiedAt: "2026-07-21T00:00:00.000Z",
    ...overrides,
  };
}

test("new and duplicate instructor colors are distributed across the palette", () => {
  const colors = distributeInstructorColors(
    ["김강사", "이강사", "박강사"],
    { 김강사: "#0369a1", 이강사: "#0369a1" },
  );

  assert.equal(colors.김강사, "#0369a1");
  assert.notEqual(colors.이강사, colors.김강사);
  assert.notEqual(colors.박강사, colors.이강사);
});

test("lecture keyword colors are stable by normalized keyword", () => {
  const colors = ensureLectureKeywordColors(
    ["제미나이", "클로드"],
    { [lectureKeywordColorKey("제미나이")]: "#123456" },
  );

  assert.equal(colors[lectureKeywordColorKey("제미나이")], "#123456");
  assert.ok(colors[lectureKeywordColorKey("클로드")]);
});

test("assistant lecture inherits its parent lecture classification color", () => {
  const lecture = schedule({ id: "lecture-1", topic: "클로드 실무" });
  const assistant = schedule({
    id: "assistant-1",
    instructor: "보조강사",
    kind: "assistant",
    parentScheduleId: lecture.id,
    assistantRequired: false,
  });
  const colors = {
    [lectureKeywordColorKey("클로드")]: "#abcdef",
  };

  assert.equal(
    lectureClassificationColor(
      assistant,
      [lecture, assistant],
      ["클로드"],
      colors,
      "#000000",
    ),
    "#abcdef",
  );
});
