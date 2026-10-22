import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { syncShopConfig } from "../services/sync.server";

// "Re-sync" button in the sync error banner.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const syncError = await syncShopConfig(admin, session.shop);
  return { ok: !syncError, syncError };
};
