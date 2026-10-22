import { useEffect } from "react";
import { useFetcher, useRouteLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import type { loader as appLoader } from "../routes/app";

/** Shows the last metafield sync error with a Re-sync button. Renders nothing when in sync. */
export function SyncBanner() {
  const data = useRouteLoaderData<typeof appLoader>("routes/app");
  const fetcher = useFetcher<{ ok: boolean; syncError: string | null }>();
  const shopify = useAppBridge();

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) shopify.toast.show("Synced to your store");
  }, [fetcher.state, fetcher.data, shopify]);

  const error = data?.sync.syncError;
  if (!error) return null;
  return (
    <s-banner tone="critical" heading="Your store isn't showing the latest settings">
      <s-paragraph>The last sync to your storefront failed: {error}</s-paragraph>
      <s-button
        slot="secondary-actions"
        onClick={() => fetcher.submit({}, { method: "POST", action: "/app/sync" })}
        {...(fetcher.state !== "idle" ? { loading: true } : {})}
      >
        Re-sync
      </s-button>
    </s-banner>
  );
}
