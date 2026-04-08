import { parseStringPromise } from "xml2js";
import { ApiError } from "../../utils/errors.js";

/**
 * Parses OData Atom XML feed into an array of "properties" objects.
 * Each entry maps d:* fields into plain JS keys (e.g., PoNo, NetPrice, CurKey)
 */
export async function parseODataAtomXml(xml) {
  if (!xml) throw new ApiError(500, "Empty XML response from SAP.");

  const json = await parseStringPromise(xml, {
    explicitArray: false,
    ignoreAttrs: false,
    tagNameProcessors: [],
    attrNameProcessors: [],
    mergeAttrs: false,
  });

  const feed = json?.feed;
  if (!feed) throw new ApiError(500, "Invalid Atom feed: missing <feed>.");

  const entries = feed.entry ? (Array.isArray(feed.entry) ? feed.entry : [feed.entry]) : [];

  const rows = entries
    .map((e) => e?.content?.["m:properties"] || e?.content?.properties || null)
    .filter(Boolean)
    .map((p) => flattenDFields(p));

  return rows;
}

function flattenDFields(props) {
  const out = {};
  for (const [k, v] of Object.entries(props || {})) {
    // keys come like "d:PoNo"
    const key = k.includes(":") ? k.split(":")[1] : k;

    // handle nulls like: { "$": { "m:null": "true" } }
    if (v && typeof v === "object" && v.$ && (v.$["m:null"] === "true" || v.$["null"] === "true")) {
      out[key] = null;
      continue;
    }

    // normal string value
    if (typeof v === "object" && "_" in v) out[key] = v._;
    else out[key] = v;
  }
  return out;
}