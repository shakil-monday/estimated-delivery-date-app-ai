// Pricing. Keep in sync with the App Store listing.
export const PRO_PLAN = "Pro";
export const PRO_PRICE = 4.99;
export const PRO_CURRENCY = "USD";
export const PRO_TRIAL_DAYS = 7;
export const BILLING_PERIOD_DAYS = 30;

export type Plan = "free" | "pro";

export type SubscriptionStatus =
  | "PENDING"
  | "ACCEPTED"
  | "ACTIVE"
  | "DECLINED"
  | "EXPIRED"
  | "FROZEN"
  | "CANCELLED";

/** Pro only while the subscription is ACTIVE. Every other status (incl. FROZEN = unpaid Shopify bill) is Free. */
export function planFromStatus(status: string | null | undefined): Plan {
  return status === "ACTIVE" ? "pro" : "free";
}

export function isPro(plan: string | null | undefined) {
  return plan === "pro";
}

/** Features that need Pro. Free keeps settings, presets and weekends. */
export const PRO_FEATURES = ["Holidays", "Regions", "Custom widget design", "No “Powered by” note"] as const;
