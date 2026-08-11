const STOP_WORDS = new Set([
	"of",
	"for",
	"the",
	"a",
	"an",
	"please",
	"kindly",
	"you",
	"can",
	"could",
	"me",
	"us",
	"to",
	"by",
	"from",
	"on",
	"in",
	"at",
	"with",
	"and",
	"or",
]);

const SYNONYM_MAP = new Map([
	["display", "show"],
	["get", "show"],
	["fetch", "show"],
	["retrieve", "show"],
	["list", "show"],
]);

const DOMAIN_WORDS = new Set([
	"transport",
	"transports",
	"shipment",
	"shipments",
	"order",
	"orders",
	"invoice",
	"invoices",
	"customer",
	"customers",
	"cr",
	"change",
	"request",
	"details",
	"detail",
	"show",
	"status",
]);

function cleanString(value) {
	return String(value ?? "").trim();
}

function normalizeWhitespace(text) {
	return String(text || "")
		.replace(/[“”]/g, '"')
		.replace(/[’]/g, "'")
		.replace(/\s+/g, " ")
		.trim();
}

function tokenize(text) {
	return normalizeWhitespace(text)
		.toLowerCase()
		.match(/[a-z0-9]+(?:[._/-][a-z0-9]+)*/g) || [];
}

function normalizeToken(token) {
	const t = cleanString(token).toLowerCase();
	if (!t) return "";

	if (SYNONYM_MAP.has(t)) return SYNONYM_MAP.get(t);
	return t;
}

function isBusinessToken(token) {
	const t = cleanString(token).toLowerCase();
	if (!t) return false;
	if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return true;
	if (/^\d{8}$/.test(t)) return true;
	if (/^\d{6,20}$/.test(t)) return true;
	if (/^[a-z]{1,6}\d+[a-z0-9._/-]*$/i.test(t)) return true;
	if (/^\d+[a-z]{1,6}[a-z0-9._/-]*$/i.test(t)) return true;
	return false;
}

function stripStopWords(tokens) {
	return tokens.filter((token) => {
		const normalized = normalizeToken(token);
		if (!normalized) return false;
		if (isBusinessToken(normalized)) return true;
		if (DOMAIN_WORDS.has(normalized)) return true;
		return !STOP_WORDS.has(normalized);
	});
}

export function normalizeQueryText(query) {
	const tokens = stripStopWords(tokenize(query).map(normalizeToken));
	return tokens.join(" ").replace(/\s+/g, " ").trim();
}

export function extractBusinessEntities(query) {
	const text = normalizeWhitespace(query);

	const crMatch = text.match(/\b(?:cr|change request)\s*(?:number|no|id)?\s*[:#-]?\s*(\d{6,20})\b/i);
	const looseCrMatch = text.match(/\b(8\d{9,19})\b/);

	const transportMatch = text.match(/\b(?:transport|transports|tr|trkorr)\s*(?:id|no|number)?\s*[:#-]?\s*([A-Z0-9]{4,20})\b/i);
	const shipmentMatch = text.match(/\b(?:shipment|shipments)\s*(?:id|no|number)?\s*[:#-]?\s*([A-Z0-9]{4,20})\b/i);
	const orderMatch = text.match(/\b(?:order|orders)\s*(?:id|no|number)?\s*[:#-]?\s*([A-Z0-9]{4,20})\b/i);
	const invoiceMatch = text.match(/\b(?:invoice|invoices)\s*(?:id|no|number)?\s*[:#-]?\s*([A-Z0-9]{4,20})\b/i);
	const customerMatch = text.match(/\b(?:customer|customers)\s*(?:id|no|number)?\s*[:#-]?\s*([A-Z0-9]{4,20})\b/i);

	const dateMatch = text.match(/\b(\d{4}-\d{2}-\d{2}|\d{8})\b/);

	const entities = {
		cr_number: crMatch?.[1] || looseCrMatch?.[1] || null,
		transport_id: transportMatch?.[1] || null,
		shipment_id: shipmentMatch?.[1] || null,
		order_id: orderMatch?.[1] || null,
		invoice_id: invoiceMatch?.[1] || null,
		customer_id: customerMatch?.[1] || null,
		date: dateMatch?.[1] || null,
	};

	return Object.fromEntries(
		Object.entries(entities).filter(([, value]) => value != null && String(value).trim())
	);
}

export function buildCanonicalTransportQuery({ crNumber } = {}) {
	const cr = cleanString(crNumber);
	return cr ? `show transports cr ${cr}` : "show transports";
}

export function prepareNormalizedQuery(query) {
	return normalizeQueryText(query);
}

export function getQueryTokens(query) {
	return stripStopWords(tokenize(query).map(normalizeToken));
}

export function hasDomainWord(query, words = []) {
	const tokens = getQueryTokens(query);
	const wanted = new Set((Array.isArray(words) ? words : []).map((word) => normalizeToken(word)).filter(Boolean));
	return tokens.some((token) => wanted.has(token));
}

export function isBusinessTokenValue(value) {
	return isBusinessToken(value);
}

export function getCanonicalQueryForIntent(intent, entities = {}) {
	const normalizedIntent = String(intent || "").trim().toUpperCase();

	if (normalizedIntent === "SHOW_TRANSPORTS") {
		return buildCanonicalTransportQuery({ crNumber: entities?.cr_number || entities?.changeRequestId });
	}

	return normalizeQueryText(String(intent || ""));
}

export function normalizeQueryForMatching(query) {
	return {
		normalizedQuery: normalizeQueryText(query),
		tokens: getQueryTokens(query),
		entities: extractBusinessEntities(query),
	};
}

export function getStopWords() {
	return Array.from(STOP_WORDS);
}

export function getSynonyms() {
	return Object.fromEntries(SYNONYM_MAP.entries());
}
