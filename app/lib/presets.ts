export type Preset = "minimal" | "boxed" | "pill" | "banner";

export interface DesignTokens {
  icon: "truck" | "box" | "calendar" | "clock" | "none";
  iconColor: string;
  iconSize: number;
  textColor: string;
  accentColor: string;
  background: string; // hex color or "transparent"
  borderColor: string;
  borderWidth: number;
  borderRadius: number;
  padding: number;
  fontSize: number;
  fontWeight: 400 | 600 | 700;
  align: "left" | "center" | "right";
  layout: "icon-left" | "icon-top";
}

export type Design = DesignTokens & { preset: Preset };

export const PRESETS: Record<Preset, DesignTokens> = {
  minimal: {
    icon: "truck",
    iconColor: "#303030",
    iconSize: 16,
    textColor: "#303030",
    accentColor: "#303030",
    background: "transparent",
    borderColor: "#e3e3e3",
    borderWidth: 0,
    borderRadius: 0,
    padding: 0,
    fontSize: 14,
    fontWeight: 400,
    align: "left",
    layout: "icon-left",
  },
  boxed: {
    icon: "truck",
    iconColor: "#2c6ecb",
    iconSize: 20,
    textColor: "#1f2124",
    accentColor: "#2c6ecb",
    background: "#f4f6f8",
    borderColor: "#dfe3e8",
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    fontWeight: 400,
    align: "left",
    layout: "icon-left",
  },
  pill: {
    icon: "truck",
    iconColor: "#ffffff",
    iconSize: 16,
    textColor: "#ffffff",
    accentColor: "#ffffff",
    background: "#008060",
    borderColor: "#008060",
    borderWidth: 0,
    borderRadius: 999,
    padding: 8,
    fontSize: 14,
    fontWeight: 600,
    align: "left",
    layout: "icon-left",
  },
  banner: {
    icon: "calendar",
    iconColor: "#ffffff",
    iconSize: 24,
    textColor: "#ffffff",
    accentColor: "#ffe08a",
    background: "#1f2124",
    borderColor: "#1f2124",
    borderWidth: 0,
    borderRadius: 0,
    padding: 16,
    fontSize: 16,
    fontWeight: 600,
    align: "center",
    layout: "icon-left",
  },
};

export const PRESET_LABELS: Record<Preset, { title: string; description: string }> = {
  minimal: { title: "Minimal", description: "No background, small icon" },
  boxed: { title: "Boxed", description: "Light background with a border" },
  pill: { title: "Pill", description: "Rounded, accent background" },
  banner: { title: "Banner", description: "Full width, strong background" },
};

export const DEFAULT_PRESET: Preset = "boxed";
