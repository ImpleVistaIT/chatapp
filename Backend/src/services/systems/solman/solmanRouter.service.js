function isCreateChangeRequestIntent(query) {
  const q = String(query || "").trim().toLowerCase();

  if (!q) return false;

  const phrases = [
    "create change request",
    "raise change request",
    "create solman cr",
    "create cr",
    "create charm",
    "raise charm",
    "open charm",
    "open charm request",
    "create change",
    "new change request",
  ];

  return phrases.some((p) => q.includes(p));
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