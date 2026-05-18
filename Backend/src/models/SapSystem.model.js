import mongoose from "mongoose";

const SapSystemSchema = new mongoose.Schema(
  {
    owner: { type: String, required: true },
    name: { type: String, default: "" },

    systemId: { type: String, required: true }, // S4D, CLIENTA, etc.

    protocol: { type: String, enum: ["http", "https"], default: "https" },
    host: { type: String, required: true },
    port: { type: Number, required: true },

    sapRouter: { type: String, default: "" },
  },
  { timestamps: true }
);

// ✅ keep unique per owner + SID
SapSystemSchema.index({ owner: 1, systemId: 1 }, { unique: true });

// ✅ normalize EXACTLY like SapCredential so /sap/tiles join always works
SapSystemSchema.pre("validate", function preValidate(next) {
  if (this.name != null) this.name = String(this.name).trim();

  // IMPORTANT: systemId must match creds (uppercase)
  if (this.systemId != null) this.systemId = String(this.systemId).trim().toUpperCase();

  // protocol is enum ["http","https"]
  if (this.protocol != null) this.protocol = String(this.protocol).trim().toLowerCase();

  // host trimmed
  if (this.host != null) this.host = String(this.host).trim();

  // port normalized to number (and keep required behavior)
  if (this.port != null) this.port = Number(this.port);

  if (this.sapRouter != null) this.sapRouter = String(this.sapRouter).trim();
  next();
});

export const SapSystem = mongoose.model("SapSystem", SapSystemSchema);