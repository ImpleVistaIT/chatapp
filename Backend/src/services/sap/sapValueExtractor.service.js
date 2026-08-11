function normalizeSapCandidateValue(value) {
  if (value === undefined || value === null) return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const normalized = normalizeSapCandidateValue(item);
      if (normalized !== null) return normalized;
    }
    return null;
  }

  if (typeof value === "object") {
    if (value._text !== undefined && String(value._text).trim() !== "") {
      return value._text;
    }

    if (value["#text"] !== undefined && String(value["#text"]).trim() !== "") {
      return value["#text"];
    }

    if (value._ !== undefined && String(value._).trim() !== "") {
      return value._;
    }

    return null;
  }

  const text = String(value).trim();
  return text ? value : null;
}

export function extractSapValue(row = {}, fields = []) {
  for (const field of Array.isArray(fields) ? fields : []) {
    const value = row?.[field];
    const normalized = normalizeSapCandidateValue(value);
    if (normalized !== null) return normalized;
  }

  return null;
}

export function extractQuantityValue(row = {}, fields = []) {
  return extractSapValue(row, fields);
}

export function extractDateValue(row = {}, fields = []) {
  return extractSapValue(row, fields);
}
