import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReplyTable from "./ReplyTable";
import { replyToTable } from "../utils/replyToTable";
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { FiAlertTriangle, FiArrowRight, FiSearch } from "react-icons/fi";
import { normalizeSolmanStatusChart } from "../utils/solmanChart.js";

// =========================
// AVATAR
// =========================
function Avatar({ role, showAvatar = true }) {
  const isUser = role === "user";

  if (!showAvatar) {
    return <div className="w-10 shrink-0" />;
  }

  if (isUser) {
    return null;
  }

  return (
    <div
      className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-white shadow-sm"
      title="Bot"
    >
      <video
        src="/bot.mp4"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        className="h-full w-full object-cover scale-110"
      />
    </div>
  );
}

// =========================
// FORMAT TEXT
// =========================
function formatText(text = "") {
  const t = String(text || "").trim();

  if (!t.includes("\n") && t.includes("Item")) {
    return t
      .split(/(?=Item\s+\d+)/g)
      .map((l) => l.trim())
      .join("\n");
  }

  return t;
}

function formatFilterRangeText(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";

  const compact = text.replace(/[^0-9]/g, "");
  if (/^\d{8}$/.test(compact)) {
    return `${compact.slice(0, 4)}/${compact.slice(4, 6)}/${compact.slice(6, 8)}`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text.replaceAll("-", "/");
  }

  return text;
}

function extractFilterRange(data = {}, chart = null) {
  const candidates = [
    data?.dateRange,
    data?.filters,
    chart?.filters,
    data,
  ];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;

    const from = formatFilterRangeText(
      candidate?.fromDate || candidate?.from || candidate?.startDate || candidate?.start
    );
    const to = formatFilterRangeText(
      candidate?.toDate || candidate?.to || candidate?.endDate || candidate?.end
    );

    if (from || to) {
      return `${from || "-"} to ${to || "-"}`;
    }
  }

  return "";
}

function normalizeSearchText(value = "") {
  return String(value || "").trim().toLowerCase();
}

function normalizeDateValue(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";

  const compact = text.replace(/[^0-9]/g, "");
  if (/^\d{8}$/.test(compact)) {
    return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  return formatSolmanDate(text).replaceAll("/", "-");
}

function getSolmanSearchFields(row = {}) {
  return {
    crNumber: String(
      row?.PO_NO ||
        row?.PoNo ||
        row?.PO_NUMBER ||
        row?.PO ||
        row?.OBJECT_ID ||
        row?.OBJ_ID ||
        row?.CR_NUMBER ||
        row?.CR_NO ||
        row?.CR ||
        ""
    ).trim(),
    shortDescription: String(
      row?.SHORT_DESC ||
        row?.SHORT_DESCRIPTION ||
        row?.DESCRIPTION ||
        row?.DESC ||
        ""
    ).trim(),
    createdOn: normalizeDateValue(
      row?.CREATED_ON ||
        row?.CREATEDON ||
        row?.CREATED_AT ||
        row?.CreatedOn ||
        row?.CreatedAt ||
        ""
    ),
  };
}

function matchesSolmanSearch(row = {}, filters = {}) {
  const crNumber = normalizeSearchText(filters?.crNumber || filters?.poNumber);
  const shortDescription = normalizeSearchText(filters?.shortDescription);
  const createdOn = normalizeDateValue(filters?.createdOn);

  const rowFields = getSolmanSearchFields(row);

  if (crNumber && !normalizeSearchText(rowFields.crNumber).includes(crNumber)) {
    return false;
  }

  if (shortDescription && !normalizeSearchText(rowFields.shortDescription).includes(shortDescription)) {
    return false;
  }

  if (createdOn && rowFields.createdOn !== createdOn) {
    return false;
  }

  return true;
}

function getSuggestionLabel(suggestion) {
  if (typeof suggestion === "string") return suggestion;
  if (suggestion && typeof suggestion === "object") {
    return (
      suggestion.label ||
      suggestion.text ||
      suggestion?.action?.label ||
      "Action"
    );
  }
  return "";
}

function buildStructuredTable(data) {
  if (!data) return null;

  const viewType = String(data.viewType || "").trim();
  if (viewType !== "transport_list_table" && viewType !== "transport_dependency_table") return null;

  const columns = Array.isArray(data.columns) ? data.columns : [];
  const rawRows = Array.isArray(data.tableRows) ? data.tableRows : [];

  if (viewType === "transport_list_table" && rawRows.length === 0 && String(data.emptyState || "").trim()) {
    return {
      columns: ["Message"],
      rows: [[String(data.emptyState).trim()]],
      forceGrid: true,
      _meta: {
        totalRows: 0,
        cappedTo: 0,
      },
    };
  }

  if (!columns.length || !rawRows.length) return null;

  const rows =
    viewType === "transport_dependency_table"
      ? rawRows.map((row) => [
          row.originalTransport ?? "-",
          row.dependentTransport ?? "-",
          row.description ?? "-",
          row.owner ?? "-",
          row.exportedOn ?? "-",
          row.importedOn ?? "-",
        ])
      : rawRows.map((row) => [
          row.no ?? "-",
          row.transport ?? "-",
          row.description ?? "-",
          row.owner ?? "-",
          row.transportType ?? "-",
          row.task ?? "-",
          row.taskOwner ?? "-",
          row.taskType ?? "-",
          row.devCreated ?? "-",
          row.devReleased ?? "-",
          row.taskReleased ?? "-",
        ]);

  return {
    columns,
    rows,
    forceGrid: true,
    _meta: {
      totalRows: rawRows.length,
      cappedTo: rawRows.length,
    },
  };
}

function buildRowsFromChartOrTable(data) {
  if (!data || typeof data !== "object") return [];

  if (Array.isArray(data.allCRRecords)) return data.allCRRecords;
  if (Array.isArray(data.rows)) return data.rows;
  if (Array.isArray(data.tableRows)) return data.tableRows;
  if (Array.isArray(data.data)) return data.data;

  return [];
}

function buildStatusChart(chart) {
  try {
    const normalized = normalizeSolmanStatusChart(chart);

    if (!normalized) return null;

    return { normalized };
  } catch (e) {
    console.error("Chart parse error:", e);
    return { error: true };
  }
}

function buildStatusChartFromRows(data) {
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  if (rows.length === 0) return null;

  const counts = new Map();

  for (const row of rows) {
    const status = String(row?.STATUS || row?.status || "").trim();
    if (!status) continue;
    counts.set(status, (counts.get(status) || 0) + 1);
  }

  if (counts.size === 0) return null;

  const totalCRs = rows.length;

  return {
    normalized: {
      type: "status_distribution",
      chartType: "donut",
      title: "CR Status Distribution",
      totalCRs,
      data: [...counts.entries()].map(([status, count]) => ({
        status,
        count,
        percentage: Math.round((count / totalCRs) * 100),
      })),
    },
  };
}

function normalizeSolmanStatus(value = "") {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function getSolmanCrNumber(row = {}) {
  return String(
    row?.OBJECT_ID ||
      row?.OBJ_ID ||
      row?.CR_NUMBER ||
      row?.CR_NO ||
      row?.CR ||
      "-"
  ).trim() || "-";
}

function getSolmanStatusLabel(row = {}) {
  return String(
    row?.STATUS ||
      row?.status ||
      row?.STATUS_TEXT ||
      row?.statusText ||
      row?.STATUSNAME ||
      row?.STATE ||
      "Unknown"
  ).trim() || "Unknown";
}

function formatSolmanDate(value = "") {
  const text = String(value || "").trim();
  if (!text) return "-";

  const compact = text.replace(/[^0-9]/g, "");
  if (/^\d{8}$/.test(compact)) {
    return `${compact.slice(0, 4)}/${compact.slice(4, 6)}/${compact.slice(6, 8)}`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text.replaceAll("-", "/");
  }

  return text;
}

function dedupeSolmanRecords(rows = []) {
  const seen = new Set();

  return (Array.isArray(rows) ? rows : []).filter((row, index) => {
    const key = String(row?.OBJECT_ID || row?.OBJ_ID || row?.CR_NUMBER || row?.CR_NO || "").trim();
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildSolmanStatusDistribution(rows = []) {
  const buckets = new Map();
  const labelMap = new Map();

  for (const row of Array.isArray(rows) ? rows : []) {
    const rawLabel = getSolmanStatusLabel(row);
    const normalized = normalizeSolmanStatus(rawLabel) || "unknown";
    const displayLabel = rawLabel || "Unknown";

    if (!labelMap.has(normalized)) {
      labelMap.set(normalized, displayLabel);
    }

    buckets.set(normalized, (buckets.get(normalized) || 0) + 1);
  }

  if (buckets.size === 0) return null;

  const totalCRs = Array.isArray(rows) ? rows.length : 0;

  return {
    type: "status_distribution",
    chartType: "donut",
    title: "CR Status Distribution",
    totalCRs,
    data: Array.from(buckets.entries()).map(([normalized, count], index) => {
      const displayStatus = labelMap.get(normalized) || "Unknown";
      return {
        status: displayStatus,
        normalizedStatus: normalized,
        count,
        percentage: totalCRs > 0 ? Math.round((count / totalCRs) * 100) : 0,
        color: [
          "#2E7D32",
          "#1565C0",
          "#EF6C00",
          "#6A1B9A",
          "#616161",
          "#C62828",
          "#00838F",
          "#5D4037",
        ][index % 8],
      };
    }),
  };
}

function buildSolmanStatusTableRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).map((row, index) => [
    String(index + 1),
    getSolmanCrNumber(row),
    getSolmanStatusLabel(row),
    formatSolmanDate(row?.CREATED_ON || row?.CREATEDON || row?.CREATED_AT || row?.CreatedOn || ""),
    String(row?.SHORT_DESC || row?.SHORT_DESCRIPTION || row?.DESCRIPTION || "-").trim() || "-",
  ]);
}

const INITIAL_CR_BATCH_SIZE = 30;
const LOAD_MORE_CR_BATCH_SIZE = 20;

export default function MessageBubble({
  role,
  text,
  summary,
  data,
  chart = null,
  suggestions,
  action,
  onSuggestionClick,
  showAvatar = true,
}) {
  const isUser = role === "user";
  const formattedText = formatText(text);
  const chartSource = chart || data?.chart || data?.statusDistribution || data;
  const chartView = buildStatusChart(chartSource) || buildStatusChartFromRows(data);
  const chartContainerRef = useRef(null);
  const isSolmanStatusResponse = Boolean(
    data?.viewType === "solman_cr_status" ||
      Array.isArray(data?.allCRRecords)
  );
  const safeSummary = String(summary || "").trim();
  const safeSuggestions = Array.isArray(suggestions) ? suggestions : [];
  const [isSmallScreen, setIsSmallScreen] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 640px)");
    const update = (event) => {
      setIsSmallScreen(Boolean(event?.matches));
    };

    setIsSmallScreen(media.matches);

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    }

    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  const tableSourceRows = useMemo(
    () =>
      dedupeSolmanRecords(
        Array.isArray(data?.tableRecords)
          ? data.tableRecords
          : Array.isArray(data?.rows)
            ? data.rows
            : buildRowsFromChartOrTable(data)
      ),
    [data]
  );

  const [allCRRecords, setAllCRRecords] = useState([]);
  const [selectedStatus, setSelectedStatus] = useState("");
  const [statusDistribution, setStatusDistribution] = useState(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState({
    crNumber: "",
    shortDescription: "",
    createdOn: "",
  });
  const [appliedSearch, setAppliedSearch] = useState({
    crNumber: "",
    shortDescription: "",
    createdOn: "",
  });
  const [visibleRecordCount, setVisibleRecordCount] = useState(INITIAL_CR_BATCH_SIZE);

  useEffect(() => {
    if (!isSolmanStatusResponse) {
      setAllCRRecords([]);
      setSelectedStatus("");
      setStatusDistribution(null);
      setIsSearchOpen(false);
      setSearchDraft({ crNumber: "", shortDescription: "", createdOn: "" });
      setAppliedSearch({ crNumber: "", shortDescription: "", createdOn: "" });
      return;
    }

    const sourceRows = dedupeSolmanRecords(
      Array.isArray(data?.allCRRecords)
        ? data.allCRRecords
        : Array.isArray(data?.rows)
          ? data.rows
          : buildRowsFromChartOrTable(data)
    );

    setAllCRRecords(sourceRows);
    setSelectedStatus("");
    setStatusDistribution(buildSolmanStatusDistribution(sourceRows));
    setVisibleRecordCount(INITIAL_CR_BATCH_SIZE);
  }, [data, isSolmanStatusResponse]);

  const statusFilteredRecords = useMemo(() => {
    if (!selectedStatus) return allCRRecords;

    return allCRRecords.filter(
      (row) => normalizeSolmanStatus(getSolmanStatusLabel(row)) === selectedStatus
    );
  }, [allCRRecords, selectedStatus]);

  const hasAppliedSearch = useMemo(
    () => Boolean(
      normalizeSearchText(appliedSearch.crNumber || appliedSearch.poNumber) ||
        normalizeSearchText(appliedSearch.shortDescription) ||
        normalizeDateValue(appliedSearch.createdOn)
    ),
    [appliedSearch]
  );

  const searchFilteredRecords = useMemo(() => {
    if (!hasAppliedSearch) return statusFilteredRecords;

    return statusFilteredRecords.filter((row) => matchesSolmanSearch(row, appliedSearch));
  }, [appliedSearch, hasAppliedSearch, statusFilteredRecords]);

  useEffect(() => {
    if (!isSolmanStatusResponse) return;
    setVisibleRecordCount(INITIAL_CR_BATCH_SIZE);
  }, [appliedSearch, isSolmanStatusResponse, selectedStatus]);

  const selectedStatusEntry = useMemo(() => {
    if (!selectedStatus || !Array.isArray(statusDistribution?.data)) return null;
    return (
      statusDistribution.data.find(
        (entry) => normalizeSolmanStatus(entry?.normalizedStatus || entry?.status) === selectedStatus
      ) || null
    );
  }, [selectedStatus, statusDistribution]);

  const activeStatusIndex = useMemo(() => {
    if (!selectedStatus || !Array.isArray(statusDistribution?.data)) return -1;
    return statusDistribution.data.findIndex(
      (entry) => normalizeSolmanStatus(entry?.normalizedStatus || entry?.status) === selectedStatus
    );
  }, [selectedStatus, statusDistribution]);

  const selectedStatusLabel = selectedStatus
    ? selectedStatusEntry?.status || selectedStatus
    : "All Change Requests";
  const visibleRows = useMemo(
    () => searchFilteredRecords.slice(0, visibleRecordCount),
    [searchFilteredRecords, visibleRecordCount]
  );
  const hasMoreRecords = searchFilteredRecords.length > visibleRows.length;
  const visibleCRRecords = useMemo(() => {
    if (!isSolmanStatusResponse) return [];
    return visibleRows;
  }, [isSolmanStatusResponse, visibleRows]);

  const selectedRecordCount = visibleCRRecords.length;
  const emptyTableMessage = !allCRRecords.length
    ? "No Change Requests found."
    : visibleCRRecords.length === 0 && (selectedStatus || hasAppliedSearch)
      ? "No Change Requests found for the selected filters."
      : "";
  const summaryFilterRange = extractFilterRange(data, chartSource);
  const summaryText =
    safeSummary && summaryFilterRange && !safeSummary.toLowerCase().includes("date range")
      ? `${safeSummary}\nDate Range: ${summaryFilterRange}`
      : safeSummary;

  const handleStatusSliceClick = useCallback((entry) => {
    const nextStatus = normalizeSolmanStatus(entry?.normalizedStatus || entry?.status || "");
    if (!nextStatus) return;

    setSelectedStatus((current) => (current === nextStatus ? "" : nextStatus));
  }, []);

  const handleChartContainerClick = useCallback((event) => {
    const x = Number(event?.clientX);
    const y = Number(event?.clientY);

    if (!Number.isFinite(x) || !Number.isFinite(y)) return;

    const element = document.elementFromPoint(x, y);
    const sector = element?.closest?.("path.recharts-sector");
    const status = String(
      sector?.getAttribute("name") ||
        sector?.getAttribute("aria-label") ||
        sector?.getAttribute("data-name") ||
        ""
    ).trim();

    if (!status) return;

    handleStatusSliceClick({ status });
  }, [handleStatusSliceClick]);

  useEffect(() => {
    if (!isSolmanStatusResponse) return undefined;

    const container = chartContainerRef.current;
    if (!container) return undefined;

    const paths = Array.from(container.querySelectorAll("path.recharts-sector"));

    const handleNativeSectorClick = (event) => {
      const target = event?.currentTarget;
      const status = String(target?.getAttribute("name") || "").trim();
      if (!status) return;
      handleStatusSliceClick({ status });
    };

    paths.forEach((path) => {
      path.addEventListener("click", handleNativeSectorClick);
      path.style.pointerEvents = "auto";
      path.style.cursor = "pointer";
    });

    return () => {
      paths.forEach((path) => {
        path.removeEventListener("click", handleNativeSectorClick);
      });
    };
  }, [data, handleStatusSliceClick, isSolmanStatusResponse]);

  const handleClearStatusFilter = useCallback(() => {
    setSelectedStatus("");
  }, []);

  const handleToggleSearchPanel = useCallback(() => {
    setIsSearchOpen((current) => !current);
  }, []);

  const handleApplySearch = useCallback(() => {
    setAppliedSearch({
      crNumber: String(searchDraft.crNumber || searchDraft.poNumber || "").trim(),
      shortDescription: String(searchDraft.shortDescription || "").trim(),
      createdOn: String(searchDraft.createdOn || "").trim(),
    });
    setIsSearchOpen(true);
  }, [searchDraft]);

  const handleClearSearch = useCallback(() => {
    const empty = { crNumber: "", shortDescription: "", createdOn: "" };
    setSearchDraft(empty);
    setAppliedSearch(empty);
    setIsSearchOpen(false);
  }, []);

  const handleLoadMoreRecords = useCallback(() => {
    setVisibleRecordCount((current) => current + LOAD_MORE_CR_BATCH_SIZE);
  }, []);

  if (isUser) {
    return (
      <div className="flex items-start justify-end w-full">
        <div className="max-w-[85%] sm:max-w-[78%] break-words whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-blue-50 px-4 py-3 text-sm leading-relaxed text-blue-800 shadow-sm border border-blue-100">
          {text}
        </div>
      </div>
    );
  }

  if (isSolmanStatusResponse) {
    const chartModel = statusDistribution || buildSolmanStatusDistribution(allCRRecords);
    const chartData = Array.isArray(chartModel?.data) ? chartModel.data : [];
    const tableColumns = ["Serial No", "CR Number", "Status", "Created On", "Short Description"];
    const tableRows = buildSolmanStatusTableRows(visibleCRRecords);

    return (
      <div className="flex items-start justify-start gap-3 w-full">
        <Avatar role={role} showAvatar={showAvatar} />

        <div className="max-w-[95%] sm:max-w-full min-w-0 overflow-hidden space-y-2">
          {summaryText && (
            <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-900">
              {summaryText}
            </div>
          )}

          {!summaryText && summaryFilterRange && (
            <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-900">
              {`Date Range: ${summaryFilterRange}`}
            </div>
          )}

          <div className="overflow-hidden rounded-2xl rounded-tl-sm border border-cyan-200 bg-white shadow-sm">
            <div className="border-b border-cyan-100 bg-gradient-to-r from-cyan-50 to-white px-4 py-3">
              <div className="text-sm font-semibold text-slate-900">
                CR Status Distribution
              </div>
              <div className="mt-1 text-xs text-slate-600">
                {chartModel?.totalCRs ? `${chartModel.totalCRs} change request(s)` : "No Data Available"}
              </div>
            </div>

            <div
              ref={chartContainerRef}
              className="h-[20rem] sm:h-72 w-full px-2 pb-2 pt-4"
              onClickCapture={handleChartContainerClick}
            >
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData}
                      dataKey="count"
                      nameKey="status"
                      innerRadius={isSmallScreen ? 44 : 58}
                      outerRadius={isSmallScreen ? 72 : 92}
                      paddingAngle={3}
                      activeIndex={activeStatusIndex >= 0 ? activeStatusIndex : undefined}
                      onClick={(_, index) => handleStatusSliceClick(chartData[index])}
                    >
                      {chartData.map((entry, idx) => {
                        const isSelected =
                          selectedStatus &&
                          normalizeSolmanStatus(entry?.normalizedStatus || entry?.status) === selectedStatus;

                        return (
                          <Cell
                            key={`cell-${entry.status}-${idx}`}
                            fill={entry.color || "#64748b"}
                            opacity={selectedStatus && !isSelected ? 0.32 : 1}
                            stroke={isSelected ? "#0f172a" : "#ffffff"}
                            strokeWidth={isSelected ? 3 : 1}
                            style={{ cursor: "pointer" }}
                            onClick={() => handleStatusSliceClick(entry)}
                          />
                        );
                      })}
                    </Pie>
                    <Tooltip
                      formatter={(value, name, props) => {
                        const pct = props?.payload?.percentage;
                        return [`${value} (${pct}%)`, props?.payload?.status || name];
                      }}
                    />
                    <Legend
                      verticalAlign="bottom"
                      iconSize={10}
                      wrapperStyle={{ fontSize: "12px", lineHeight: "1.2" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 text-sm text-slate-500">
                  No Data Available
                </div>
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl rounded-tl-sm border border-green-200 bg-green-50 shadow-sm">
            <div className="flex flex-col gap-3 border-b border-green-100 bg-gradient-to-r from-green-100 to-green-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-green-700">
                  Showing
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-900">
                  {selectedStatusLabel}
                </div>
                <div className="mt-1 text-xs text-slate-600">
                  {selectedRecordCount} Record{selectedRecordCount === 1 ? "" : "s"}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleToggleSearchPanel}
                  className="inline-flex items-center justify-center rounded-xl border border-green-300 bg-white p-2 text-green-800 transition hover:bg-green-50"
                  title={isSearchOpen ? "Hide search" : "Show search"}
                  aria-label={isSearchOpen ? "Hide search" : "Show search"}
                >
                  <FiSearch className="text-sm" />
                </button>

                {selectedStatus ? (
                  <button
                    type="button"
                    onClick={handleClearStatusFilter}
                    className="inline-flex items-center justify-center rounded-xl border border-green-300 bg-white px-3 py-2 text-xs font-semibold text-green-800 transition hover:bg-green-50"
                  >
                    Clear Filter
                  </button>
                ) : null}
              </div>
            </div>

            {isSearchOpen ? (
              <div className="border-b border-green-100 bg-white px-4 py-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
                    CR Number
                    <input
                      type="text"
                      value={searchDraft.crNumber || searchDraft.poNumber || ""}
                      onChange={(e) =>
                        setSearchDraft((current) => ({
                          ...current,
                          crNumber: e.target.value,
                          poNumber: e.target.value,
                        }))
                      }
                      placeholder="Enter CR number"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-normal text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-green-400 focus:bg-white focus:ring-2 focus:ring-green-400/20"
                    />
                  </label>

                  <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
                    Short Description
                    <input
                      type="text"
                      value={searchDraft.shortDescription}
                      onChange={(e) =>
                        setSearchDraft((current) => ({ ...current, shortDescription: e.target.value }))
                      }
                      placeholder="Enter description"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-normal text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-green-400 focus:bg-white focus:ring-2 focus:ring-green-400/20"
                    />
                  </label>

                  <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
                    Created On
                    <input
                      type="date"
                      value={searchDraft.createdOn}
                      onChange={(e) =>
                        setSearchDraft((current) => ({ ...current, createdOn: e.target.value }))
                      }
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-normal text-slate-900 outline-none transition focus:border-green-400 focus:bg-white focus:ring-2 focus:ring-green-400/20"
                    />
                  </label>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleApplySearch}
                    className="inline-flex items-center justify-center rounded-xl bg-green-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-800"
                  >
                    Search
                  </button>

                  <button
                    type="button"
                    onClick={handleClearSearch}
                    className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Clear
                  </button>
                </div>
              </div>
            ) : null}

            {emptyTableMessage ? (
              <div className="px-4 py-6 text-sm text-slate-700">
                {emptyTableMessage}
              </div>
            ) : (
              <>
                <ReplyTable
                  columns={tableColumns}
                  rows={tableRows}
                  forceGrid={true}
                />

                <div className="flex flex-col gap-2 border-t border-green-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-xs text-slate-600">
                    {hasMoreRecords
                      ? `${visibleCRRecords.length} of ${searchFilteredRecords.length} loaded`
                      : "No more records found."}
                  </div>

                  {hasMoreRecords ? (
                    <button
                      type="button"
                      onClick={handleLoadMoreRecords}
                      className="inline-flex items-center justify-center rounded-xl bg-green-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={!hasMoreRecords}
                    >
                      Show More
                    </button>
                  ) : null}
                </div>
              </>
            )}
          </div>

          {safeSuggestions.length > 0 && (
            <div className="mt-3 ml-2 sm:ml-4 flex flex-wrap gap-2">
              {safeSuggestions.map((suggestion, idx) => {
                const label = getSuggestionLabel(suggestion);
                if (!label) return null;

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => onSuggestionClick?.(suggestion)}
                    className="px-3 sm:px-4 py-1.5 text-xs bg-white text-black border border-dashed border-green-700 rounded-full transition hover:bg-green-50"
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  let table = buildStructuredTable(data);
  const genericChartView = chartView;

  if (!table) {
    try {
      table = replyToTable(formattedText);
    } catch (e) {
      console.error("Table parse error:", e);
    }
  }

  const hasTable = Boolean(table?.columns && table?.rows);

  const totalRows = Number(table?._meta?.totalRows || 0);
  const cappedTo = Number(table?._meta?.cappedTo || 0);

  const isCapped =
    totalRows > 0 &&
    cappedTo > 0 &&
    totalRows > cappedTo;

  const reconnectAction = action?.type === "reconnect_system" ? action : null;
  const isDisconnectedNotice = Boolean(reconnectAction);

  if (isDisconnectedNotice) {
    return (
      <div className="flex items-start justify-start gap-3 w-full">
        <Avatar role={role} showAvatar={showAvatar} />

        <div className="max-w-[95%] sm:max-w-full min-w-0 overflow-hidden space-y-2">
          <div className="rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-orange-50 shadow-sm">
            <div className="flex items-start gap-3 px-4 py-4 sm:px-5">
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                <FiAlertTriangle className="text-lg" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-700">
                  Connection required
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-900">
                  {String(text || "The selected SAP system is disconnected.").trim()}
                </div>
                <div className="mt-1 text-sm leading-relaxed text-slate-600">
                  Reconnect the target system to continue this request. Once the system is active,
                  you can retry the same prompt.
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onSuggestionClick?.({ action: reconnectAction, label: reconnectAction.label })}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
                  >
                    <FiArrowRight className="text-base" />
                    <span>{reconnectAction.label}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start justify-start gap-3 w-full">
      <Avatar role={role} showAvatar={showAvatar} />

      <div className="max-w-[95%] sm:max-w-full min-w-0 overflow-hidden space-y-2">
        {summaryText && (
          <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-900">
            {summaryText}
          </div>
        )}

        {!summaryText && summaryFilterRange && (
          <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-900">
            {`Date Range: ${summaryFilterRange}`}
          </div>
        )}

        <div
          className={
            hasTable
              ? "overflow-hidden rounded-2xl rounded-tl-sm bg-green-100 text-green-900 shadow-sm border border-green-200"
              : "overflow-hidden rounded-2xl rounded-tl-sm bg-green-100 px-4 py-3 text-sm text-green-900 shadow-sm border border-green-200"
          }
        >
          {hasTable ? (
            <>
              {isCapped && (
                <div className="px-4 pt-3 text-xs text-zinc-700">
                  Showing {cappedTo} of {totalRows} rows.
                  Refine your query (or use top 10).
                </div>
              )}

              <ReplyTable
                columns={table.columns}
                rows={table.rows}
                forceGrid={Boolean(table?.forceGrid || data?.viewType === "transport_list_table")}
              />
            </>
          ) : (
            <div className="whitespace-pre-wrap break-words leading-relaxed">
              {formattedText}
            </div>
          )}
        </div>

        {genericChartView?.normalized ? (
          <div className="mt-3 overflow-hidden rounded-2xl rounded-tl-sm border border-cyan-200 bg-white shadow-sm">
            <div className="border-b border-cyan-100 px-4 py-3">
              <div className="text-sm font-semibold text-slate-900">
                {genericChartView.normalized.title}
              </div>
              <div className="mt-1 text-xs text-slate-600">
                {genericChartView.normalized.totalCRs} change request(s)
              </div>
            </div>

            <div className="h-[20rem] sm:h-72 w-full px-2 pb-2 pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={genericChartView.normalized.data}
                    dataKey="count"
                    nameKey="status"
                    innerRadius={isSmallScreen ? 44 : 58}
                    outerRadius={isSmallScreen ? 72 : 92}
                    paddingAngle={3}
                  >
                    {genericChartView.normalized.data.map((entry, idx) => (
                      <Cell
                        key={`cell-${entry.status}-${idx}`}
                        fill={entry.color || "#64748b"}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, name, props) => {
                      const pct = props?.payload?.percentage;
                      return [`${value} (${pct}%)`, props?.payload?.status || name];
                    }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    iconSize={10}
                    wrapperStyle={{ fontSize: "12px", lineHeight: "1.2" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : chartView?.error ? (
          <div className="mt-3 rounded-2xl rounded-tl-sm border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm">
            Chart unavailable for this result.
          </div>
        ) : null}

        {safeSuggestions.length > 0 && (
          <div className="mt-3 ml-4 flex flex-wrap gap-2">
            {safeSuggestions.map((suggestion, idx) => {
              const label = getSuggestionLabel(suggestion);
              if (!label) return null;

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onSuggestionClick?.(suggestion)}
                  className="px-4 py-1.5 text-xs bg-white text-black border border-dashed border-green-700 rounded-full transition hover:bg-green-50"
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}