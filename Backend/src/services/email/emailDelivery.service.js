import { Resend } from "resend";

const DEFAULT_RESEND_FROM = "SAP Chatbot <noreply@implevistait.com>";

function cleanString(value) {
  return String(value || "").trim();
}

function getResendClient() {
  const apiKey = cleanString(process.env.RESEND_API_KEY);

  if (!apiKey) {
    const err = new Error("Resend is not configured. Set RESEND_API_KEY.");
    err.status = 500;
    err.code = "RESEND_NOT_CONFIGURED";
    throw err;
  }

  return new Resend(apiKey);
}

function getVerifiedFromAddress() {
  return (
    cleanString(process.env.RESEND_FROM) ||
    cleanString(process.env.EMAIL_FROM) ||
    DEFAULT_RESEND_FROM
  );
}

function buildFromAddress(senderName) {
  const verifiedFrom = getVerifiedFromAddress();

  if (!senderName) {
    return verifiedFrom;
  }

  const verifiedEmail = verifiedFrom.match(/<([^>]+)>/)?.[1] || verifiedFrom;
  return `${cleanString(senderName)} <${verifiedEmail}>`;
}

export async function sendReportEmail({
  replyTo,
  senderName,
  to,
  subject,
  text,
  html,
  attachments = [],
}) {
  const resend = getResendClient();
  const verifiedFrom = getVerifiedFromAddress();
  const preferredFrom = buildFromAddress(senderName);

  const normalizedAttachments = Array.isArray(attachments)
    ? attachments.map((attachment) => {
        const filename = cleanString(attachment?.filename);
        const content = attachment?.content;
        const contentType = cleanString(attachment?.contentType) || undefined;

        if (!filename) {
          const err = new Error("Attachment filename is required.");
          err.status = 400;
          throw err;
        }

        const contentSize = Buffer.isBuffer(content)
          ? content.length
          : typeof content?.byteLength === "number"
            ? content.byteLength
            : 0;

        if (contentSize <= 0) {
          const err = new Error(`Attachment ${filename} is empty.`);
          err.status = 400;
          throw err;
        }

        return {
          filename,
          content,
          contentType,
        };
      })
    : [];

  const sendWithFrom = async (fromAddress) => {
    return resend.emails.send({
      from: fromAddress,
      to: cleanString(to),
      subject: cleanString(subject) || "SAP Chat Export",
      text: cleanString(text),
      html,
      replyTo: cleanString(replyTo) || undefined,
      attachments: normalizedAttachments,
    });
  };

  let response;

  try {
    response = await sendWithFrom(preferredFrom);
  } catch (error) {
    console.error("[email] resend send failed", {
      from: preferredFrom,
      fallbackFrom: verifiedFrom,
      to: cleanString(to),
      subject: cleanString(subject),
      message: error?.message || String(error),
    });

    if (preferredFrom !== verifiedFrom) {
      response = await sendWithFrom(verifiedFrom);
    } else {
      throw error;
    }
  }

  const responseData = response?.data || response || null;
  const responseError = responseData?.error || response?.error || null;

  if (responseError) {
    const err = new Error(responseError?.message || "Resend rejected the email request.");
    err.status = responseError?.statusCode || responseError?.status || 502;
    err.response = responseError;
    throw err;
  }

  const messageId = responseData?.id || responseData?.data?.id || response?.id || null;

  if (!messageId && preferredFrom !== verifiedFrom) {
    response = await sendWithFrom(verifiedFrom);
  }

  const finalResponseData = response?.data || response || null;
  const finalResponseError = finalResponseData?.error || response?.error || null;

  if (finalResponseError) {
    const err = new Error(finalResponseError?.message || "Resend rejected the email request.");
    err.status = finalResponseError?.statusCode || finalResponseError?.status || 502;
    err.response = finalResponseError;
    throw err;
  }

  const finalMessageId = finalResponseData?.id || finalResponseData?.data?.id || response?.id || null;

  if (!finalMessageId) {
    const err = new Error("Resend did not return a message id. The email was not accepted.");
    err.status = 502;
    err.response = response?.data || response || null;
    throw err;
  }

  return {
    messageId: finalMessageId,
    accepted: finalResponseData?.to ? [finalResponseData.to].flat() : response?.to ? [response.to].flat() : [],
    rejected: [],
    response: finalResponseData ? JSON.stringify(finalResponseData) : JSON.stringify(response || {}),
  };
}