import { handleDocChat } from "./chat.controller.js";

// PO only: keep exactly same behavior
export async function handleChat(req, res, next) {
  return handleDocChat({
    req,
    res,
    defaultDocType: "PO",
    docTypeFast: "PO",
  });
}