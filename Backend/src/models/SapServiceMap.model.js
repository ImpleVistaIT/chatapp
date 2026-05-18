import mongoose from "mongoose";

const SapServiceMapSchema = new mongoose.Schema(
  {
    owner: { type: String, required: true },
    systemId: { type: String, required: true },

    // ✅ PO ONLY
    serviceType: { type: String, enum: ["PO"], required: true },

    serviceName: { type: String, required: true },     // Z*/Y*
    entitySet: { type: String, required: true },       // Po_detailsSet
    entityTypeName: { type: String, required: true },  // Po_details

    idField: { type: String, required: true },         // PoNo
    itemField: { type: String, default: "" },          // PoItem

    idPad: { type: Number, default: 10 },
    itemPad: { type: Number, default: 5 },             // ✅ PO item is usually 5 digits
  },
  { timestamps: true }
);

SapServiceMapSchema.index({ owner: 1, systemId: 1, serviceType: 1 }, { unique: true });

SapServiceMapSchema.pre("validate", function (next) {
  if (this.systemId) this.systemId = String(this.systemId).trim().toUpperCase();
  if (this.serviceName) this.serviceName = String(this.serviceName).trim();
  if (this.entitySet) this.entitySet = String(this.entitySet).trim();
  if (this.entityTypeName) this.entityTypeName = String(this.entityTypeName).trim();
  if (this.idField) this.idField = String(this.idField).trim();
  if (this.itemField != null) this.itemField = String(this.itemField).trim();
  next();
});

export const SapServiceMap = mongoose.model("SapServiceMap", SapServiceMapSchema);