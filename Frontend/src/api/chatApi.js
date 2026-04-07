export async function sendChatMessage(message, opts = {}) {
  const defaultWelcome = {
    ok: true,
    reply: "Hi, Welcome to ImpleVista AI. How may I assist you?",
    suggestions: [
      "Show latest purchase orders",
      "Show PO created in January 2026",
      "Show details of PO 4500001933",
    ],
  };

  const userMsg = (message ?? "").toString().toLowerCase().trim();
  if (["hi", "hello", "hey", "hi!", "hello!", "hey!"].includes(userMsg)) return defaultWelcome;
  if (userMsg === "help") return defaultWelcome;

  // ✅ base url supports server + local
  const envBase = import.meta?.env?.VITE_API_BASE_URL?.trim();
  const localFallback =
    typeof window !== "undefined"
      ? `${window.location.protocol}//${window.location.hostname}:3000`
      : "";
  const sameOriginFallback = typeof window !== "undefined" ? window.location.origin : "";
  const base = envBase || localFallback || sameOriginFallback;

  if (!base) throw new Error("Unable to determine API base URL. Set VITE_API_BASE_URL in .env.");

  const { signal, conversationId, userId, sessionId } = opts;

  let res;
  try {
    res = await fetch(`${base}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({ message, conversationId, userId, sessionId }),
    });
  } catch (e) {
    throw new Error(e?.message || "Network error");
  }

  const data = await res.json().catch(() => ({}));

  // If API says not ok, keep your welcome behavior
  if (!res.ok || data?.ok === false) return defaultWelcome;

  let msg = null;
  const intent = String(data?.intent || "").toUpperCase();

  // ✅ 0) SHOW_PO: always show the list, not the count summary
  if (intent === "SHOW_PO") {
    if (Array.isArray(data?.data?.lines) && data.data.lines.length > 0) {
      // Build display text from lines (recommended)
      const header = `PO LIST (returned ${data?.data?.count ?? data.data.lines.length} of ${data?.data?.totalMatched ?? "?"})`;
      msg = `${header}\n${data.data.lines.join("\n")}`;
    } else if (data?.data?.text) {
      // Fallback to backend-preformatted text
      msg = data.data.text;
    } else if (data?.reply) {
      // Last fallback (count only)
      msg = data.reply;
    } else {
      return defaultWelcome;
    }
  }

  // ✅ 1) For other intents: prefer text first, then reply
  else if (data?.data?.text) {
    msg = data.data.text;
  } else if (data?.reply) {
    msg = data.reply;
  }

  // PLANTS
  else if (data?.data?.plants) {
    msg = data.data.plants.map((p) => `Plant: ${p}`).join("\n");
  }

  // STORAGE LOCATIONS
  else if (data?.data?.storage_locations) {
    msg = data.data.storage_locations.map((s) => `Storage Location: ${s}`).join("\n");
  }

  // MEASURES
  else if (data?.data?.measures) {
    const measuresRows = data.data.measures.map((r) => {
      const item = String(r.po_item || "N/A").replace(/^0+/, "") || r.po_item;
      const parts = [];

      if ("gross_weight" in r) {
        const unit = r.weight_unit || "";
        parts.push(`Gross weight: ${r.gross_weight ?? "N/A"}${unit ? " " + unit : ""}`);
      }
      if ("net_weight" in r) {
        const unit = r.weight_unit || "";
        parts.push(`Net weight: ${r.net_weight ?? "N/A"}${unit ? " " + unit : ""}`);
      }
      if ("volume" in r) {
        const unit = r.volume_unit || "";
        parts.push(`Volume: ${r.volume ?? "N/A"}${unit ? " " + unit : ""}`);
      } else if ("volume_unit" in r) {
        parts.push(`Volume unit: ${r.volume_unit ?? "N/A"}`);
      }
      if ("mat_type" in r && r.mat_type != null && String(r.mat_type).trim() !== "") {
        parts.push(`Material type: ${r.mat_type}`);
      }

      return {
        item,
        text: `Item ${item} -> ${parts.length ? parts.join(" | ") : "No result found"}`,
        raw: r,
      };
    });

    msg = measuresRows.map((x) => x.text).join("\n");

    return {
      ok: true,
      reply: msg,
      data: data?.data ?? null,
      meta: data?.meta ?? null,
      raw: data,
      measuresRows,
    };
  }

  // ITEMS
  else if (data?.data?.items) {
    const items = data.data.items;
    const i2 = String(data.intent || "").toUpperCase();

    if (i2 === "SHOW_PO_ITEMS") {
      msg = items
        .map((row, i) => {
          const it = row?.item || {};
          return `${i + 1}. PO Item: ${it.po_item || "N/A"}
Material: ${it.material || "N/A"}
Text: ${it.short_text || "N/A"}
Plant: ${it.plant || "N/A"}
Storage: ${it.storage_location || "N/A"}
Mat Group: ${it.mat_group || "N/A"}`;
        })
        .join("\n\n");
    } else {
      msg = items
        .map((row, i) => {
          const it = row?.item || {};
          const qty = row?.quantity || {};
          const pr = row?.pricing || {};
          const del = row?.delivery || {};
          return `
Item ${i + 1}
Material: ${it.material || "N/A"}
PO Item: ${it.po_item || "N/A"}
Plant: ${it.plant || "N/A"}
Storage: ${it.storage_location || "N/A"}
Qty: ${qty.ordered ?? "N/A"} ${qty.unit || ""}
Price: ${pr.net_price ?? "N/A"} ${pr.currency || ""}
Delivery: ${del.delivery_date || "N/A"}
          `.trim();
        })
        .join("\n----------------\n");
    }
  }

  // DELIVERY
  else if (data?.data?.delivery) {
    msg = data.data.delivery
      .map((d, i) => `Delivery ${i + 1}: Date ${d.delivery_date || "N/A"}`)
      .join("\n");
  }

  // PRICING
  else if (data?.data?.pricing) {
    msg = data.data.pricing
      .map((p) => {
        const poItem = p.po_item || "N/A";
        const displayItem = String(poItem).replace(/^0+/, "") || poItem;
        return `Item ${displayItem}: Price ${p.net_price ?? "N/A"} ${p.currency || ""}`;
      })
      .join("\n");
  }

  // ACCOUNTING
  else if (data?.data?.accounting) {
    msg = data.data.accounting
      .map((a, i) => `Item ${i + 1}: Cost Center ${a.cost_center || "N/A"}`)
      .join("\n");
  }

  // PO HEADER
  else if (data?.data?.po_header) {
    const d = data.data;
    msg = `
PO: ${d.po_header.po_no}
Company: ${d.po_header.company_code}
Created By: ${d.po_header.created_by}
Vendor: ${d.vendor?.vendor_id}
Currency: ${d.po_header.currency}
Items: ${d.summary?.item_count}
    `.trim();
  }

  // backend error fields
  else if (data?.data?.error) {
    msg = data.data.error;
  } else if (data?.error) {
    return defaultWelcome;
  } else {
    return defaultWelcome;
  }

  return {
    ok: true,
    reply: msg,
    data: data?.data ?? null,
    meta: data?.meta ?? null,
    raw: data,
  };
}