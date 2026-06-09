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

          if (!status || !Number.isFinite(count) || count < 0) {
            return null;
          }

          return {
            status,
            count,
            percentage: Number.isFinite(percentage) && percentage >= 0 ? percentage : 0,
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