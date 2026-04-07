export function getEntityEndpoint(entity) {
  const e = String(entity || "").toUpperCase();

  if (e === "PO") return process.env.PO_ENTITYSET;

  // TODO: when SAP provides these links
  if (e === "PR") return process.env.PR_ENTITYSET;
  if (e === "VENDOR") return process.env.VENDOR_ENTITYSET;

  return null;
}