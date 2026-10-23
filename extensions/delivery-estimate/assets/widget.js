// Storefront entry point. Loaded as a module (deferred by default).
import { calculateEstimate, formatEstimateParts } from "./estimate.js";
import { renderBranding, renderWidget } from "./render.js";

function collapse(el) {
  el.style.minHeight = "";
  el.style.display = "none";
}

function mount(el) {
  if (el.dataset.edeMounted) return;
  el.dataset.edeMounted = "1";
  try {
    const config = JSON.parse(el.dataset.config || "null");
    if (!config || config.version !== 1) return collapse(el);
    const result = calculateEstimate(config, {
      now: new Date(),
      countryCode: el.dataset.country || null,
    });
    if (!result) return collapse(el);
    const parts = formatEstimateParts(result, config, el.dataset.locale || undefined);
    const widget = renderWidget(config.design, parts);
    if (el.dataset.inheritFont === "true") widget.classList.add("ede--inherit-font");
    el.replaceChildren(widget);
    if (config.branding) el.appendChild(renderBranding());
    el.style.minHeight = "";
  } catch (e) {
    collapse(el);
  }
}

function mountAll() {
  document.querySelectorAll(".ede-widget").forEach(mount);
}

mountAll();
// Theme editor re-renders sections without a page load.
document.addEventListener("shopify:section:load", mountAll);
document.addEventListener("shopify:block:select", mountAll);
