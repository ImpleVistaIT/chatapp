import { buildCrDetailsFilter } from "./crFilter.builder.js";

function resolveCrEntitySet() {
  return String(process.env.DEFAULT_SOLMAN_CR_ENTITYSET || "ZEX_OutputSet").trim() || "ZEX_OutputSet";
}

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

  return `${resolveCrEntitySet()}?${params.join("&")}`;
}