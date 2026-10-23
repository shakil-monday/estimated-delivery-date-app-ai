// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BRANDING_HEIGHT, estimateHeight, renderBranding, renderWidget } from "../extensions/delivery-estimate/assets/render.js";
import { PRESETS } from "../app/lib/presets";

const design = { preset: "boxed", ...PRESETS.boxed };

describe("renderWidget", () => {
  it("sets CSS variables, the icon and the text segments", () => {
    const el = renderWidget(design, [
      { text: "Arrives ", isDate: false },
      { text: "Thu, Oct 29", isDate: true },
    ]);
    expect(el.className).toContain("ede--boxed");
    expect(el.style.getPropertyValue("--ede-accent")).toBe("#2c6ecb");
    expect(el.style.getPropertyValue("--ede-radius")).toBe("8px");
    expect(el.querySelector(".ede__icon svg")).not.toBeNull();
    expect(el.querySelector(".ede__date").textContent).toBe("Thu, Oct 29");
    expect(el.textContent).toBe("Arrives Thu, Oct 29");
  });

  it("renders message text as plain text, never HTML", () => {
    const el = renderWidget(design, [{ text: "<img src=x onerror=alert(1)>", isDate: false }]);
    expect(el.querySelector("img")).toBeNull();
    expect(el.textContent).toBe("<img src=x onerror=alert(1)>");
  });

  it("omits the icon when set to none", () => {
    expect(renderWidget({ ...design, icon: "none" }, "Hi").querySelector(".ede__icon")).toBeNull();
  });

  it("estimates height from the tokens", () => {
    // boxed: max(14*1.4≈20, icon 20) + 2*12 padding + 2*1 border
    expect(estimateHeight(design)).toBe(46);
    expect(estimateHeight({ ...design, layout: "icon-top" })).toBe(20 + 20 + 6 + 26);
  });

  it("adds the Free plan branding note's height", () => {
    expect(BRANDING_HEIGHT).toBe(18); // also hard-coded in delivery-estimate.liquid
    expect(estimateHeight(design, true)).toBe(46 + 18);
    expect(renderBranding().textContent).toBe("Powered by Estimated Delivery Date");
  });
});

describe("widget.js", () => {
  const config = {
    version: 1,
    timezone: "UTC",
    processing: { min: 1, max: 2 },
    shipping: { min: 3, max: 5 },
    weekendDays: [0, 6],
    holidays: [],
    regions: [{ name: "EU", countries: ["DE"], shipping: { min: 5, max: 8 } }],
    unmatchedCountry: "hide",
    displayMode: "range",
    messageRange: "Arrives {start} – {end}",
    messageSingle: "Arrives by {end}",
    dateFormat: "short",
    design,
  };
  const placeholder = (cfg, country) => {
    const el = document.createElement("div");
    el.className = "ede-widget";
    el.style.minHeight = "46px";
    el.dataset.config = typeof cfg === "string" ? cfg : JSON.stringify(cfg);
    el.dataset.country = country;
    el.dataset.locale = "en";
    el.dataset.inheritFont = "true";
    document.body.appendChild(el);
    return el;
  };

  beforeEach(() => {
    document.body.innerHTML = "";
    vi.resetModules();
  });

  it("shows the branding note for Free plan configs", async () => {
    const free = placeholder({ ...config, branding: true }, "DE");
    await import("../extensions/delivery-estimate/assets/widget.js");
    expect(free.querySelector(".ede-branding")).not.toBeNull();
  });

  it("renders valid configs and collapses invalid or hidden ones without throwing", async () => {
    const ok = placeholder(config, "DE");
    const hidden = placeholder(config, "US");
    const broken = placeholder("{not json", "DE");
    const missing = placeholder("", "DE");
    await import("../extensions/delivery-estimate/assets/widget.js");

    expect(ok.textContent).toMatch(/^Arrives .+ – .+$/);
    expect(ok.querySelector(".ede--inherit-font")).not.toBeNull();
    expect(ok.style.minHeight).toBe("");
    expect(ok.querySelector(".ede-branding")).toBeNull();
    for (const el of [hidden, broken, missing]) {
      expect(el.textContent).toBe("");
      expect(el.style.minHeight).toBe("");
      expect(el.style.display).toBe("none");
    }
  });
});
