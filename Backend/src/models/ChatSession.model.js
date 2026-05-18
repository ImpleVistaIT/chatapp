import mongoose from "mongoose";

const ChatSessionSchema = new mongoose.Schema(
  {
    owner: { type: String, required: true, default: "local", index: true },

    title: { type: String, default: "" },

    systemId: { type: String, required: true, index: true },

    sapUser: { type: String, default: null, index: true },

    sapConnectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SapConnection",
      default: null,
    },

    currentSystemType: { type: String, enum: ["s4hana", "solman"], default: null },
    routingSource: { type: String, default: null },
    lastClassifiedAt: { type: Date, default: null },

    pendingAction: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  { timestamps: true }
);

// ✅ primary query pattern: list sessions for a user + system (+ sapUser)
ChatSessionSchema.index({ owner: 1, systemId: 1, sapUser: 1, updatedAt: -1 });

// keep old patterns too (backward compatibility / older queries)
ChatSessionSchema.index({ owner: 1, systemId: 1, updatedAt: -1 });
ChatSessionSchema.index({ owner: 1, updatedAt: -1 });

// Normalize SID + owner + sapUser
ChatSessionSchema.pre("validate", function preValidate() {
  if (this.systemId) this.systemId = String(this.systemId).trim().toUpperCase();
  if (this.owner) this.owner = String(this.owner).trim();
  if (this.sapUser != null) {
    const s = String(this.sapUser).trim();
    this.sapUser = s ? s : null;
  }
});

export const ChatSession =
  mongoose.models.ChatSession || mongoose.model("ChatSession", ChatSessionSchema);