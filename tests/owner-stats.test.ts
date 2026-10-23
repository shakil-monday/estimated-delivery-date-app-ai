import { describe, expect, it } from "vitest";
import { billedPeriods, subscriptionMetrics, weeklyCounts, type SubscriptionRow } from "../app/lib/owner-metrics";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-10-22T00:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * DAY);
const sub = (overrides: Partial<SubscriptionRow>): SubscriptionRow => ({
  status: "ACTIVE",
  price: 4.99,
  trialDays: 7,
  test: false,
  activatedAt: daysAgo(100),
  frozenAt: null,
  frozenDays: 0,
  endedAt: null,
  ...overrides,
});

describe("billedPeriods", () => {
  it("bills nothing during the trial", () => {
    expect(billedPeriods(sub({ activatedAt: daysAgo(3) }), now)).toBe(0);
  });

  it("charges each started 30-day period after the trial", () => {
    expect(billedPeriods(sub({ activatedAt: daysAgo(8) }), now)).toBe(1); // 1 day into period 1
    expect(billedPeriods(sub({ activatedAt: daysAgo(37) }), now)).toBe(1); // exactly 30 days billed
    expect(billedPeriods(sub({ activatedAt: daysAgo(38) }), now)).toBe(2); // period 2 started
  });

  it("stops at the end date for cancelled subscriptions", () => {
    expect(billedPeriods(sub({ status: "CANCELLED", activatedAt: daysAgo(100), endedAt: daysAgo(60) }), now)).toBe(2);
  });

  it("excludes time spent frozen", () => {
    // Billing started 93 days ago; 30 of those days were frozen → 63 days → 3 periods.
    expect(billedPeriods(sub({ frozenDays: 30 }), now)).toBe(3);
    // Currently frozen since 50 days ago: counts until the freeze.
    expect(billedPeriods(sub({ status: "FROZEN", frozenAt: daysAgo(50) }), now)).toBe(2);
  });

  it("is 0 for never-activated subscriptions", () => {
    expect(billedPeriods(sub({ status: "EXPIRED", activatedAt: null }), now)).toBe(0);
  });
});

describe("subscriptionMetrics", () => {
  const subs = [
    sub({}), // paying
    sub({ activatedAt: daysAgo(2) }), // in trial
    sub({ status: "FROZEN", frozenAt: daysAgo(5) }),
    sub({ status: "CANCELLED", endedAt: daysAgo(10) }),
    sub({ status: "PENDING", activatedAt: null }),
    sub({ test: true }), // test charge
  ];

  it("counts statuses and MRR, excluding test charges", () => {
    const m = subscriptionMetrics(subs, now);
    expect(m).toMatchObject({ paying: 1, inTrial: 1, frozen: 1, cancelled: 1, pending: 1, mrr: 4.99 });
  });

  it("includes test charges when asked", () => {
    expect(subscriptionMetrics(subs, now, { includeTest: true }).paying).toBe(2);
  });

  it("sums billed-to-date across subscriptions", () => {
    const m = subscriptionMetrics([sub({ activatedAt: daysAgo(38) }), sub({ activatedAt: daysAgo(8) })], now);
    expect(m.billedToDate).toBe(14.97); // 2 + 1 periods × 4.99
  });
});

describe("weeklyCounts", () => {
  it("buckets installs and uninstalls by week", () => {
    const weeks = weeklyCounts(
      [
        { type: "install", createdAt: daysAgo(1) },
        { type: "reinstall", createdAt: daysAgo(2) },
        { type: "uninstall", createdAt: daysAgo(8) },
        { type: "install", createdAt: daysAgo(200) }, // outside 12 weeks
      ],
      now,
    );
    expect(weeks).toHaveLength(12);
    expect(weeks[11]).toMatchObject({ installs: 2, uninstalls: 0 });
    expect(weeks[10]).toMatchObject({ installs: 0, uninstalls: 1 });
  });
});
