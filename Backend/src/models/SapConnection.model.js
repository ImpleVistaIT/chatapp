import mongoose from "mongoose";

const SapConnectionSchema = new mongoose.Schema(
  {
    // For now single-user. Later replace with real userId from auth.
    owner: { type: String, required: true, default: "local" },

    description: { type: String, required: true }, // e.g. Production
    applicationServer: { type: String, required: true },
    instanceNumber: { type: String, required: true },
    systemId: { type: String, required: true },
    saprouter: { type: String, default: "" },

    username: { type: String, required: true },

    // store encrypted password (AES-GCM)
    passwordEnc: { type: String, required: true },

    connectedAt: { type: Date, required: true, default: () => new Date() },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

SapConnectionSchema.index({ owner: 1, revokedAt: 1, expiresAt: 1 });

export const SapConnection =
  mongoose.models.SapConnection || mongoose.model("SapConnection", SapConnectionSchema);