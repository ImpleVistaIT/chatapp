import {
  isDetailFollowUpQuery,
  inferDocContextFromMemory,
  extractRequestedItemFromQuery,
} from "./memory.js";

export function applyFollowUpMemory({ query, extracted, memory, service }) {
  const isDetailFollowUp = isDetailFollowUpQuery(query);

  const isListQuery =
    !isDetailFollowUp &&
    (
      Boolean(extracted?.listMode) ||
      (Array.isArray(extracted?.filters) && extracted.filters.length > 0) ||
      (Array.isArray(extracted?.orderBy) && extracted.orderBy.length > 0) ||
      (extracted?.limit != null &&
        Number.isFinite(Number(extracted.limit)) &&
        Number(extracted.limit) > 0)
    );

  if (!isListQuery) {
    if (!extracted.docNumber && memory?.extracted?.docNumber) {
      extracted.docNumber = memory.extracted.docNumber;
    }
    if (!extracted.docItem && memory?.extracted?.docItem) {
      extracted.docItem = memory.extracted.docItem;
    }
  }

  if (isDetailFollowUp) {
    const inferred = inferDocContextFromMemory({
      memory,
      idField: service.idField,
      itemField: service.itemField || "PoItem",
    });

    if (inferred?.docNumber && !extracted.docNumber) {
      extracted.docNumber = inferred.docNumber;
    }

    const requestedItem = extractRequestedItemFromQuery(query);
    if (requestedItem && !extracted.docItem) {
      extracted.docItem = requestedItem;
    } else if (inferred?.docItem && !extracted.docItem) {
      extracted.docItem = inferred.docItem;
    }

    extracted.fields = [
      "ItemDeliDt",
      "ShortText",
      "MatNo",
      "Plant",
      "StrLoc",
      "MatGrp",
      "Menge",
      "NetPrice",
      "CurKey",
    ];

    extracted.listMode = null;
    extracted.orderBy = [];
    extracted.limit = 5;
  }

  return {
    extracted,
    isDetailFollowUp,
    isListQuery,
  };
}