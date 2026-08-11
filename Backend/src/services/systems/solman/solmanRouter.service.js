function isCreateChangeRequestIntent(query) {
  const q = String(query || "").trim().toLowerCase();

  if (!q) return false;

  const actionWords = [
    "create",
    "raise",
    "submit",
    "open",
    "initiate",
    "start",
    "generate",
    "make",
    "add",
    "request",
  ];

  const entityWords = [
    "change request",
    "change requests",
    "cr",
    "crs",
    "cr's",
    "transport change request",
    "transport request",
  ];

  const hasAction = actionWords.some((word) => q.includes(word));
  const hasEntity = entityWords.some((word) => q.includes(word));

  return hasAction && hasEntity;
}

export async function handleSolmanRoutedChat({ req, res }) {
  try {
    const query = String(req.body?.query || "").trim();

    if (isCreateChangeRequestIntent(query)) {
      return res.json({
        ok: true,
        targetSystem: "solman",
        action: "open_create_cr_form",
        message: "Please provide the change request details to create a SolMan CR.",
      });
    }

    return res.json({
      ok: true,
      targetSystem: "solman",
      message: "SolMan chat support is not implemented yet for this request.",
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message || "Failed to process SolMan routed chat.",
    });
  }
}