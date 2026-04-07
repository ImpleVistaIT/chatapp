export async function chatTextController(req, res) {
  const message = String(req.body?.message || "").trim().toLowerCase();

  if (!message) {
    return res.status(400).json({ ok: false, error: "message is required" });
  }

  // basic greetings (you can extend this)
  if (["hi", "hello", "hey", "hii", "helo", "hai"].includes(message) || message === "help" || message === "start") {
    return res.json({
      ok: true,
      reply:
        "Hi! Send a structured request like:\n" +
        '{ "entity": "PO", "intent": "CREATED_BY", "id": "4500000066" }\n\n' +
        "Or call POST /chat/text only for greetings/help.",
    });
  }

  // If you want: later integrate LLM here to convert text -> {entity,intent,id}
  return res.status(400).json({
    ok: false,
    error:
      "Text mode currently supports only greetings/help. For queries, send structured payload to POST /chat.",
  });
}