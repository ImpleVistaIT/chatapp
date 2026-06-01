export function selectChatEndpoint(query) {
  const q = String(query || "").toLowerCase().trim();

  const s4hanaHints = [
    "po",
    "purchase order",
    "purchase orders",
    "latest po",
    "latest purchase orders",
    "show po",
    "show purchase order",
    "details of po",
    "po created",
    "vendor",
    "net price",
  ];

  const isS4HanaLike = s4hanaHints.some((hint) => q.includes(hint));

  return isS4HanaLike ? "stream" : "chat";
}