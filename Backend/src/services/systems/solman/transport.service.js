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

function collectNavRows(item) {
  const navCandidates = [
    item?.message_nav,
    item?.transport_nav,
    item?.transportNav,
    item?.Trkorr_nav,
    item?.TRKORR_nav,
  ];

  const rows = [];

  for (const nav of navCandidates) {
    if (Array.isArray(nav?.results)) {
      rows.push(...nav.results);
    } else if (Array.isArray(nav)) {
      rows.push(...nav);
    }
  }

  return rows;
}

function unique(values = []) {
  return [...new Set(values.map((x) => cleanString(x)).filter(Boolean))];
}

function pickString(item, keys = []) {
  for (const key of Array.isArray(keys) ? keys : []) {
    const value = cleanString(item?.[key]);
    if (value) return value;
  }
  return "";
}

function rowMatchesCr(item, changeRequestId) {
  const cleanCr = cleanString(changeRequestId);
  if (!cleanCr) return false;

  const candidates = [
    item?.ChangeRequestId,
    item?.CHANGE_REQUEST_ID,
    item?.ZchangeRequest,
    item?.ZCHANGE_REQUEST,
    item?.OBJECT_ID,
    item?.OBJ_ID,
  ]
    .map((value) => cleanString(value))
    .filter(Boolean);

  return candidates.some((value) => value === cleanCr || value.includes(cleanCr) || cleanCr.includes(value));
}

function normalizeTransportsFromCr(raw, { changeRequestId = "" } = {}) {
  const rootRows = asArray(raw);
  const rows = [
    ...rootRows,
    ...rootRows.flatMap((item) => collectNavRows(item)),
  ];

  const crRows = cleanString(changeRequestId)
    ? rows.filter((item) => rowMatchesCr(item, changeRequestId))
    : rows;
  const effectiveRows = crRows.length > 0 ? crRows : rows;

  const transports = unique(
    effectiveRows.flatMap((item) => [
      pickString(item, ["Trkorr", "TRKORR", "Transport", "TRANSPORT", "TransportNo", "TRANSPORT_NO"]),
    ])
  );

  const normalizedChangeRequestId =
    pickString(effectiveRows[0], [
      "ZchangeRequest",
      "ZCHANGE_REQUEST",
      "ChangeRequestId",
      "CHANGE_REQUEST_ID",
      "ChangeRequest",
      "CHANGE_REQUEST",
      "OBJECT_ID",
      "OBJ_ID",
    ]);

  const normalizedRows = effectiveRows.map((item) => ({
    ChangeRequestId: pickString(item, ["ChangeRequestId", "CHANGE_REQUEST_ID", "ZchangeRequest", "ZCHANGE_REQUEST", "ChangeRequest", "CHANGE_REQUEST"]),
    Trkorr: pickString(item, ["Trkorr", "TRKORR", "Transport", "TRANSPORT", "TransportNo", "TRANSPORT_NO"]),
    Trfunction: pickString(item, ["Trfunction", "TRFUNCTION", "TransportType", "TRANSPORT_TYPE", "TRFUNCTION_CODE"]),
    TrfuncDescription: pickString(item, ["TrfuncDescription", "TRFUNC_DESCRIPTION", "TrfunctionText", "TRFUNCTION_TEXT", "TransportTypeText", "TRANSPORT_TYPE_TEXT"]),
    ZchangeRequest: pickString(item, ["ZchangeRequest", "ZCHANGE_REQUEST", "ChangeRequestId", "CHANGE_REQUEST_ID", "ChangeRequest", "CHANGE_REQUEST"]),
    DevCreatedDate: pickString(item, ["DevCreatedDate", "DEV_CREATED_DATE", "CreatedDate", "CREATED_DATE", "CRTD_DATE"]),
    DevCreatedTime: pickString(item, ["DevCreatedTime", "DEV_CREATED_TIME", "CreatedTime", "CREATED_TIME", "CRTD_TIME"]),
    DevReleasedDate: pickString(item, ["DevReleasedDate", "DEV_RELEASED_DATE", "ReleasedDate", "RELEASED_DATE", "REL_DATE"]),
    DevReleasedTime: pickString(item, ["DevReleasedTime", "DEV_RELEASED_TIME", "ReleasedTime", "RELEASED_TIME", "REL_TIME"]),
    Desc: pickString(item, ["Desc", "DESC", "Description", "DESCRIPTION", "ShortText", "SHORT_TEXT"]),
    Owner: pickString(item, ["Owner", "OWNER", "CreatedBy", "CREATED_BY", "User", "USERNAME", "AS4USER"]),
    TaskExdate: pickString(item, ["TaskExdate", "TASK_EXDATE", "TaskExitDate", "TASK_EXIT_DATE", "TaskReleasedDate", "TASK_RELEASED_DATE"]),
    TaskExtime: pickString(item, ["TaskExtime", "TASK_EXTIME", "TaskExitTime", "TASK_EXIT_TIME", "TaskReleasedTime", "TASK_RELEASED_TIME"]),
    Hgq: pickString(item, ["Hgq", "HGQ"]),
    DateQua: pickString(item, ["DateQua", "DATE_QUA"]),
    Hgd: pickString(item, ["Hgd", "HGD"]),
    Hep: pickString(item, ["Hep", "HEP"]),
    DatePrd: pickString(item, ["DatePrd", "DATE_PRD"]),
    Hdv: pickString(item, ["Hdv", "HDV"]),
    Hqa: pickString(item, ["Hqa", "HQA"]),
    Hdp: pickString(item, ["Hdp", "HDP"]),
    Tasks: pickString(item, ["Tasks", "TASKS", "Task", "TASK"]),
    TaskOwner: pickString(item, ["TaskOwner", "TASK_OWNER", "Owner", "OWNER", "AS4USER"]),
    TaskFunc: pickString(item, ["TaskFunc", "TASK_FUNC"]),
    TaskFuncDescription: pickString(item, ["TaskFuncDescription", "TASK_FUNC_DESCRIPTION", "TaskFuncText", "TASK_FUNC_TEXT"]),
    Message: pickString(item, ["Message", "MESSAGE", "EV_MESSAGE", "EvMessage"]),
  }));

  return {
    changeRequestId: normalizedChangeRequestId,
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

function mergeDependencyRows(results = []) {
  const dependencies = [];
  const sourceTransports = [];
  const dependencyMessages = [];
  const rawResponses = [];

  for (const entry of Array.isArray(results) ? results : []) {
    if (!entry || typeof entry !== "object") continue;

    if (Array.isArray(entry.sourceTransports)) {
      sourceTransports.push(...entry.sourceTransports);
    }

    if (Array.isArray(entry.dependencies)) {
      dependencies.push(...entry.dependencies);
    }

    if (cleanString(entry.dependencyMessage)) {
      dependencyMessages.push(cleanString(entry.dependencyMessage));
    }

    if (entry.raw != null) {
      rawResponses.push(entry.raw);
    }
  }

  const uniqueDependencies = [];
  const seen = new Set();

  for (const item of dependencies) {
    const key = [
      cleanString(item?.transportEntered),
      cleanString(item?.dependentTransport),
      cleanString(item?.description),
      cleanString(item?.owner),
      cleanString(item?.exportDate),
      cleanString(item?.exportTime),
      cleanString(item?.importDate),
      cleanString(item?.importTime),
    ].join("|");

    if (seen.has(key)) continue;
    seen.add(key);
    uniqueDependencies.push(item);
  }

  return {
    sourceTransports: unique(sourceTransports),
    dependencies: uniqueDependencies,
    dependencyMessage: dependencyMessages.filter(Boolean).join(" ").trim(),
    rawResponses,
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

async function resolveCrProcessType({ system, sapAuth, changeRequestId }) {
  const cleanCr = cleanString(changeRequestId);
  if (!cleanCr) return "";

  try {
    const relativePath = `/sap/opu/odata/sap/ZCR_DETAILS_SRV/ZEX_OutputSet?$filter=${encodeURIComponent(
      `OBJECT_ID eq '${escapeODataString(cleanCr)}'`
    )}`;

    const raw = await fetchFromSap(
      {
        system,
        service: { serviceName: "ZCR_DETAILS_SRV" },
        relativePath,
      },
      sapAuth
    );

    const rows = Array.isArray(raw?.d?.results) ? raw.d.results : [];
    return cleanString(rows[0]?.PROCESS_TYPE);
  } catch {
    return "";
  }
}

function buildCrTransportLookupVariants({ changeRequestId, processType }) {
  const cleanCr = cleanString(changeRequestId);
  const cleanProcessType = cleanString(processType);

  const variants = [];
  const push = (filter) => {
    if (filter) variants.push(filter);
  };

  push(`ChangeRequestId eq '${escapeODataString(cleanCr)}'`);

  if (cleanProcessType) {
    push(
      `ChangeRequestId eq '${escapeODataString(cleanCr)}' and PROCESS_TYPE eq '${escapeODataString(cleanProcessType)}'`
    );
  }

  push(`ZchangeRequest eq '${escapeODataString(cleanCr)}'`);
  if (cleanProcessType) {
    push(
      `ZchangeRequest eq '${escapeODataString(cleanCr)}' and PROCESS_TYPE eq '${escapeODataString(cleanProcessType)}'`
    );
  }

  return [...new Set(variants)];
}

function buildCrTransportAllRowsVariants() {
  return ["", "$top=500"];
}

function buildCrTransportLookupFallbackVariants({ changeRequestId, processType }) {
  const cleanCr = cleanString(changeRequestId);
  const cleanProcessType = cleanString(processType);

  if (!cleanCr) return [];

  const variants = [];
  const push = (filter) => {
    if (filter) variants.push(filter);
  };

  push(`substringof('${escapeODataString(cleanCr)}', ChangeRequestId)`);
  push(`substringof('${escapeODataString(cleanCr)}', ZchangeRequest)`);

  if (cleanProcessType) {
    push(
      `substringof('${escapeODataString(cleanCr)}', ChangeRequestId) and PROCESS_TYPE eq '${escapeODataString(cleanProcessType)}'`
    );
    push(
      `substringof('${escapeODataString(cleanCr)}', ZchangeRequest) and PROCESS_TYPE eq '${escapeODataString(cleanProcessType)}'`
    );
  }

  return [...new Set(variants)];
}

export async function getTransportNumbersFromCr({
  system,
  sapAuth,
  changeRequestId,
  processType = "",
}) {
  const cleanCr = cleanString(changeRequestId);
  const explicitProcessType = cleanString(processType);

  if (!cleanCr) {
    const err = new Error("changeRequestId is required.");
    err.status = 400;
    err.code = "VALIDATION_FAILED";
    throw err;
  }

  const resolvedProcessType = explicitProcessType || (await resolveCrProcessType({
    system,
    sapAuth,
    changeRequestId: cleanCr,
  }));

  const variants = buildCrTransportLookupVariants({
    changeRequestId: cleanCr,
    processType: resolvedProcessType,
  });

  let raw = null;
  let lastError = null;
  let normalized = null;

  for (const filter of variants) {
    const relativePath = `CR_DetailsSet?$filter=${encodeURIComponent(filter)}`;

    try {
      raw = await fetchFromSap(
        {
          system,
          service: { serviceName: "ZNEW_TRS_FROM_CR_SRV" },
          relativePath,
        },
        sapAuth
      );

      normalized = normalizeTransportsFromCr(raw, { changeRequestId: cleanCr });
      if (normalized.transports.length > 0 || normalized.rows.length > 0) break;
    } catch (error) {
      lastError = error;
      const msg = cleanString(error?.message).toLowerCase();
      if (
        error?.status === 501 ||
        msg.includes("no service found") ||
        msg.includes("not implemented in data provider class")
      ) {
        mapSapServiceError(error, {
          serviceName: "ZNEW_TRS_FROM_CR_SRV",
        });
      }
    }
  }

  if (!normalized || (normalized.transports.length === 0 && normalized.rows.length === 0)) {
    const fallbackVariants = buildCrTransportLookupFallbackVariants({
      changeRequestId: cleanCr,
      processType: resolvedProcessType,
    });

    for (const filter of fallbackVariants) {
      const relativePath = `CR_DetailsSet?$filter=${encodeURIComponent(filter)}`;

      try {
        raw = await fetchFromSap(
          {
            system,
            service: { serviceName: "ZNEW_TRS_FROM_CR_SRV" },
            relativePath,
          },
          sapAuth
        );

        normalized = normalizeTransportsFromCr(raw, { changeRequestId: cleanCr });
        if (normalized.transports.length > 0 || normalized.rows.length > 0) break;
      } catch (error) {
        lastError = error;
        const msg = cleanString(error?.message).toLowerCase();
        if (
          error?.status === 501 ||
          msg.includes("no service found") ||
          msg.includes("not implemented in data provider class")
        ) {
          mapSapServiceError(error, {
            serviceName: "ZNEW_TRS_FROM_CR_SRV",
          });
        }
      }
    }
  }

  if (!normalized || (normalized.transports.length === 0 && normalized.rows.length === 0)) {
    for (const suffix of buildCrTransportAllRowsVariants()) {
      try {
        const relativePath = suffix ? `CR_DetailsSet?${suffix}` : `CR_DetailsSet`;
        raw = await fetchFromSap(
          {
            system,
            service: { serviceName: "ZNEW_TRS_FROM_CR_SRV" },
            relativePath,
          },
          sapAuth
        );

        normalized = normalizeTransportsFromCr(raw, { changeRequestId: cleanCr });
        if (normalized.transports.length > 0 || normalized.rows.length > 0) break;
      } catch (error) {
        lastError = error;
      }
    }
  }

  if (!normalized || (normalized.transports.length === 0 && normalized.rows.length === 0)) {
    return {
      ok: true,
      message: `No transports found for CR ${cleanCr}.`,
      result: {
        changeRequestId: cleanCr,
        processType: resolvedProcessType || null,
        transports: [],
        rows: [],
        raw,
        emptyState: `No transports found for CR ${cleanCr}.`,
      },
    };
  }

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
      processType: resolvedProcessType || null,
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

  const dependencySystem = {
    ...system,
    protocol: cleanString(system?.protocol) || "https",
    port: Number(system?.port) || 50101,
  };

  const perTransportResults = [];
  const failures = [];

  for (const transport of cleanTransports) {
    const relativePath = `zmessageSet?$filter=${encodeURIComponent(
      `TRANSPORT eq '${escapeODataString(transport)}'`
    )}&$expand=message_nav`;

    try {
      const raw = await fetchFromSap(
        {
          system: dependencySystem,
          service: { serviceName: "ZTR_DEP_CHECK_SRV" },
          relativePath,
        },
        sapAuth
      );

      const normalized = normalizeDependencyRows(raw);
      perTransportResults.push({
        transport,
        ...normalized,
        raw,
      });
    } catch (error) {
      failures.push({
        transport,
        error: cleanString(error?.message) || "Unknown SAP error",
        status: error?.status || null,
      });

      const msg = cleanString(error?.message).toLowerCase();
      if (
        error?.status === 501 ||
        msg.includes("no service found") ||
        msg.includes("not implemented in data provider class")
      ) {
        mapSapServiceError(error, {
          serviceName: "ZTR_DEP_CHECK_SRV",
        });
      }
    }
  }

  if (perTransportResults.length === 0) {
    const err = new Error(
      failures.length > 0
        ? `SAP dependency check failed for all transports: ${failures.map((f) => `${f.transport} (${f.error})`).join(", ")}`
        : "Dependency check failed."
    );
    err.status = 500;
    err.code = "SAP_DEPENDENCY_CHECK_FAILED";
    err.details = { failures };
    throw err;
  }

  const merged = mergeDependencyRows(
    perTransportResults.map((entry) => ({
      sourceTransports: [entry.transport],
      dependencies: entry.dependencies,
      dependencyMessage: entry.dependencyMessage,
      raw: entry.raw,
    }))
  );

  const warningMessage =
    failures.length > 0
      ? `Dependency check completed with ${failures.length} transport failure(s).`
      : "";

  return {
    ok: true,
    message:
      [merged.dependencyMessage, warningMessage].filter(Boolean).join(" ").trim() ||
      "Dependency check completed.",
    result: {
      transports: merged.sourceTransports,
      dependencyMessage: merged.dependencyMessage,
      dependencies: merged.dependencies,
      raw: {
        responses: merged.rawResponses,
        failures,
      },
    },
  };
}

export async function getDependentTransportsFromCr({
  system,
  sapAuth,
  changeRequestId,
  processType = "",
}) {
  const trResult = await getTransportNumbersFromCr({
    system,
    sapAuth,
    changeRequestId,
    processType,
  });

  if (!trResult?.ok) {
    return {
      ok: true,
      message: `No transports were found for CR ${changeRequestId}.`,
      result: {
        changeRequestId: cleanString(changeRequestId),
        processType: cleanString(processType) || null,
        sourceTransports: [],
        dependencyMessage: "",
        dependencies: [],
        raw: {
          transportLookup: trResult?.result?.raw || null,
          dependencyLookup: null,
          transportLookupError: trResult?.result?.error || null,
        },
      },
    };
  }

  const sourceTransports = trResult?.result?.transports || [];

  if (sourceTransports.length === 0) {
    return {
      ok: true,
      message: `No transports were found for CR ${changeRequestId}.`,
      result: {
        changeRequestId: cleanString(changeRequestId),
        processType: trResult?.result?.processType || null,
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
      processType: trResult?.result?.processType || null,
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