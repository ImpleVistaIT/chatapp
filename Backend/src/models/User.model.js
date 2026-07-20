import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    oid: { type: String, index: true, unique: false, sparse: true },
    email: { type: String, index: true, sparse: true },
    name: { type: String, default: null },
    roles: { type: [String], default: [] },
    profile: { type: mongoose.Schema.Types.Mixed, default: null },
    lastSeen: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

UserSchema.pre("validate", function () {
  if (this.email) this.email = String(this.email).trim().toLowerCase();
  if (this.oid) this.oid = String(this.oid).trim();
  if (this.name) this.name = String(this.name).trim();
});

export const User = mongoose.models.User || mongoose.model("User", UserSchema);
