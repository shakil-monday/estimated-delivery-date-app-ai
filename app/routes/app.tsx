import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";
import db from "../db.server";
import { ensureShopSetup } from "../services/sync.server";
import { refreshBilling } from "../services/billing.server";
// Storefront widget styles, for the admin preview (see vite.config.ts).
// eslint-disable-next-line import/no-unresolved
import widgetCss from "virtual:ede-widget-css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  await ensureShopSetup(admin, session.shop);
  const plan = await refreshBilling(admin, session.shop); // daily safety net for missed webhooks
  const settings = await db.shopSettings.findUnique({
    where: { shop: session.shop },
    select: { lastSyncedAt: true, syncError: true },
  });

  // eslint-disable-next-line no-undef
  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    plan,
    sync: {
      lastSyncedAt: settings?.lastSyncedAt?.toISOString() ?? null,
      syncError: settings?.syncError ?? null,
    },
  };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider apiKey={apiKey}>
      <style dangerouslySetInnerHTML={{ __html: widgetCss }} />
      <s-app-nav>
        <s-link href="/app">Home</s-link>
        <s-link href="/app/settings">Settings</s-link>
        <s-link href="/app/design">Design</s-link>
        <s-link href="/app/holidays">Holidays</s-link>
        <s-link href="/app/regions">Regions</s-link>
        <s-link href="/app/plan">Plan</s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
