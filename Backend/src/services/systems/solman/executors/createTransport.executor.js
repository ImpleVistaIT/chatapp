import { createTransport } from "../transport.service.js";

export async function executeSolmanCreateTransport({ payload, req }) {
  try {
    const result = await createTransport({
      ...payload,
      req,
    });

    return {
      ok: true,
      message: "Transport created successfully.",
      result,
    };
  } catch (error) {
    return {
      ok: false,
      message: "Failed to create transport.",
      error: error.message,
    };
  }
}