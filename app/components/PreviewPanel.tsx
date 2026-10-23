import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Await } from "react-router";
import {
  calculateEstimate,
  formatDate,
  formatEstimateParts,
} from "../../extensions/delivery-estimate/assets/estimate.js";
import { renderBranding, renderWidget } from "../../extensions/delivery-estimate/assets/render.js";
import { buildConfig, type RegionValues } from "../lib/config";
import type { HolidayLike } from "../lib/holidays";
import { validateDesign, validateSettings } from "../lib/validation";
import { COUNTRIES, countryName } from "../lib/countries";
import { DateField, Select } from "./fields";
import type { StoreInfo } from "../services/store-info.server";

export interface PreviewPanelProps {
  /** Current (possibly unsaved, possibly invalid) form values. */
  settings: object;
  design: object;
  holidays: HolidayLike[];
  regions: RegionValues[];
  timezone: string;
  /** Today in the shop timezone, "YYYY-MM-DD". */
  today: string;
  /** Same gating as the storefront: Free = no holidays/regions, preset design, branding note. */
  isPro: boolean;
  /** Deferred from the loader (see getStoreInfo). */
  storeInfo: Promise<StoreInfo>;
}

export function PreviewPanel(props: PreviewPanelProps) {
  const [simDate, setSimDate] = useState(props.today);
  const [country, setCountry] = useState("");
  const [mobile, setMobile] = useState(false);
  const [dark, setDark] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  const computed = useMemo(() => {
    const settings = validateSettings(props.settings as Record<string, unknown>);
    const design = validateDesign(props.design as Record<string, unknown>);
    if (!settings.ok || !design.ok) return { invalid: true as const };
    const today = /^\d{4}-\d{2}-\d{2}$/.test(simDate) ? simDate : props.today;
    const config = buildConfig({
      isPro: props.isPro,
      timezone: props.timezone,
      settings: settings.data,
      design: design.data,
      holidays: props.holidays,
      regions: props.regions,
      today,
    });
    const result = calculateEstimate(config, { today, countryCode: country || null });
    const parts = formatEstimateParts(result, config, "en-US");
    return { invalid: false as const, config, result, parts };
  }, [props.settings, props.design, props.holidays, props.regions, props.timezone, props.today, props.isPro, simDate, country]);

  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    if (computed.invalid || !computed.result) {
      el.replaceChildren();
      return;
    }
    el.replaceChildren(renderWidget(computed.config.design, computed.parts));
    if (computed.config.branding) el.appendChild(renderBranding());
  }, [computed]);

  const explanation = (() => {
    if (computed.invalid) return null;
    if (!computed.result) {
      return country
        ? "Hidden: country not in any region"
        : "Hidden: no business day found within 400 days";
    }
    const { explain, start, end } = computed.result;
    const bits = [
      `Region: ${explain.regionName ?? "Default shipping"}`,
      `skipped ${explain.skippedWeekendDays} weekend day${explain.skippedWeekendDays === 1 ? "" : "s"}`,
    ];
    if (explain.skippedHolidays.length) {
      bits.push(
        `skipped holiday${explain.skippedHolidays.length === 1 ? "" : "s"}: ${explain.skippedHolidays
          .map((d: string) => formatDate(d, "short", "en-US"))
          .join(", ")}`,
      );
    }
    return { dates: `${formatDate(start, "long", "en-US")} → ${formatDate(end, "long", "en-US")}`, text: bits.join(" · ") };
  })();

  const countryOptions = useMemo(
    () => [{ value: "", label: "Unknown country" }, ...COUNTRIES.map((c) => ({ value: c.code, label: c.name }))],
    [],
  );

  return (
    <s-section heading="Preview">
      <s-stack direction="block" gap="base">
        <s-stack direction="inline" gap="small-200">
          <s-button variant={mobile ? "secondary" : "primary"} onClick={() => setMobile(false)}>
            Desktop
          </s-button>
          <s-button variant={mobile ? "primary" : "secondary"} onClick={() => setMobile(true)}>
            Mobile
          </s-button>
          <s-button variant="tertiary" onClick={() => setDark(!dark)}>
            {dark ? "Light background" : "Dark background"}
          </s-button>
        </s-stack>

        <div
          style={{
            background: dark ? "#1a1a1a" : "#ffffff",
            border: "1px solid #e3e3e3",
            borderRadius: 8,
            padding: 16,
            minHeight: 64,
          }}
        >
          <div style={{ maxWidth: mobile ? 360 : "100%", margin: "0 auto" }}>
            {computed.invalid ? (
              <s-text color="subdued">Fix the highlighted fields to update the preview.</s-text>
            ) : (
              <div ref={previewRef} className="ede-widget" />
            )}
          </div>
        </div>

        <s-heading>Simulator</s-heading>
        <Select label="Shopper country" value={country} onChange={setCountry} options={countryOptions} />
        <DateField label="Pretend today is" value={simDate} onChange={setSimDate} details={`Shop timezone: ${props.timezone}`} />
        {explanation && (
          <s-box padding="base" background="subdued" borderRadius="base">
            {typeof explanation === "string" ? (
              <s-text>{explanation}</s-text>
            ) : (
              <s-stack direction="block" gap="small-200">
                <s-text type="strong">{explanation.dates}</s-text>
                <s-text>{explanation.text}</s-text>
              </s-stack>
            )}
          </s-box>
        )}
        {country && !computed.invalid && (
          <s-text color="subdued">
            Simulating a shopper from {countryName(country)}.
          </s-text>
        )}

        <StoreButtons storeInfo={props.storeInfo} />
      </s-stack>
    </s-section>
  );
}

export function StoreButtons({ storeInfo }: { storeInfo: Promise<StoreInfo> }) {
  return (
    <Suspense
      fallback={
        <s-button loading disabled>
          Preview on your store
        </s-button>
      }
    >
      <Await resolve={storeInfo} errorElement={<s-text color="subdued">Couldn&apos;t load your store links.</s-text>}>
        {(info) => (
          <s-stack direction="inline" gap="small-200">
            {info.previewUrl && (
              <s-button href={info.previewUrl} target="_blank">
                Preview on your store
              </s-button>
            )}
            {info.blockInstalled !== true && (
              <s-button variant="secondary" href={info.addBlockUrl} target="_blank">
                Add to theme
              </s-button>
            )}
          </s-stack>
        )}
      </Await>
    </Suspense>
  );
}
