import { ICONS } from "./icons.js";

const ALIGN = { left: "flex-start", center: "center", right: "flex-end" };

// Free plan note under the widget: 14px line + 4px margin (see widget.css).
export const BRANDING_HEIGHT = 18;
const BRANDING_TEXT = "Powered by Estimated Delivery Date";

/**
 * Approximate rendered height in px, used to reserve space and avoid layout shift.
 * Keep in sync with the Liquid calculation in blocks/delivery-estimate.liquid.
 */
export function estimateHeight(design, branding = false) {
  const d = design || {};
  const line = Math.round((d.fontSize || 14) * 1.4);
  const icon = d.icon && d.icon !== "none" ? d.iconSize || 20 : 0;
  const content = d.layout === "icon-top" ? line + (icon ? icon + 6 : 0) : Math.max(line, icon);
  return content + 2 * (d.padding || 0) + 2 * (d.borderWidth || 0) + (branding ? BRANDING_HEIGHT : 0);
}

/** The Free plan's "Powered by" note, placed after the widget. */
export function renderBranding(doc = document) {
  const el = doc.createElement("div");
  el.className = "ede-branding";
  el.textContent = BRANDING_TEXT;
  return el;
}

/**
 * Builds the widget element. `text` is a string or the segments returned by
 * formatEstimateParts; it is always inserted as plain text.
 * @returns {HTMLElement}
 */
export function renderWidget(design, text, doc = document) {
  const d = design || {};
  const root = doc.createElement("div");
  root.className = `ede ede--${d.preset || "boxed"} ede--${d.layout || "icon-left"} ede--align-${d.align || "left"}`;
  const vars = {
    "--ede-text": d.textColor,
    "--ede-accent": d.accentColor,
    "--ede-icon": d.iconColor,
    "--ede-icon-size": `${d.iconSize}px`,
    "--ede-bg": d.background,
    "--ede-border": d.borderColor,
    "--ede-border-width": `${d.borderWidth}px`,
    "--ede-radius": `${d.borderRadius}px`,
    "--ede-pad": `${d.padding}px`,
    "--ede-size": `${d.fontSize}px`,
    "--ede-weight": d.fontWeight,
    "--ede-align": d.align,
    "--ede-justify": ALIGN[d.align] || "flex-start",
  };
  for (const [name, value] of Object.entries(vars)) {
    if (value !== undefined && !String(value).startsWith("undefined")) {
      root.style.setProperty(name, String(value));
    }
  }

  const iconSvg = ICONS[d.icon] || "";
  if (iconSvg) {
    const icon = doc.createElement("span");
    icon.className = "ede__icon";
    icon.innerHTML = iconSvg; // static SVG from icons.js, never user input
    root.appendChild(icon);
  }

  const textEl = doc.createElement("span");
  textEl.className = "ede__text";
  const parts = Array.isArray(text) ? text : [{ text: String(text || ""), isDate: false }];
  for (const part of parts) {
    if (part.isDate) {
      const date = doc.createElement("span");
      date.className = "ede__date";
      date.textContent = part.text;
      textEl.appendChild(date);
    } else {
      textEl.appendChild(doc.createTextNode(part.text));
    }
  }
  root.appendChild(textEl);
  return root;
}
