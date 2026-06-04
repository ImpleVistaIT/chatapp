import { ROUTING_CONFIG } from "../../config/routing.config.js";

export const DEFAULT_LOW_CONFIDENCE_FALLBACK =
  "I didn't understand your request. Could you please rephrase it?";

function hasSapDomainSignal(query) {
  const q = String(query || "").trim();
  if (!q) return false;

  return [
    /\bcr\s*[-_]?\d{3,20}\b/i,
    /\bsm\d{2}\b/i,
    /\brfc\b/i,
    /\babap\b/i,
    /\bhana\b/i,
    /\bz[a-z0-9_]+\b/i,
    /\btransport\s*(?:id|request)?\s*[:#-]?\s*[a-z0-9]+\b/i,
    /\bticket\s*[:#-]?\s*[a-z0-9-]+\b/i,
  ].some((re) => re.test(q));
}

function toFiniteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function getLowConfidenceThreshold() {
  const configured = toFiniteNumber(ROUTING_CONFIG?.confidence?.low, 0.35);
  if (configured < 0) return 0;
  if (configured > 1) return 1;
  return configured;
}

export function isUnknownOrAmbiguousClassification(classified = {}) {
  const system = String(classified?.system || "").trim().toLowerCase();
  const module = String(classified?.module || "").trim().toLowerCase();
  const intent = String(classified?.intent || "").trim().toLowerCase();

  return (
    system === "unknown" ||
    system === "ambiguous" ||
    module === "unknown" ||
    intent === "unknown" ||
    intent === "other"
  );
}

export function shouldReturnLowConfidenceFallback(classified = {}, query = "") {
  const confidence = toFiniteNumber(classified?.confidence, 0);
  const threshold = getLowConfidenceThreshold();

  if (hasSapDomainSignal(query)) {
    return false;
  }

  return confidence < threshold && isUnknownOrAmbiguousClassification(classified);
}

export function buildLowConfidenceFallbackPayload(classified = {}, message) {
  return {
    ok: true,
    status: "unknown_intent",
    message: String(message || DEFAULT_LOW_CONFIDENCE_FALLBACK),
    routing: classified,
    confidence: toFiniteNumber(classified?.confidence, 0),
    threshold: getLowConfidenceThreshold(),
  };
}
