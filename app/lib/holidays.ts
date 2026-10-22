import { addCalendarDays } from "../../extensions/delivery-estimate/assets/estimate.js";

export interface HolidayLike {
  date: string; // "YYYY-MM-DD"; for yearly holidays the first occurrence
  repeatsYearly: boolean;
  active: boolean;
}

export const HOLIDAY_WINDOW_MONTHS = 18;

export function isLeapYear(year: number) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function isValidDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function addMonths(date: string, months: number) {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  dt.setUTCDate(Math.min(d, lastDay));
  return dt.toISOString().slice(0, 10);
}

/** The yearly holiday's date in `year`, or null (Feb 29 in a non-leap year, or before the starting year). */
export function occurrenceInYear(holiday: Pick<HolidayLike, "date">, year: number) {
  const [startYear, m, d] = holiday.date.split("-").map(Number);
  if (year < startYear) return null;
  if (m === 2 && d === 29 && !isLeapYear(year)) return null;
  return `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** First occurrence on or after `today` (and on or after the starting year). */
export function nextOccurrence(holiday: Pick<HolidayLike, "date" | "repeatsYearly">, today: string) {
  if (!holiday.repeatsYearly) return holiday.date >= today ? holiday.date : null;
  const startYear = Number(holiday.date.slice(0, 4));
  let year = Math.max(startYear, Number(today.slice(0, 4)));
  for (let i = 0; i < 8; i++, year++) {
    const date = occurrenceInYear(holiday, year);
    if (date && date >= today) return date;
  }
  return null;
}

/**
 * Active holiday dates from `today` through today + 18 months, yearly ones
 * expanded per year (never before their starting year), de-duplicated and sorted.
 */
export function expandHolidays(holidays: HolidayLike[], today: string) {
  const until = addMonths(today, HOLIDAY_WINDOW_MONTHS);
  const firstYear = Number(today.slice(0, 4));
  const lastYear = Number(until.slice(0, 4));
  const dates = new Set<string>();
  for (const holiday of holidays) {
    if (!holiday.active) continue;
    const candidates = holiday.repeatsYearly
      ? Array.from({ length: lastYear - firstYear + 1 }, (_, i) =>
          occurrenceInYear(holiday, firstYear + i),
        )
      : [holiday.date];
    for (const date of candidates) {
      if (date && date >= today && date <= until) dates.add(date);
    }
  }
  return [...dates].sort();
}

export { addCalendarDays };
