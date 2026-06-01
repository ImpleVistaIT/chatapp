import mongoose from "mongoose";

const SapCatalogFieldSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    label: { type: String, default: "", trim: true },
    type: { type: String, default: "", trim: true },
    nullable: { type: Boolean, default: true },
    maxLength: { type: Number, default: null },
    precision: { type: Number, default: null },
    scale: { type: Number, default: null },
    filterable: { type: Boolean, default: true },
    sortable: { type: Boolean, default: true },
    creatable: { type: Boolean, default: false },
    updatable: { type: Boolean, default: false },
    semantics: { type: String, default: "", trim: true },
    unitField: { type: String, default: "", trim: true },
  },
  { _id: false }
);

const SapServiceCatalogSchema = new mongoose.Schema(
  {
    owner: { type: String, required: true, trim: true, index: true },
    systemId: { type: String, required: true, trim: true, uppercase: true, index: true },

    serviceName: { type: String, required: true, trim: true, index: true },
    entityContainerName: { type: String, default: "", trim: true },
    entitySet: { type: String, required: true, trim: true, index: true },
    entityTypeName: { type: String, required: true, trim: true },

    namespace: { type: String, default: "", trim: true },
    metadataUrl: { type: String, default: "", trim: true },

    keys: [{ type: String, trim: true }],
    fields: [SapCatalogFieldSchema],

    domainHints: [{ type: String, trim: true }],
    labelsText: { type: String, default: "", trim: true },

    metadataHash: { type: String, default: "", trim: true },
    lastIngestedAt: { type: Date, default: null },

    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    collection: "SapServiceCatalog",
  }
);

SapServiceCatalogSchema.index(
  { owner: 1, systemId: 1, serviceName: 1, entitySet: 1 },
  { unique: true, name: "uniq_owner_system_service_entityset" }
);

export const SapServiceCatalog =
  mongoose.models.SapServiceCatalog ||
  mongoose.model("SapServiceCatalog", SapServiceCatalogSchema);