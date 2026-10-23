import { PRO_PRICE, PRO_TRIAL_DAYS } from "../lib/plans";

/** Shown on Pro-only pages for Free shops. Existing data is kept, just not used on the storefront. */
export function ProBanner({ feature }: { feature: string }) {
  return (
    <s-banner tone="info" heading={`${feature} are a Pro feature`}>
      <s-paragraph>
        Upgrade to Pro (${PRO_PRICE}/month, {PRO_TRIAL_DAYS}-day free trial) to use {feature.toLowerCase()} in your
        delivery estimates. Anything you added before is kept and applies again as soon as you upgrade.
      </s-paragraph>
      <s-button slot="secondary-actions" href="/app/plan">
        See plans
      </s-button>
    </s-banner>
  );
}

export const PRO_REQUIRED_ERROR = "Upgrade to Pro to change this.";
