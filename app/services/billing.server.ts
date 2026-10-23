import db from "../db.server";
import type { Plan } from "../lib/plans";
import { applySubscriptionStatus, getPlan } from "./analytics.server";
import { syncShopConfig, type AdminClient } from "./sync.server";

/** Test charges in dev (dev stores can't be charged) or when BILLING_TEST=true. */
export function isTestBilling() {
  return process.env.NODE_ENV !== "production" || process.env.BILLING_TEST === "true";
}

const RECHECK_MS = 24 * 60 * 60 * 1000;

const SUBSCRIPTIONS_QUERY = `#graphql
  query DeliveryBilling {
    currentAppInstallation {
      app { handle }
      allSubscriptions(first: 25, reverse: true) {
        nodes {
          id
          name
          status
          test
          trialDays
          lineItems {
            plan {
              pricingDetails {
                ... on AppRecurringPricing { price { amount currencyCode } }
              }
            }
          }
        }
      }
    }
  }`;

interface SubscriptionNode {
  id: string;
  name: string;
  status: string;
  test: boolean;
  trialDays: number;
  lineItems: { plan: { pricingDetails: { price?: { amount: string; currencyCode: string } } } }[];
}

/**
 * Safety net for missed app_subscriptions/update webhooks: reads every
 * subscription of this shop from Shopify and applies its status. Runs at most
 * once a day unless `force` (e.g. right after the merchant approves a charge).
 * Re-syncs the storefront config when the plan changes.
 */
export async function refreshBilling(admin: AdminClient, shop: string, { force = false } = {}): Promise<Plan> {
  const install = await db.shopInstall.findUnique({ where: { shop } });
  const fresh = install?.billingCheckedAt && Date.now() - install.billingCheckedAt.getTime() < RECHECK_MS;
  if (!force && fresh) return getPlan(shop);

  try {
    const json = await (await admin.graphql(SUBSCRIPTIONS_QUERY)).json();
    const installation = json.data?.currentAppInstallation;
    const nodes: SubscriptionNode[] = installation?.allSubscriptions?.nodes ?? [];
    const before = await getPlan(shop);
    for (const node of nodes) {
      const price = node.lineItems?.[0]?.plan?.pricingDetails?.price;
      await applySubscriptionStatus({
        shop,
        subscriptionId: node.id,
        name: node.name,
        status: node.status,
        test: node.test,
        trialDays: node.trialDays,
        price: price ? Number(price.amount) : undefined,
        currency: price?.currencyCode,
      });
    }
    await db.shopInstall.update({
      where: { shop },
      data: { billingCheckedAt: new Date(), appHandle: installation?.app?.handle ?? install?.appHandle ?? null },
    });
    const after = await getPlan(shop);
    if (after !== before) await syncShopConfig(admin, shop);
    return after;
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("Billing refresh failed", error);
    return getPlan(shop);
  }
}
