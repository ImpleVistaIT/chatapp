import { fetchFromSap } from "../../sap.service.js";

function cleanString(v) {
  return String(v || "").trim();
}

function escapeODataString(value) {
  return cleanString(value).replace(/'/g, "''");
}

function asArray(raw) {
  if (Array.isArray(raw?.d?.results)) return raw.d.results;
  if (raw?.d) return [raw.d];
  return [];
}

function unique(values = []) {
  return [...new Set(values.map((x) => cleanString(x)).filter(Boolean))];
}

function normalizeTransportsFromCr(raw) {
  const rows = asArray(raw);

  const transports = unique(
    rows.flatMap((item) => [
      item?.Trkorr,
    ])
  );

  const changeRequestId =
    cleanString(rows[0]?.ZchangeRequest) ||
    cleanString(rows[0]?.ChangeRequestId);

  const normalizedRows = rows.map((item) => ({
    ChangeRequestId: cleanString(item?.ChangeRequestId) || cleanString(item?.ZchangeRequest),
    Trkorr: cleanString(item?.Trkorr),
    Trfunction: cleanString(item?.Trfunction),
    TrfuncDescription: cleanString(item?.TrfuncDescription),
    ZchangeRequest: cleanString(item?.ZchangeRequest),
    DevCreatedDate: item?.DevCreatedDate || "",
    DevCreatedTime: cleanString(item?.DevCreatedTime),
    DevReleasedDate: item?.DevReleasedDate || "",
    DevReleasedTime: cleanString(item?.DevReleasedTime),
    Desc: cleanString(item?.Desc),
    Owner: cleanString(item?.Owner),
    TaskExdate: item?.TaskExdate || "",
    TaskExtime: cleanString(item?.TaskExtime),
    Hgq: cleanString(item?.Hgq),
    DateQua: cleanString(item?.DateQua),
    Hgd: cleanString(item?.Hgd),
    Hep: cleanString(item?.Hep),
    DatePrd: cleanString(item?.DatePrd),
    Hdv: cleanString(item?.Hdv),
    Hqa: cleanString(item?.Hqa),
    Hdp: cleanString(item?.Hdp),
    Tasks: cleanString(item?.Tasks),
    TaskOwner: cleanString(item?.TaskOwner),
    TaskFunc: cleanString(item?.TaskFunc),
    TaskFuncDescription: cleanString(item?.TaskFuncDescription),
    Message: cleanString(item?.Message),
  }));

  return {
    changeRequestId,
    transports,
    rows: normalizedRows,
  };
}

function normalizeDependencyRows(raw) {
  const rootRows = asArray(raw);

  const dependencyMessage =
    cleanString(rootRows[0]?.EV_MESSAGE) ||
    cleanString(rootRows[0]?.EvMessage) ||
    "";

  const detailRows = rootRows.flatMap((row) => {
    const nav = row?.message_nav;
    if (Array.isArray(nav?.results)) return nav.results;
    if (Array.isArray(nav)) return nav;
    return [];
  });

  const dependencies = detailRows
    .map((item) => ({
      transportEntered: cleanString(item?.TRANSPORT_ENTERED),
      dependentTransport: cleanString(item?.TRKORR),
      description: cleanString(item?.DESCRIPTION),
      status: cleanString(item?.TRSTATUS),
      owner: cleanString(item?.OWNER),
      exportDate: cleanString(item?.EXPORT_DATE),
      exportTime: cleanString(item?.EXPORT_TIME),
      importDate: cleanString(item?.IMPORT_DATE),
      importTime: cleanString(item?.IMPORT_TIME),
    }))
    .filter((item) => item.transportEntered)
    .filter((item) => item.dependentTransport)
    .filter((item) => item.dependentTransport.toLowerCase() !== "request");

  return {
    dependencyMessage,
    dependencies,
    rawRows: rootRows,
    detailRows,
  };
}

function isSapServiceNotFoundError(error, serviceName) {
  const msg = cleanString(error?.message).toLowerCase();
  const targetService = cleanString(serviceName).toLowerCase();

  return (
    msg.includes("no service found") &&
    (!targetService || msg.includes(targetService))
  );
}

function mapSapServiceError(error, { serviceName }) {
  if (isSapServiceNotFoundError(error, serviceName)) {
    const e = new Error("This system isn’t added yet. Please add it to continue.");
    e.status = 400;
    e.code = "SAP_SERVICE_NOT_AVAILABLE";
    e.userMessage = e.message;
    e.action = {
      type: "add_system",
      label: "Add System",
    };
    e.missingFields = ["systemId"];
    throw e;
  }

  throw error;
}

export async function getTransportNumbersFromCr({
  system,
  sapAuth,
  changeRequestId,
}) {
  const cleanCr = cleanString(changeRequestId);

  if (!cleanCr) {
    const err = new Error("changeRequestId is required.");
    err.status = 400;
    err.code = "VALIDATION_FAILED";
    throw err;
  }

  const relativePath = `CR_DetailsSet?$filter=${encodeURIComponent(
    `ChangeRequestId eq '${escapeODataString(cleanCr)}'`
  )}`;

  let raw;
  try {
    raw = await fetchFromSap(
      {
        system,
        service: { serviceName: "ZNEW_TRS_FROM_CR_SRV" },
        relativePath,
      },
      sapAuth
    );
  } catch (error) {
    mapSapServiceError(error, {
      serviceName: "ZNEW_TRS_FROM_CR_SRV",
    });
  }

  const normalized = normalizeTransportsFromCr(raw);

  return {
    ok: true,
    message:
      normalized.transports.length > 0
        ? `Found ${normalized.transports.length} transport(s) for CR ${cleanCr}.`
        : `No transports found for CR ${cleanCr}.`,
    result: {
      changeRequestId: normalized.changeRequestId || cleanCr,
      transports: normalized.transports,
      rows: normalized.rows,
      raw,
    },
  };
}

export async function getTransportDependencyDetails({
  system,
  sapAuth,
  transports = [],
}) {
  const cleanTransports = unique(transports);

  if (cleanTransports.length === 0) {
    const err = new Error("At least one transport is required.");
    err.status = 400;
    err.code = "VALIDATION_FAILED";
    throw err;
  }

  const filter = cleanTransports
    .map((tr) => `TRANSPORT eq '${escapeODataString(tr)}'`)
    .join(" or ");

  const relativePath = `zmessageSet?$filter=${encodeURIComponent(
    filter
  )}&$expand=message_nav`;

  const dependencySystem = {
    ...system,
    protocol: cleanString(system?.protocol) || "https",
    port: Number(system?.port) || 50101,
  };

  let raw;
  try {
    raw = await fetchFromSap(
      {
        system: dependencySystem,
        service: { serviceName: "ZTR_DEP_CHECK_SRV" },
        relativePath,
      },
      sapAuth
    );
  } catch (error) {
    mapSapServiceError(error, {
      serviceName: "ZTR_DEP_CHECK_SRV",
    });
  }

  const normalized = normalizeDependencyRows(raw);

  return {
    ok: true,
    message: normalized.dependencyMessage || "Dependency check completed.",
    result: {
      transports: cleanTransports,
      dependencyMessage: normalized.dependencyMessage,
      dependencies: normalized.dependencies,
      raw,
    },
  };
}

export async function getDependentTransportsFromCr({
  system,
  sapAuth,
  changeRequestId,
}) {
  const trResult = await getTransportNumbersFromCr({
    system,
    sapAuth,
    changeRequestId,
  });

  const sourceTransports = trResult?.result?.transports || [];

  if (sourceTransports.length === 0) {
    return {
      ok: true,
      message: `No transports were found for CR ${changeRequestId}.`,
      result: {
        changeRequestId: cleanString(changeRequestId),
        sourceTransports: [],
        dependencyMessage: "",
        dependencies: [],
        raw: {
          transportLookup: trResult?.result?.raw || null,
          dependencyLookup: null,
        },
      },
    };
  }

  const depResult = await getTransportDependencyDetails({
    system: {
      ...system,
      protocol: "https",
      port: 50101,
    },
    sapAuth,
    transports: sourceTransports,
  });

  return {
    ok: true,
    message: depResult?.message || "Dependency check completed.",
    result: {
      changeRequestId:
        cleanString(trResult?.result?.changeRequestId) || cleanString(changeRequestId),
      sourceTransports,
      dependencyMessage: depResult?.result?.dependencyMessage || "",
      dependencies: depResult?.result?.dependencies || [],
      raw: {
        transportLookup: trResult?.result?.raw || null,
        dependencyLookup: depResult?.result?.raw || null,
      },
    },
  };
}