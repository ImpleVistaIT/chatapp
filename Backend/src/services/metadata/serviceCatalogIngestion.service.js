import axios from "axios";
import https from "node:https";
import { parseODataMetadataXml } from "./odataMetadataParser.service.js";
import { SapSystem } from "../../models/SapSystem.model.js";
import { SapServiceMap } from "../../models/SapServiceMap.model.js";
import { SapServiceCatalog } from "../../models/SapServiceCatalog.model.js";

function makeHttpsAgent() {
  const allowInsecure =
    String(process.env.SAP_ALLOW_INSECURE_TLS || "false").toLowerCase() === "true";

  return new https.Agent({
    rejectUnauthorized: !allowInsecure,
    keepAlive: true,
  });
}

function normalizeProtocol(v) {
  return String(v || "https").trim().toLowerCase();
}

function normalizeHost(v) {
  return String(v || "").trim();
}

function normalizePort(v) {
  return String(v || "").trim();
}

function buildMetadataUrl({ system, service }) {
  const protocol = normalizeProtocol(service?.protocol || system?.protocol || "https");
  const host = normalizeHost(service?.host || system?.host);
  const port = normalizePort(service?.port || system?.port);
  const serviceName = String(service?.serviceName || "").trim();

  if (!host) throw new Error("SAP host missing");
  if (!port) throw new Error("SAP port missing");
  if (!serviceName) throw new Error("SAP serviceName missing");

  return `${protocol}://${host}:${port}/sap/opu/odata/sap/${serviceName}/$metadata`;
}

async function fetchMetadataXml({ url, authOverride = null }) {
  const username = authOverride?.username || "";
  const password = authOverride?.password || "";

  if (!username || !password) {
    throw new Error("SAP credentials missing for metadata ingestion");
  }

  const res = await axios.get(url, {
    httpsAgent: makeHttpsAgent(),
    headers: {
      Accept: "application/xml, text/xml",
      Connection: "keep-alive",
    },
    auth: { username, password },
    timeout: 30000,
    validateStatus: () => true,
    responseType: "text",
    transformResponse: [(data) => data],
  });

  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Metadata fetch failed (${res.status}): ${String(res.data).slice(0, 500)}`);
  }

  return String(res.data || "");
}

async function upsertCatalogRecords(records = []) {
  let upserted = 0;

  for (const record of records) {
    await SapServiceCatalog.updateOne(
      {
        owner: record.owner,
        systemId: record.systemId,
        serviceName: record.serviceName,
        entitySet: record.entitySet,
      },
      {
        $set: {
          entityContainerName: record.entityContainerName,
          entityTypeName: record.entityTypeName,
          namespace: record.namespace,
          metadataUrl: record.metadataUrl,
          keys: record.keys,
          fields: record.fields,
          domainHints: record.domainHints,
          labelsText: record.labelsText,
          metadataHash: record.metadataHash,
          lastIngestedAt: record.lastIngestedAt,
          isActive: true,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          createdAt: new Date(),
        },
      },
      { upsert: true }
    );
    upserted += 1;
  }

  return upserted;
}

export async function ingestServiceMetadata({
  owner = "local",
  systemId,
  serviceType = null,
  authOverride,
}) {
  if (!systemId) throw new Error("systemId is required");

  const sid = String(systemId).trim().toUpperCase();

  const system = await SapSystem.findOne({
    owner,
    systemId: sid,
  }).lean();

  if (!system) {
    throw new Error(`SapSystem not found for owner=${owner} systemId=${sid}`);
  }

  const serviceQuery = { owner, systemId: sid };
  if (serviceType) serviceQuery.serviceType = serviceType;

  const services = await SapServiceMap.find(serviceQuery).lean();

  if (!services.length) {
    throw new Error(`No SapServiceMap records found for owner=${owner} systemId=${sid}`);
  }

  let totalServices = 0;
  let totalCatalogRecords = 0;
  const results = [];

  for (const service of services) {
    const metadataUrl = buildMetadataUrl({ system, service });
    const xml = await fetchMetadataXml({ url: metadataUrl, authOverride });

    const records = await parseODataMetadataXml({
      xml,
      owner,
      systemId: sid,
      metadataUrl,
    });

    const upserted = await upsertCatalogRecords(records);

    results.push({
      serviceType: service.serviceType,
      serviceName: service.serviceName,
      metadataUrl,
      entitySetsFound: records.map((r) => r.entitySet),
      upserted,
    });

    totalServices += 1;
    totalCatalogRecords += upserted;
  }

  return {
    ok: true,
    owner,
    systemId: sid,
    serviceType: serviceType || null,
    totalServices,
    totalCatalogRecords,
    results,
  };
}