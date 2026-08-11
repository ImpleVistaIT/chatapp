function cleanString(value) {
	return String(value ?? "").trim();
}

export function levenshteinDistance(left, right) {
	const a = cleanString(left).toLowerCase();
	const b = cleanString(right).toLowerCase();

	if (!a) return b.length;
	if (!b) return a.length;

	const rows = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));

	for (let i = 0; i <= a.length; i += 1) rows[i][0] = i;
	for (let j = 0; j <= b.length; j += 1) rows[0][j] = j;

	for (let i = 1; i <= a.length; i += 1) {
		for (let j = 1; j <= b.length; j += 1) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			rows[i][j] = Math.min(
				rows[i - 1][j] + 1,
				rows[i][j - 1] + 1,
				rows[i - 1][j - 1] + cost
			);
		}
	}

	return rows[a.length][b.length];
}

export function tokenSimilarity(leftTokens = [], rightTokens = []) {
	const left = new Set((Array.isArray(leftTokens) ? leftTokens : []).map((x) => cleanString(x).toLowerCase()).filter(Boolean));
	const right = new Set((Array.isArray(rightTokens) ? rightTokens : []).map((x) => cleanString(x).toLowerCase()).filter(Boolean));

	if (left.size === 0 || right.size === 0) return 0;

	let intersection = 0;
	for (const token of left) {
		if (right.has(token)) intersection += 1;
	}

	const union = new Set([...left, ...right]).size;
	return union > 0 ? intersection / union : 0;
}

export function fuzzyMatchToken(token, candidates = [], maxDistance = 2) {
	const normalized = cleanString(token).toLowerCase();
	if (!normalized) return normalized;

	let best = normalized;
	let bestDistance = Number.POSITIVE_INFINITY;

	for (const candidate of Array.isArray(candidates) ? candidates : []) {
		const current = cleanString(candidate).toLowerCase();
		if (!current) continue;

		const distance = levenshteinDistance(normalized, current);
		if (distance < bestDistance) {
			bestDistance = distance;
			best = current;
		}
	}

	return bestDistance <= maxDistance ? best : normalized;
}
