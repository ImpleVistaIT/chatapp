const STATUS_COLOR_MAP = {
  "approved for production": "#2E7D32",
  "imported in production": "#1565C0",
  "in development": "#EF6C00",
  "ready for test": "#6A1B9A",
  "tested ok": "#616161",
  "under implementation": "#C62828",
};

function normalizeStatusLabel(value) {
  return String(value || "").trim().toLowerCase();
}

export function normalizeSolmanStatusChart(chart) {
  if (!chart || typeof chart !== "object") return null;

  const candidate = chart?.type === "status_distribution" ? chart : chart?.chartType ? chart : null;
  if (!candidate) return null;

  const data = Array.isArray(candidate.data)
    ? candidate.data
        .map((item) => {
          const status = String(item?.status || "").trim();
          const count = Number(item?.count);
          const percentage = Number(item?.percentage);
          const color = STATUS_COLOR_MAP[normalizeStatusLabel(status)] || "#64748b";

          if (!status || !Number.isFinite(count) || count < 0) {
            return null;
          }

          return {
            status,
            count,
            percentage: Number.isFinite(percentage) && percentage >= 0 ? percentage : 0,
            color,
          };
        })
        .filter(Boolean)
    : [];

  if (data.length === 0) return null;

  const totalCRs = Number(candidate.totalCRs);

  return {
    type: "status_distribution",
    chartType: String(candidate.chartType || "donut").trim() || "donut",
    title: String(candidate.title || "CR Status Distribution").trim() || "CR Status Distribution",
    totalCRs: Number.isFinite(totalCRs) ? totalCRs : data.reduce((sum, item) => sum + item.count, 0),
    filters: candidate.filters && typeof candidate.filters === "object" && !Array.isArray(candidate.filters)
      ? candidate.filters
      : {},
    data,
  };
}