import { handleChat as handlePoChat } from "../../../controllers/po.controller.js";

export async function handleS4hanaRoutedChat(req, res, next) {
  return handlePoChat(req, res, next);
}