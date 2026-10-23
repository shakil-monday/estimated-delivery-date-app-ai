import type { ActionFunctionArgs } from "react-router";
import { authenticate, unauthenticated } from "../shopify.server";
import { applySubscriptionStatus } from "../services/analytics.server";
import { syncShopConfig } from "../services/sync.server";

interface AppSubscriptionPayload {
  app_subscription?: {
    admin_graphql_api_id: string;
    name: string;
    status: string; // ACTIVE | CANCELLED | DECLINED | EXPIRED | FROZEN | PENDING | ACCEPTED
    currency?: string;
  };
}

// Source of truth for plan changes: activation, cancellation, decline, expiry,
// and FROZEN (merchant didn't pay their Shopify bill) / unfrozen.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  const sub = (payload as AppSubscriptionPayload).app_subscription;
  if (!sub) return new Response();

  const { before, after } = await applySubscriptionStatus({
    shop,
    subscriptionId: sub.admin_graphql_api_id,
    name: sub.name,
    status: sub.status,
    currency: sub.currency,
  });

  if (before !== after) {
    // Gate or ungate Pro features on the storefront right away.
    try {
      const { admin } = await unauthenticated.admin(shop);
      await syncShopConfig(admin, shop);
    } catch (error) {
      console.error(`Config re-sync after plan change failed for ${shop}`, error);
    }
  }
  return new Response();
};
