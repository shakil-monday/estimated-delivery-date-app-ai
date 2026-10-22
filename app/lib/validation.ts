import { isValidDate } from "./holidays";
import { PRESETS, type Design, type Preset } from "./presets";
import { COUNTRY_CODES } from "./countries";

export type Errors = Record<string, string>;
export type Result<T> = { ok: true; data: T } | { ok: false; errors: Errors };

export const MAX_HOLIDAYS = 200;

export interface SettingsInput {
  processingMin: number;
  processingMax: number;
  shippingMin: number;
  shippingMax: number;
  weekendDays: number[];
  unmatchedCountry: "useDefault" | "hide";
  displayMode: "range" | "single";
  messageRange: string;
  messageSingle: string;
  dateFormat: "short" | "long";
}

function int(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return NaN;
}

/** Validates a min/max pair of day counts, writing errors under `${prefix}Min` / `${prefix}Max`. */
export function checkRange(
  errors: Errors,
  prefix: string,
  rawMin: unknown,
  rawMax: unknown,
  limit: number,
) {
  const min = int(rawMin);
  const max = int(rawMax);
  const bad = (n: number) => !Number.isInteger(n) || n < 0 || n > limit;
  if (bad(min)) errors[`${prefix}Min`] = `Enter a whole number from 0 to ${limit}.`;
  if (bad(max)) errors[`${prefix}Max`] = `Enter a whole number from 0 to ${limit}.`;
  if (!bad(min) && !bad(max) && min > max) {
    errors[`${prefix}Max`] = "Maximum must be greater than or equal to minimum.";
  }
  return { min, max };
}

function checkTemplate(errors: Errors, key: string, value: unknown, placeholders: string[]) {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length < 1 || text.length > 120) {
    errors[key] = "Enter 1 to 120 characters.";
  } else {
    const missing = placeholders.filter((p) => !text.includes(p));
    if (missing.length) errors[key] = `Must include ${missing.join(" and ")}.`;
  }
  return text;
}

export function validateSettings(input: Record<string, unknown>): Result<SettingsInput> {
  const errors: Errors = {};
  const processing = checkRange(errors, "processing", input.processingMin, input.processingMax, 60);
  const shipping = checkRange(errors, "shipping", input.shippingMin, input.shippingMax, 90);

  const rawWeekend = Array.isArray(input.weekendDays) ? input.weekendDays.map(Number) : [];
  const weekendDays = [...new Set(rawWeekend)].sort();
  if (!Array.isArray(input.weekendDays) || weekendDays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
    errors.weekendDays = "Choose valid weekdays.";
  } else if (weekendDays.length === 7) {
    errors.weekendDays = "At least one day of the week must be a working day.";
  }

  const unmatchedCountry = input.unmatchedCountry === "hide" ? "hide" : "useDefault";
  const displayMode = input.displayMode === "single" ? "single" : "range";
  const dateFormat = input.dateFormat === "long" ? "long" : "short";
  const messageRange = checkTemplate(errors, "messageRange", input.messageRange, ["{start}", "{end}"]);
  const messageSingle = checkTemplate(errors, "messageSingle", input.messageSingle, ["{end}"]);

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    data: {
      processingMin: processing.min,
      processingMax: processing.max,
      shippingMin: shipping.min,
      shippingMax: shipping.max,
      weekendDays,
      unmatchedCountry,
      displayMode,
      messageRange,
      messageSingle,
      dateFormat,
    },
  };
}

const HEX = /^#[0-9a-fA-F]{6}$/;

export function validateDesign(input: Record<string, unknown>): Result<Design> {
  const errors: Errors = {};
  const preset = (Object.keys(PRESETS).includes(String(input.preset)) ? input.preset : "boxed") as Preset;
  const color = (key: string, allowTransparent = false) => {
    const v = String(input[key] ?? "");
    if (allowTransparent && v === "transparent") return v;
    if (!HEX.test(v)) errors[key] = "Enter a color like #1a2b3c.";
    return v.toLowerCase();
  };
  const num = (key: string, min: number, max: number) => {
    const v = int(input[key]);
    if (!Number.isInteger(v) || v < min || v > max) errors[key] = `Enter a whole number from ${min} to ${max}.`;
    return v;
  };
  const oneOf = <T extends string | number>(key: string, values: readonly T[]) => {
    const v = values.find((x) => String(x) === String(input[key]));
    if (v === undefined) errors[key] = "Choose a valid option.";
    return v as T;
  };

  const design: Design = {
    preset,
    icon: oneOf("icon", ["truck", "box", "calendar", "clock", "none"] as const),
    iconColor: color("iconColor"),
    iconSize: num("iconSize", 12, 32),
    textColor: color("textColor"),
    accentColor: color("accentColor"),
    background: color("background", true),
    borderColor: color("borderColor"),
    borderWidth: num("borderWidth", 0, 4),
    borderRadius: num("borderRadius", 0, 999),
    padding: num("padding", 0, 32),
    fontSize: num("fontSize", 11, 24),
    fontWeight: oneOf("fontWeight", [400, 600, 700] as const),
    align: oneOf("align", ["left", "center", "right"] as const),
    layout: oneOf("layout", ["icon-left", "icon-top"] as const),
  };
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, data: design };
}

export interface HolidayInput {
  date: string;
  name: string;
  repeatsYearly: boolean;
  active: boolean;
}

export function validateHoliday(input: Record<string, unknown>): Result<HolidayInput> {
  const errors: Errors = {};
  const date = String(input.date ?? "");
  const name = String(input.name ?? "").trim();
  if (!isValidDate(date)) errors.date = "Choose a valid date.";
  if (name.length < 1 || name.length > 100) errors.name = "Enter a name of 1 to 100 characters.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    data: { date, name, repeatsYearly: input.repeatsYearly === true, active: input.active !== false },
  };
}

export const DUPLICATE_HOLIDAY_ERROR = "A holiday with this name already exists on this date.";

export function isDuplicateHoliday(
  candidate: { date: string; name: string; id?: number },
  existing: { id: number; date: string; name: string }[],
) {
  const key = candidate.name.trim().toLowerCase();
  return existing.some(
    (h) => h.id !== candidate.id && h.date === candidate.date && h.name.trim().toLowerCase() === key,
  );
}

export interface RegionInput {
  name: string;
  countries: string[];
  shippingMin: number;
  shippingMax: number;
}

export function validateRegion(
  input: Record<string, unknown>,
  otherRegions: { name: string; countries: string[] }[],
): Result<RegionInput> {
  const errors: Errors = {};
  const name = String(input.name ?? "").trim();
  if (name.length < 1 || name.length > 100) {
    errors.name = "Enter a name of 1 to 100 characters.";
  } else if (otherRegions.some((r) => r.name.trim().toLowerCase() === name.toLowerCase())) {
    errors.name = "Another region already uses this name.";
  }

  const raw = Array.isArray(input.countries) ? input.countries.map((c) => String(c).toUpperCase()) : [];
  const countries = [...new Set(raw)].sort();
  if (countries.length === 0) {
    errors.countries = "Choose at least one country.";
  } else if (countries.some((c) => !COUNTRY_CODES.includes(c))) {
    errors.countries = "Choose valid countries.";
  } else {
    const taken = countries
      .map((c) => ({ c, region: otherRegions.find((r) => r.countries.includes(c)) }))
      .filter((x) => x.region);
    if (taken.length) {
      errors.countries = `Already used by another region: ${taken
        .map((x) => `${x.c} (${x.region!.name})`)
        .join(", ")}.`;
    }
  }

  const shipping = checkRange(errors, "shipping", input.shippingMin, input.shippingMax, 90);
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, data: { name, countries, shippingMin: shipping.min, shippingMax: shipping.max } };
}

/** Parses a JSON string column, returning `fallback` when it is malformed. */
export function parseJSON<T>(value: string | null | undefined, fallback: T): T {
  try {
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}
