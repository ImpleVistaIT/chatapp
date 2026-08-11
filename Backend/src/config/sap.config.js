function cleanString(value) {
	return String(value || "").trim();
}

export function normalizeSystemId(systemId) {
	return cleanString(systemId).toUpperCase();
}

function normalizeTargetConfig(systemId, target) {
	return {
		systemId,
		baseUrl: cleanString(target?.baseUrl).replace(/\/+$/, ""),
		serviceName: cleanString(target?.serviceName),
		entitySet: cleanString(target?.entitySet),
	};
}

export function resolveSapLoginTargetConfig(
	systemId,
	{ loginTargets = null, requireMappedSystem = true, fallbackTarget = null } = {}
) {
	const normalizedSystemId = normalizeSystemId(systemId);

	if (!normalizedSystemId) {
		const err = new Error("systemId is required");
		err.status = 400;
		err.code = "MISSING_SYSTEM_ID";
		throw err;
	}

	const targetSource = loginTargets?.[normalizedSystemId] || fallbackTarget || null;
	const target = normalizeTargetConfig(normalizedSystemId, targetSource);

	if (!target.baseUrl || !target.serviceName || !target.entitySet) {
		if (!loginTargets?.[normalizedSystemId]) {
			if (requireMappedSystem) {
				const err = new Error(`Unsupported systemId for SAP login: ${normalizedSystemId}`);
				err.status = 400;
				err.code = "UNSUPPORTED_SYSTEM_ID";
				throw err;
			}

			return null;
		}

		const err = new Error(
			`SAP login configuration is incomplete for systemId ${normalizedSystemId}. baseUrl, serviceName, and entitySet are required.`
		);
		err.status = 500;
		err.code = "SAP_LOGIN_CONFIG_INCOMPLETE";
		throw err;
	}

	return target;
}

export function buildSapLoginRequest({
	systemId,
	sapUser,
	sapPassword,
	loginTargets = null,
	requireMappedSystem = true,
	fallbackTarget = null,
} = {}) {
	const target = resolveSapLoginTargetConfig(systemId, { loginTargets, requireMappedSystem, fallbackTarget });

	if (!target) {
		return null;
	}

	const user = cleanString(sapUser);
	const password = cleanString(sapPassword);

	const filter = `$filter=UserName eq '${String(user).replace(/'/g, "''")}' and Password eq '${String(password).replace(/'/g, "''")}'`;
	const relativePath = `${target.entitySet}?${encodeURI(filter)}&$format=json`;
	const requestUrl = `${target.baseUrl}/sap/opu/odata/sap/${target.serviceName}/${relativePath}`;

	return {
		...target,
		filter,
		relativePath,
		requestUrl,
	};
}
