// Delivery estimate calculation. Shared by the storefront block and the admin
// preview, so keep it dependency-free and side-effect-free.
// All date math works on plain "YYYY-MM-DD" strings (interpreted as UTC
// midnight), never on local Date times.

const MAX_CALENDAR_DAYS = 400;

/** Calendar date of `now` in `timeZone`, as "YYYY-MM-DD". Falls back to UTC. */
export function todayInTimezone(now, timeZone) {
  let parts;
  try {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
  } catch (e) {
    return todayInTimezone(now, "UTC");
  }
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function toUTC(date) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUTC(dt) {
  return dt.toISOString().slice(0, 10);
}

export function addCalendarDays(date, n) {
  const dt = toUTC(date);
  dt.setUTCDate(dt.getUTCDate() + n);
  return fromUTC(dt);
}

/** 0 = Sunday … 6 = Saturday */
export function weekdayOf(date) {
  return toUTC(date).getUTCDay();
}

function makeCalendar(weekendDays, holidays) {
  const weekend = new Set(weekendDays || []);
  const holidaySet = new Set(holidays || []);
  return {
    // A date can be both; it is reported as a weekend day.
    kind(date) {
      if (weekend.has(weekdayOf(date))) return "weekend";
      if (holidaySet.has(date)) return "holiday";
      return "business";
    },
  };
}

/**
 * Steps forward from `today` until `n` business days are counted. Today is
 * never counted; with n = 0 the result is today if it is a business day,
 * otherwise the next business day. Returns null after MAX_CALENDAR_DAYS.
 */
export function addBusinessDays(today, n, calendar) {
  let date = today;
  if (n <= 0) {
    for (let i = 0; i <= MAX_CALENDAR_DAYS; i++) {
      if (calendar.kind(date) === "business") return date;
      date = addCalendarDays(date, 1);
    }
    return null;
  }
  let counted = 0;
  for (let i = 1; i <= MAX_CALENDAR_DAYS; i++) {
    date = addCalendarDays(date, 1);
    if (calendar.kind(date) === "business") {
      counted++;
      if (counted === n) return date;
    }
  }
  return null;
}

function findRegion(regions, countryCode) {
  if (!countryCode) return null;
  const code = String(countryCode).toUpperCase();
  return (
    (regions || []).find((r) => (r.countries || []).includes(code)) || null
  );
}

/**
 * @param {object} config  The metafield config (see README / plan §7).
 * @param {{ now?: Date, countryCode?: string|null, today?: string }} opts
 *   `today` ("YYYY-MM-DD") overrides `now`; used by the admin simulator.
 * @returns {{ start: string, end: string, explain: { regionName: string|null, skippedWeekendDays: number, skippedHolidays: string[] } } | null}
 */
export function calculateEstimate(config, opts = {}) {
  if (!config || !config.processing || !config.shipping) return null;
  const today = opts.today || todayInTimezone(opts.now || new Date(), config.timezone);

  const region = findRegion(config.regions, opts.countryCode);
  let shipping = config.shipping;
  if (region) {
    shipping = region.shipping;
  } else if (opts.countryCode && config.unmatchedCountry === "hide") {
    return null;
  }

  const calendar = makeCalendar(config.weekendDays, config.holidays);
  const startDays = config.processing.min + shipping.min;
  const endDays = config.processing.max + shipping.max;
  const start = addBusinessDays(today, startDays, calendar);
  const end = addBusinessDays(today, endDays, calendar);
  if (!start || !end) return null;

  // Explain: non-business days stepped over on the way to `end`.
  let skippedWeekendDays = 0;
  const skippedHolidays = [];
  let date = endDays <= 0 ? today : addCalendarDays(today, 1);
  while (date <= end) {
    const kind = calendar.kind(date);
    if (kind === "weekend") skippedWeekendDays++;
    else if (kind === "holiday") skippedHolidays.push(date);
    date = addCalendarDays(date, 1);
  }

  return {
    start,
    end,
    explain: {
      regionName: region ? region.name : null,
      skippedWeekendDays,
      skippedHolidays,
    },
  };
}

const DATE_FORMATS = {
  short: { weekday: "short", month: "short", day: "numeric" },
  long: { weekday: "long", month: "long", day: "numeric" },
};

export function formatDate(date, dateFormat, locale) {
  const options = { ...(DATE_FORMATS[dateFormat] || DATE_FORMATS.short), timeZone: "UTC" };
  try {
    return new Intl.DateTimeFormat(locale || undefined, options).format(toUTC(date));
  } catch (e) {
    return new Intl.DateTimeFormat("en", options).format(toUTC(date));
  }
}

/**
 * Splits the message template into text and date segments so the renderer can
 * color the dates. Everything is plain text.
 * @returns {{ text: string, isDate: boolean }[]}
 */
export function formatEstimateParts(result, config, locale) {
  if (!result) return [];
  const useRange = config.displayMode !== "single" && result.start !== result.end;
  const template = useRange ? config.messageRange : config.messageSingle;
  const values = {
    start: formatDate(result.start, config.dateFormat, locale),
    end: formatDate(result.end, config.dateFormat, locale),
  };
  const parts = [];
  String(template || "{end}")
    .split(/(\{start\}|\{end\})/)
    .forEach((piece) => {
      if (!piece) return;
      const key = piece === "{start}" ? "start" : piece === "{end}" ? "end" : null;
      parts.push(key ? { text: values[key], isDate: true } : { text: piece, isDate: false });
    });
  return parts;
}

export function formatEstimate(result, config, locale) {
  return formatEstimateParts(result, config, locale)
    .map((p) => p.text)
    .join("");
}
