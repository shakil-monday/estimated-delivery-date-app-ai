import { expandHolidays, type HolidayLike } from "./holidays";
import { PRESETS, type Design } from "./presets";
import type { SettingsInput } from "./validation";

export const CONFIG_VERSION = 1;
export const MAX_CONFIG_BYTES = 64 * 1024;

export interface RegionValues {
  name: string;
  countries: string[];
  shippingMin: number;
  shippingMax: number;
}

export interface StorefrontConfig {
  version: number;
  timezone: string;
  processing: { min: number; max: number };
  shipping: { min: number; max: number };
  weekendDays: number[];
  holidays: string[];
  regions: { name: string; countries: string[]; shipping: { min: number; max: number } }[];
  unmatchedCountry: "useDefault" | "hide";
  displayMode: "range" | "single";
  messageRange: string;
  messageSingle: string;
  dateFormat: "short" | "long";
  design: Design;
  /** Free plan: show the small "Powered by" note. */
  branding: boolean;
}

/**
 * Builds the storefront config (metafield `$app:delivery.config`). Pure.
 * Free plan: no holidays, no regions, preset design only, plus a branding note.
 * The merchant's Pro data is not touched; it applies again once they're Pro.
 */
export function buildConfig(input: {
  isPro: boolean;
  timezone: string;
  settings: SettingsInput;
  design: Design;
  holidays: HolidayLike[];
  regions: RegionValues[];
  today: string;
}): StorefrontConfig {
  const { settings, isPro } = input;
  const design: Design = isPro ? input.design : { ...PRESETS[input.design.preset], preset: input.design.preset };
  return {
    version: CONFIG_VERSION,
    timezone: input.timezone,
    processing: { min: settings.processingMin, max: settings.processingMax },
    shipping: { min: settings.shippingMin, max: settings.shippingMax },
    weekendDays: settings.weekendDays,
    holidays: isPro ? expandHolidays(input.holidays, input.today) : [],
    regions: (isPro ? input.regions : []).map((r) => ({
      name: r.name,
      countries: r.countries,
      shipping: { min: r.shippingMin, max: r.shippingMax },
    })),
    unmatchedCountry: settings.unmatchedCountry,
    displayMode: settings.displayMode,
    messageRange: settings.messageRange,
    messageSingle: settings.messageSingle,
    dateFormat: settings.dateFormat,
    design,
    branding: !isPro,
  };
}
