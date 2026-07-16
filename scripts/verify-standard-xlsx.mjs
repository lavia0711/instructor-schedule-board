import ExcelJS from "exceljs";

const filePath = process.argv[2];
const baseYear = Number(process.argv[3] || new Date().getFullYear());

if (!filePath) {
  throw new Error("Usage: node scripts/verify-standard-xlsx.mjs <file.xlsx> [year]");
}

function text(value) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if (typeof value.text === "string") return value.text.trim();
    if (value.result != null) return String(value.result).trim();
  }
  return String(value).trim();
}

function parseDate(value) {
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
  if (typeof value === "number") {
    const parsed = new Date(Date.UTC(1899, 11, 30) + value * 86_400_000);
    return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}-${String(parsed.getUTCDate()).padStart(2, "0")}`;
  }
  const match = text(value).match(/(?:(\d{4})\s*[년./-]\s*)?(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (!match) return null;
  return `${match[1] || baseYear}-${String(Number(match[2])).padStart(2, "0")}-${String(Number(match[3])).padStart(2, "0")}`;
}

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(filePath);

let schedules = 0;
let errors = 0;
let cancelled = 0;
let mixedDateTypes = false;
const dateTypes = new Set();

workbook.eachSheet((worksheet) => {
  let headerRow = 0;
  let dateColumn = 0;
  let instructorColumn = 0;
  let noteColumn = 0;

  for (let rowNumber = 1; rowNumber <= Math.min(10, worksheet.rowCount); rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      const value = text(cell.value).replace(/\s/g, "");
      if (value === "날짜") dateColumn = columnNumber;
      if (value === "강사") instructorColumn = columnNumber;
      if (value === "비고") noteColumn = columnNumber;
    });
    if (dateColumn && instructorColumn) {
      headerRow = rowNumber;
      break;
    }
  }

  if (!headerRow) {
    errors += 1;
    return;
  }

  for (let rowNumber = headerRow + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const rawDate = row.getCell(dateColumn).value;
    const instructor = text(row.getCell(instructorColumn).value);
    if (!rawDate && !instructor) continue;
    dateTypes.add(rawDate instanceof Date ? "date" : typeof rawDate);
    if (!parseDate(rawDate) || !instructor) {
      errors += 1;
      continue;
    }
    schedules += 1;
    if (text(row.getCell(noteColumn).value).includes("취소")) cancelled += 1;
  }
});

mixedDateTypes = dateTypes.size > 1;

if (schedules !== 30 || errors !== 0 || !mixedDateTypes) {
  throw new Error(
    `Unexpected result: schedules=${schedules}, errors=${errors}, dateTypes=${[...dateTypes].join(",")}`,
  );
}

console.log(
  JSON.stringify(
    {
      sheets: workbook.worksheets.length,
      schedules,
      errors,
      cancelled,
      dateTypes: [...dateTypes],
    },
    null,
    2,
  ),
);
