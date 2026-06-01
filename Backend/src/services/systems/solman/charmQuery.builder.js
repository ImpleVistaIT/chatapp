import { buildCrDetailsFilter } from "./crFilter.builder.js";

export function buildCrListRelativePath({ status, userText, processType = "YMHF" }) {
  const { filter, top } = buildCrDetailsFilter({
    processType,
    triggerAll: "X",
    status,
    userText,
  });

  const params = [`$filter=${encodeURIComponent(filter)}`];

  if (top && Number.isFinite(top)) {
    params.push(`$top=${top}`);
  }

  return `ZEX_OutputSet?${params.join("&")}`;
}