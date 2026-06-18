import { generateJson } from "../llm/ollama.client.js";

function cleanString(value) {
  return String(value || "").trim();
}

function normalizeIntent(value) {
  const intent = cleanString(value).toLowerCase();

  if (["greeting", "small_talk", "bot_identity", "bot_capability", "thanks", "bye", "general_conversation", "sap_query", "unknown"].includes(intent)) {
    return intent;
  }

  return "unknown";
}

function looksLikeSapQuery(query) {
  const q = cleanString(query).toLowerCase();
  if (!q) return false;

  return /\b(po|purchase\s*order|purchase\s*orders|invoice|vendor|supplier|material|delivery|sales\s*order|change\s*request|change\s*requests|cr|charm|transport|solman|s4|s4hana|report|analytics|transaction|workflow|approval|approvals)\b/i.test(q);
}

function buildReplyForIntent(intent) {
  switch (intent) {
    case "greeting":
      return "Hello! How can I help you today?";
    case "bot_identity":
      return "I am your SAP Analytics Assistant.";
    case "bot_capability":
      return "I can help with SAP purchase orders, invoices, vendors, reports, analytics, and transactions.";
    case "small_talk":
      return "I'm doing well. How can I assist you today?";
    case "general_conversation":
      return "I am your SAP Analytics Assistant.";
    case "thanks":
      return "You're welcome. Let me know if you need anything else.";
    case "bye":
      return "Goodbye! Feel free to come back if you need anything.";
    default:
      return "Hello! How can I help you today?";
  }
}

function buildSuggestions(intent) {
  if (intent !== "greeting" && intent !== "bot_identity" && intent !== "bot_capability" && intent !== "small_talk" && intent !== "general_conversation") {
    return [];
  }

  return [
    "show cr status",
    "Show PO created in January 2026",
    "Show details of PO 4500001933",
  ];
}

function buildConversationPrompt(query) {
  return `
You are a strict conversation-intent classifier for an SAP assistant.

Classify the user message into exactly one intent:
- greeting
- small_talk
- bot_identity
- bot_capability
- thanks
- bye
- general_conversation
- sap_query
- unknown

Return ONLY valid JSON in this exact shape:
{
  "intent": "greeting|small_talk|bot_identity|bot_capability|thanks|bye|general_conversation|sap_query|unknown",
  "confidence": 0.0,
  "reply": "short direct reply only for non-SAP intents, empty string for sap_query",
  "reason": "short reason"
}

Rules:
- greeting: Hi, Hello, Good morning, Good afternoon, Good evening, Hey
- small_talk: How are you, how's it going, general casual chat
- bot_identity: What is your name, who are you, what should I call you
- bot_capability: What can you do, what help do you provide
- general_conversation: bot-related or casual questions that are not SAP business requests
- thanks: Thank you, thanks, appreciate it
- bye: Bye, goodbye, see you
- sap_query: any business request about POs, invoices, vendors, reports, analytics, change requests, approvals, transports, SAP data, or transactions
- unknown: anything else

User message: ${JSON.stringify(cleanString(query))}
`;
}

function buildClassifierFallback(query) {
  const q = cleanString(query).toLowerCase();

  if (!q) {
    return { handled: false, intent: "unknown", reply: "", confidence: 0 };
  }

  if (/^(hi|hello|hey|hiya|good\s+(morning|afternoon|evening))(?:[!.?\s]*)$/i.test(q)) {
    return { handled: true, intent: "greeting", reply: buildReplyForIntent("greeting"), confidence: 0.99 };
  }

  if (/\b(what is your name|who are you|what should i call you)\b/i.test(q)) {
    return { handled: true, intent: "bot_identity", reply: buildReplyForIntent("bot_identity"), confidence: 0.98 };
  }

  if (/\b(what can you do|what do you do|how can you help|what help do you provide)\b/i.test(q)) {
    return { handled: true, intent: "bot_capability", reply: buildReplyForIntent("bot_capability"), confidence: 0.97 };
  }

  if (/\b(what is your father name|who is your father|what's your father name|who is your mother|what is your mother name)\b/i.test(q)) {
    return {
      handled: true,
      intent: "general_conversation",
      reply: "I don't have a father. I am your SAP Analytics Assistant.",
      confidence: 0.9,
    };
  }

  if (/\b(how are you|how are you doing|how's it going|how is it going)\b/i.test(q)) {
    return { handled: true, intent: "small_talk", reply: buildReplyForIntent("small_talk"), confidence: 0.98 };
  }

  if (/\b(thank you|thanks|thankyou|appreciate it)\b/i.test(q)) {
    return { handled: true, intent: "thanks", reply: buildReplyForIntent("thanks"), confidence: 0.99 };
  }

  if (/\b(bye|goodbye|see you|see ya|talk to you later)\b/i.test(q)) {
    return { handled: true, intent: "bye", reply: buildReplyForIntent("bye"), confidence: 0.99 };
  }

  if (looksLikeSapQuery(q)) {
    return { handled: false, intent: "sap_query", reply: "", confidence: 0.9 };
  }

  return { handled: true, intent: "general_conversation", reply: buildReplyForIntent("general_conversation"), confidence: 0.7 };
}

export async function detectConversationIntent({ query }) {
  const userInput = cleanString(query);
  console.log("User Query:", userInput);

  const prompt = buildConversationPrompt(userInput);
  const llm = await generateJson({
    prompt,
    schemaHint: "conversation-intent",
  });

  const rawIntent = normalizeIntent(llm?.ok ? llm?.data?.intent : null);
  const confidence = Number(llm?.ok ? llm?.data?.confidence : 0) || 0;
  const llmReply = cleanString(llm?.ok ? llm?.data?.reply : "");
  const llmLooksLikeSap = looksLikeSapQuery(userInput);

  const fallback = buildClassifierFallback(userInput);
  const intent = rawIntent === "unknown" ? fallback.intent : rawIntent;
  const handled = intent !== "sap_query" && intent !== "unknown";

  if (llmLooksLikeSap && handled && intent !== "sap_query") {
    console.log("Detected Intent:", "sap_query");
    return {
      handled: false,
      intent: "sap_query",
      reply: "",
      suggestions: [],
      confidence: Math.max(confidence, 0.9),
      source: "groq",
    };
  }

  if (!llm?.ok || intent === "unknown") {
    console.log("Detected Intent:", fallback.intent);
    if (fallback.handled) {
      return {
        ...fallback,
        suggestions: buildSuggestions(fallback.intent),
        source: "fallback",
      };
    }

    return {
      handled: false,
      intent: fallback.intent,
      reply: "",
      suggestions: [],
      confidence: fallback.confidence,
      source: "fallback",
    };
  }

  console.log("Detected Intent:", intent);

  if (intent === "sap_query") {
    return {
      handled: false,
      intent,
      reply: "",
      suggestions: [],
      confidence: Math.max(confidence, 0.85),
      source: "groq",
    };
  }

  const reply = buildReplyForIntent(intent);

  return {
    handled: true,
    intent,
    reply,
    suggestions: buildSuggestions(intent),
    confidence: Math.max(confidence, 0.85),
    source: "groq",
  };
}

export function buildGeneralConversationResponse({ intent, reply, suggestions = [] }) {
  return {
    ok: true,
    status: "general_conversation",
    message: reply,
    reply,
    suggestions: Array.isArray(suggestions) ? suggestions : [],
    routing: {
      system: "general",
      module: "conversation",
      intent,
      confidence: 1,
      source: "groq",
    },
  };
}