function cleanString(value) {
	return String(value || "").trim();
}

export function normalizeSystemId(systemId) {
	return cleanString(systemId).toUpperCase();
}

export const SAP_LOGIN_TARGETS = Object.freeze({
	HSD: Object.freeze({
		baseUrl: "https://vedr.go.akamai-access.com",
		serviceName: "ZNEW_USER_LOGIN_SRV",
		entitySet: "user_loginSet",
	}),
	S4D: Object.freeze({
		baseUrl: "https://vhcals4dci.dummy.nodomain:44300",
		serviceName: "ZSAP_USER_LOGIN_SRV",
		entitySet: "user_dataSet",
	}),
});

function normalizeTargetConfig(systemId, target) {
	return {
		systemId,
		baseUrl: cleanString(target?.baseUrl).replace(/\/+$/, ""),
		serviceName: cleanString(target?.serviceName),
		entitySet: cleanString(target?.entitySet),
	};
}

export function resolveSapLoginTargetConfig(systemId, { loginTargets = SAP_LOGIN_TARGETS, requireMappedSystem = true } = {}) {
	const normalizedSystemId = normalizeSystemId(systemId);

	if (!normalizedSystemId) {
		const err = new Error("systemId is required");
		err.status = 400;
		err.code = "MISSING_SYSTEM_ID";
		throw err;
	}

	const target = normalizeTargetConfig(normalizedSystemId, loginTargets?.[normalizedSystemId]);

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
	loginTargets = SAP_LOGIN_TARGETS,
	requireMappedSystem = true,
} = {}) {
	const target = resolveSapLoginTargetConfig(systemId, { loginTargets, requireMappedSystem });

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
