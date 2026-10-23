// Pure revenue/subscription maths for the owner panel (no database access).
import { BILLING_PERIOD_DAYS } from "./plans";

const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_MS = BILLING_PERIOD_DAYS * DAY_MS;

export interface SubscriptionRow {
  status: string;
  price: number;
  trialDays: number;
  test: boolean;
  activatedAt: Date | null;
  frozenAt: Date | null;
  frozenDays: number;
  endedAt: Date | null;
}

/** When Shopify starts charging: activation + trial. Null if never activated. */
export function billingStart(sub: SubscriptionRow) {
  return sub.activatedAt ? new Date(sub.activatedAt.getTime() + sub.trialDays * DAY_MS) : null;
}

/**
 * Estimated number of 30-day periods Shopify has charged. A period is charged
 * at its start, so any started period counts. Trial time and time spent
 * FROZEN (unpaid) are not billed.
 */
export function billedPeriods(sub: SubscriptionRow, now: Date) {
  const start = billingStart(sub);
  if (!start) return 0;
  const end = sub.endedAt ?? sub.frozenAt ?? now;
  const activeMs = end.getTime() - start.getTime() - sub.frozenDays * DAY_MS;
  return activeMs <= 0 ? 0 : Math.ceil(activeMs / PERIOD_MS);
}

export interface SubscriptionMetrics {
  mrr: number;
  billedToDate: number;
  paying: number;
  inTrial: number;
  frozen: number;
  pending: number;
  cancelled: number;
}

export function subscriptionMetrics(
  subs: SubscriptionRow[],
  now: Date,
  { includeTest = false } = {},
): SubscriptionMetrics {
  const m: SubscriptionMetrics = { mrr: 0, billedToDate: 0, paying: 0, inTrial: 0, frozen: 0, pending: 0, cancelled: 0 };
  for (const sub of subs) {
    if (sub.test && !includeTest) continue;
    m.billedToDate += billedPeriods(sub, now) * sub.price;
    const start = billingStart(sub);
    if (sub.status === "ACTIVE" && start) {
      if (now < start) m.inTrial++;
      else {
        m.paying++;
        m.mrr += sub.price; // every plan is billed every 30 days
      }
    } else if (sub.status === "FROZEN") m.frozen++;
    else if (sub.status === "PENDING" || sub.status === "ACCEPTED") m.pending++;
    else if (sub.status === "CANCELLED") m.cancelled++;
  }
  m.mrr = Math.round(m.mrr * 100) / 100;
  m.billedToDate = Math.round(m.billedToDate * 100) / 100;
  return m;
}

/** Install and uninstall counts per week, oldest first, for the last `weeks` weeks. */
export function weeklyCounts(events: { type: string; createdAt: Date }[], now: Date, weeks = 12) {
  const WEEK_MS = 7 * DAY_MS;
  const buckets = Array.from({ length: weeks }, (_, i) => ({
    start: new Date(now.getTime() - (weeks - i) * WEEK_MS),
    installs: 0,
    uninstalls: 0,
  }));
  for (const e of events) {
    const index = weeks - 1 - Math.floor((now.getTime() - e.createdAt.getTime()) / WEEK_MS);
    if (index < 0 || index >= weeks) continue;
    if (e.type === "install" || e.type === "reinstall") buckets[index].installs++;
    else if (e.type === "uninstall") buckets[index].uninstalls++;
  }
  return buckets;
}
