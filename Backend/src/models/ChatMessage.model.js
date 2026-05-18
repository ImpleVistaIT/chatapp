import mongoose from "mongoose";

const ChatMessageSchema = new mongoose.Schema(
  {
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: "ChatSession", required: true },
    owner: { type: String, required: true, default: "local" },

    role: { type: String, enum: ["user", "assistant"], required: true },
    text: { type: String, required: true },

    // ✅ NEW: persisted assistant narration/summary (survives refresh)
    summary: { type: String, default: null },

    extracted: { type: Object, default: null },
    sapRequest: { type: String, default: "" },
    responseMeta: { type: Object, default: null },

    // ✅ store last returned rows for follow-up questions
    data: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

ChatMessageSchema.index({ sessionId: 1, createdAt: 1 });

export const ChatMessage =
  mongoose.models.ChatMessage || mongoose.model("ChatMessage", ChatMessageSchema);