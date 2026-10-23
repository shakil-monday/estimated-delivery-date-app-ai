import { useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData, type SubmitTarget } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { loadShopData } from "../services/shop.server";
import { syncShopConfig } from "../services/sync.server";
import { getStoreInfo } from "../services/store-info.server";
import { validateDesign, type Errors } from "../lib/validation";
import {
  PRESETS,
  PRESET_LABELS,
  type Design,
  type Preset,
} from "../lib/presets";
import { todayInTimezone } from "../../extensions/delivery-estimate/assets/estimate.js";
import {
  Checkbox,
  ColorField,
  NumberField,
  Select,
} from "../components/fields";
import { PreviewPanel } from "../components/PreviewPanel";
import { SyncBanner } from "../components/SyncBanner";
import { ProBanner } from "../components/ProBanner";
import { getPlan } from "../services/analytics.server";
import { isPro } from "../lib/plans";
import { useFetcherResult } from "../components/hooks";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const data = await loadShopData(session.shop);
  return {
    settings: data.settings,
    design: data.design,
    holidays: data.holidays,
    regions: data.regions,
    timezone: data.timezone,
    isPro: data.isPro,
    today: todayInTimezone(new Date(), data.timezone),
    storeInfo: getStoreInfo(admin, session.shop), // not awaited: streams in
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const result = validateDesign(await request.json());
  if (!result.ok) return { ok: false as const, errors: result.errors };

  const { preset, ...tokens } = result.data;
  const pro = isPro(await getPlan(session.shop));
  await db.widgetDesign.upsert({
    where: { shop: session.shop },
    create: {
      shop: session.shop,
      preset,
      style: JSON.stringify(pro ? tokens : PRESETS[preset]),
    },
    // Free: only the preset changes; any custom style saved on Pro is kept for later.
    update: pro ? { preset, style: JSON.stringify(tokens) } : { preset },
  });
  await db.shopSettings.update({
    where: { shop: session.shop },
    data: { designSavedAt: new Date() },
  });
  const syncError = await syncShopConfig(admin, session.shop);
  return { ok: true as const, syncError };
};

type FormDesign = Omit<
  Design,
  | "iconSize"
  | "borderWidth"
  | "borderRadius"
  | "padding"
  | "fontSize"
  | "fontWeight"
> & {
  iconSize: string | number;
  borderWidth: string | number;
  borderRadius: string | number;
  padding: string | number;
  fontSize: string | number;
  fontWeight: string | number;
};

const ICON_OPTIONS = [
  { value: "truck", label: "Truck" },
  { value: "box", label: "Box" },
  { value: "calendar", label: "Calendar" },
  { value: "clock", label: "Clock" },
  { value: "none", label: "No icon" },
];

export default function DesignPage() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const [design, setDesign] = useState<FormDesign>(data.design);
  const [errors, setErrors] = useState<Errors>({});
  const [lastColor, setLastColor] = useState(
    data.design.background === "transparent"
      ? "#ffffff"
      : data.design.background,
  );

  const set = (key: keyof FormDesign) => (value: unknown) =>
    setDesign((d) => ({ ...d, [key]: value }));
  const applyPreset = (preset: Preset) => {
    setDesign({ ...PRESETS[preset], preset });
    setErrors({});
  };

  useFetcherResult(fetcher, (data) => {
    if (data.ok) {
      setErrors({});
      if (data.syncError)
        shopify.toast.show("Saved, but the store couldn't be updated", {
          isError: true,
        });
      else shopify.toast.show("Saved");
    } else {
      setErrors(data.errors);
      shopify.toast.show("Fix the highlighted fields", { isError: true });
    }
  });

  const transparent = design.background === "transparent";

  return (
    <s-page heading="Design">
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={() =>
          fetcher.submit(design as SubmitTarget, {
            method: "POST",
            encType: "application/json",
          })
        }
        {...(fetcher.state !== "idle" ? { loading: true } : {})}
      >
        Save
      </s-button>

      <SyncBanner />

      <s-section heading="Preset">
        <s-stack direction="block" gap="base">
          <s-grid
            gridTemplateColumns="repeat(auto-fit, minmax(140px, 1fr))"
            gap="base"
          >
            {(Object.keys(PRESETS) as Preset[]).map((preset) => (
              <s-clickable
                key={preset}
                onClick={() => applyPreset(preset)}
                border={design.preset === preset ? "large" : "base"}
                borderColor={design.preset === preset ? "strong" : "base"}
                borderRadius="base"
                padding="base"
              >
                <s-stack direction="block" gap="small-200">
                  <s-text type="strong">{PRESET_LABELS[preset].title}</s-text>
                  <s-text color="subdued">
                    {PRESET_LABELS[preset].description}
                  </s-text>
                  {design.preset === preset && (
                    <s-badge tone="info">Selected</s-badge>
                  )}
                </s-stack>
              </s-clickable>
            ))}
          </s-grid>
          <s-button
            variant="secondary"
            onClick={() => applyPreset(design.preset)}
          >
            Reset to preset
          </s-button>
        </s-stack>
      </s-section>

      {!data.isPro ? (
        <ProBanner feature="Custom styles" />
      ) : (
        <>
          <s-section heading="Icon">
            <s-grid gridTemplateColumns="1fr 1fr" gap="base">
              <Select
                label="Icon"
                value={design.icon}
                onChange={set("icon")}
                options={ICON_OPTIONS}
                error={errors.icon}
              />
              <Select
                label="Layout"
                value={design.layout}
                onChange={set("layout")}
                options={[
                  { value: "icon-left", label: "Icon left of text" },
                  { value: "icon-top", label: "Icon above text" },
                ]}
              />
              <ColorField
                label="Icon color"
                value={design.iconColor}
                onChange={set("iconColor")}
                error={errors.iconColor}
              />
              <NumberField
                label="Icon size"
                suffix="px"
                value={design.iconSize}
                onChange={set("iconSize")}
                min={12}
                max={32}
                error={errors.iconSize}
              />
            </s-grid>
          </s-section>

          <s-section heading="Text">
            <s-grid gridTemplateColumns="1fr 1fr" gap="base">
              <ColorField
                label="Text color"
                value={design.textColor}
                onChange={set("textColor")}
                error={errors.textColor}
              />
              <ColorField
                label="Date color"
                value={design.accentColor}
                onChange={set("accentColor")}
                error={errors.accentColor}
                details="Colors the dates in the message."
              />
              <NumberField
                label="Font size"
                suffix="px"
                value={design.fontSize}
                onChange={set("fontSize")}
                min={11}
                max={24}
                error={errors.fontSize}
              />
              <Select
                label="Font weight"
                value={String(design.fontWeight)}
                onChange={(v) => set("fontWeight")(Number(v))}
                options={[
                  { value: "400", label: "Regular" },
                  { value: "600", label: "Semibold" },
                  { value: "700", label: "Bold" },
                ]}
              />
              <Select
                label="Alignment"
                value={design.align}
                onChange={set("align")}
                options={[
                  { value: "left", label: "Left" },
                  { value: "center", label: "Center" },
                  { value: "right", label: "Right" },
                ]}
              />
            </s-grid>
          </s-section>

          <s-section heading="Box">
            <s-stack direction="block" gap="base">
              <Checkbox
                label="Transparent background"
                checked={transparent}
                onChange={(on) => {
                  if (on && !transparent) setLastColor(design.background);
                  set("background")(on ? "transparent" : lastColor);
                }}
              />
              <s-grid gridTemplateColumns="1fr 1fr" gap="base">
                {!transparent && (
                  <ColorField
                    label="Background"
                    value={design.background}
                    onChange={set("background")}
                    error={errors.background}
                  />
                )}
                <ColorField
                  label="Border color"
                  value={design.borderColor}
                  onChange={set("borderColor")}
                  error={errors.borderColor}
                />
                <NumberField
                  label="Border width"
                  suffix="px"
                  value={design.borderWidth}
                  onChange={set("borderWidth")}
                  min={0}
                  max={4}
                  error={errors.borderWidth}
                />
                <NumberField
                  label="Corner radius"
                  suffix="px"
                  value={design.borderRadius}
                  onChange={set("borderRadius")}
                  min={0}
                  max={999}
                  error={errors.borderRadius}
                />
                <NumberField
                  label="Padding"
                  suffix="px"
                  value={design.padding}
                  onChange={set("padding")}
                  min={0}
                  max={32}
                  error={errors.padding}
                />
              </s-grid>
            </s-stack>
          </s-section>
        </>
      )}

      <div slot="aside">
        <PreviewPanel
          settings={data.settings}
          design={design}
          holidays={data.holidays}
          regions={data.regions}
          timezone={data.timezone}
          today={data.today}
          isPro={data.isPro}
          storeInfo={data.storeInfo}
        />
      </div>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) =>
  boundary.headers(headersArgs);
