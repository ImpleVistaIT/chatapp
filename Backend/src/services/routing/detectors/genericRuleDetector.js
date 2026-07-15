import {
	extractBusinessEntities,
	getQueryTokens,
	getSynonyms,
	isBusinessTokenValue,
	normalizeQueryText,
	normalizeQueryForMatching,
} from "../utils/normalizeInput.js";
import { fuzzyMatchToken, tokenSimilarity } from "../utils/scoreMatchers.js";

const TRANSPORT_CANONICAL_TOKENS = ["show", "transports", "cr"];
const TRANSPORT_KEYWORDS = [
	"transport",
	"transports",
	"transports",
	"shipment",
	"shipments",
	"order",
	"orders",
	"invoice",
	"invoices",
	"customer",
	"customers",
	"details",
	"detail",
];

const MATCH_THRESHOLD = Number(process.env.ROUTER_TRANSPORT_MATCH_THRESHOLD || 0.7);

function cleanString(value) {
	return String(value ?? "").trim();
}

function hasTransportCue(tokens = []) {
	const set = new Set((Array.isArray(tokens) ? tokens : []).map((token) => cleanString(token).toLowerCase()).filter(Boolean));
	return TRANSPORT_KEYWORDS.some((word) => set.has(word));
}

function normalizeTransportTokens(query) {
	const originalTokens = getQueryTokens(query);
	const lexicon = [
		...TRANSPORT_CANONICAL_TOKENS,
		...TRANSPORT_KEYWORDS,
		...Object.keys(getSynonyms()),
	];

	return originalTokens.map((token) => {
		if (isBusinessTokenValue(token)) return token;
		return fuzzyMatchToken(token, lexicon, 2);
	});
}

function getCanonicalTransportQuery(crNumber) {
	const cr = cleanString(crNumber);
	return cr ? `show transports cr ${cr}` : "show transports";
}

export function detectTransportQueryIntent(query) {
	const matching = normalizeQueryForMatching(query);
	const originalTokens = matching.tokens;
	const entities = extractBusinessEntities(query);
	const crNumber = cleanString(entities.cr_number);
	const lowerQuery = normalizeQueryText(query).toLowerCase();
	const isCreateTransportRequest = /\b(?:create|generate|raise|make|open|request)\b[\s\S]{0,40}\b(?:transport request|\btr\b)\b/i.test(lowerQuery) ||
		/\b(?:transport request|\btr\b)\b[\s\S]{0,40}\b(?:create|generate|raise|make|open|request)\b/i.test(lowerQuery);

	if (isCreateTransportRequest) {
		return {
			matched: false,
			intent: "UNKNOWN",
			routeIntent: "unknown",
			confidence: 0,
			canonicalQuery: normalizeQueryText(query),
			normalizedQuery: normalizeQueryText(query),
			entities,
			matchedBy: "none",
			shouldUseLlm: true,
		};
	}
	const normalizedTokens = normalizeTransportTokens(query);
	const hasTransport = hasTransportCue(normalizedTokens);

	if (!hasTransport && !crNumber) {
		return {
			matched: false,
			intent: "UNKNOWN",
			routeIntent: "unknown",
			confidence: 0,
			canonicalQuery: normalizeQueryText(query),
			normalizedQuery: normalizeQueryText(query),
			entities,
			matchedBy: "none",
			shouldUseLlm: true,
		};
	}

	const tokenScore = tokenSimilarity(normalizedTokens, TRANSPORT_CANONICAL_TOKENS);
	const hasCoreIntent = hasTransport && Boolean(crNumber);

	let matchedBy = "similarity";
	let confidence = 0.62;

	if (hasCoreIntent) {
		if (normalizedTokens.join(" ") === originalTokens.join(" ")) {
			matchedBy = "exact";
			confidence = 0.98;
		} else if (tokenScore >= 0.85) {
			matchedBy = "synonym";
			confidence = 0.97;
		} else {
			matchedBy = "fuzzy";
			confidence = 0.92;
		}
	} else if (hasTransport) {
		matchedBy = "partial";
		confidence = 0.55;
	}

	const canonicalQuery = getCanonicalTransportQuery(crNumber);

	return {
		matched: hasCoreIntent,
		intent: hasCoreIntent ? "SHOW_TRANSPORTS" : "UNKNOWN",
		routeIntent: hasCoreIntent ? "transport_list" : "unknown",
		confidence,
		canonicalQuery,
		normalizedQuery: canonicalQuery,
		entities: crNumber ? { cr_number: crNumber } : entities,
		matchedBy,
		tokenScore,
		shouldUseLlm: confidence < MATCH_THRESHOLD || !hasCoreIntent,
	};
}
