// Shared recharts theming so every chart in the app matches the red/gold Milfore palette.
export const CHART_COLORS = ["#9B1B2A", "#1B4D9B", "#1B7A3E", "#C9A84C", "#8E44AD", "#16A085"];

export const CHART_GRID_COLOR = "#E8E4DC";
export const CHART_AXIS_COLOR = "#888888";
export const CHART_FONT = "Inter, system-ui, sans-serif";

export const tooltipStyle = {
  contentStyle: {
    background: "#fff",
    border: "1px solid #E8E4DC",
    borderRadius: 10,
    fontSize: 12,
    fontFamily: CHART_FONT,
  },
  labelStyle: { fontWeight: 700, color: "#111111" },
};
