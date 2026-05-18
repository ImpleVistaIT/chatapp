import mongoose from "mongoose";

/**
 * Stores per-app-user, per-system, per-SAP-user credentials.
 * Password is stored encrypted (AES-256-GCM) as encPassword + encIv + encTag.
 *
 * Key points:
 * - owner comes from JWT (req.user.id)
 * - systemId is the SAP SID (e.g., S4D)
 * - sapUser allows multiple credentials under the same systemId (tile dropdown)
 * - lastUsedAt enables "lastUsed" selection
 */
const SapCredentialSchema = new mongoose.Schema(
  {
    owner: { type: String, required: true },
    systemId: { type: String, required: true }, // e.g. "S4D"
    sapUser: { type: String, required: true },

    encPassword: { type: String, required: true },
    encIv: { type: String, required: true },
    encTag: { type: String, required: true },

    // which SAP user was last used for this system by this owner
    lastUsedAt: { type: Date, default: null },

        // cached SAP profile for UI display
    profileFirstName: { type: String, default: "" },
    profileLastName: { type: String, default: "" },
    profileFullName: { type: String, default: "" },
    profileUpdatedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// multiple creds per owner+systemId (one per sapUser)
SapCredentialSchema.index({ owner: 1, systemId: 1, sapUser: 1 }, { unique: true });

// fast lookup for last-used sap user for a system
SapCredentialSchema.index({ owner: 1, systemId: 1, lastUsedAt: -1 });

// Normalize SID + sapUser
SapCredentialSchema.pre("validate", function preValidate(next) {
  if (this.systemId) this.systemId = String(this.systemId).trim().toUpperCase();
  if (this.sapUser) this.sapUser = String(this.sapUser).trim().toUpperCase();
  next();
});

export const SapCredential = mongoose.model("SapCredential", SapCredentialSchema);