import { formatSapYmd, resolveDateRangeFromText } from "./crFilter.utils.js";

function escOData(value) {
  return String(value).replace(/'/g, "''");
}

export function buildCrDetailsFilter({
  processType = "YMHF",
  triggerAll = "X",
  status,
  userText,
  now = new Date(),
}) {
  const parts = [
    `PROCESS_TYPE eq '${escOData(processType)}'`,
    `TRIGGER_ALL eq '${escOData(triggerAll)}'`,
  ];

  if (status) {
    parts.push(`STATUS eq '${escOData(status)}'`);
  }

  const resolved = resolveDateRangeFromText(userText, now);

  let top = null;
  if (resolved?.kind === "lastN") {
    top = resolved.count;
  } else if (resolved?.from && resolved?.to) {
    parts.push(`FROM_DATE eq '${formatSapYmd(resolved.from)}'`);
    parts.push(`TO_DATE eq '${formatSapYmd(resolved.to)}'`);
  }

  return {
    filter: parts.join(" and "),
    top,
    resolved,
  };
}