import { getOwner } from "./_chat/auth.js";
import { sendReportEmail } from "../services/email/emailDelivery.service.js";

function cleanString(value) {
  return String(value || "").trim();
}

function parseAttachment(attachment = {}) {
  const filename = cleanString(attachment?.filename);
  const contentType = cleanString(attachment?.contentType) || "application/octet-stream";
  const contentBase64 = cleanString(attachment?.contentBase64);

  if (!filename || !contentBase64) {
    return null;
  }

  return {
    filename,
    contentType,
    content: Buffer.from(contentBase64, "base64"),
  };
}

function validateEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanString(value));
}

export async function sendChatReportEmail(req, res, next) {
  try {
    const owner = getOwner(req);
    const body = req.body || {};

    const to = cleanString(body.to);
    const senderEmail = cleanString(body.senderEmail);
    const senderName = cleanString(body.senderName);
    const subject = cleanString(body.subject) || "SAP Chat Export";
    const customMessage = cleanString(body.customMessage);
    const attachment = parseAttachment(body.attachment);

    if (!to || !validateEmail(to)) {
      return res.status(400).json({ ok: false, error: "A valid recipient email is required." });
    }

    if (!attachment) {
      return res.status(400).json({ ok: false, error: "An attachment is required." });
    }

    const messageText = customMessage || "Please find the requested report attached.";
    const html = [
      `<p>${messageText.replace(/\n/g, "<br>")}</p>`,
      `<p><strong>Requested by:</strong> ${owner}</p>`,
    ].join("\n");

    const result = await sendReportEmail({
      replyTo: senderEmail,
      senderName,
      to,
      subject,
      text: `${messageText}\n\nRequested by: ${owner}`,
      html,
      attachments: [attachment],
    });

    console.info("[chat-email] report sent", {
      owner,
      to,
      replyTo: senderEmail,
      subject,
      attachment: attachment.filename,
      messageId: result?.messageId || null,
    });

    return res.json({ ok: true, ...result });
  } catch (error) {
    console.error("[chat-email] send failed", {
      owner: req.user?.id || null,
      message: error?.message || String(error),
    });
    return next(error);
  }
}