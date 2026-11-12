import { Schema, model, Document, Types } from "mongoose";

// A pre-registered OAuth client of one agent, created from the admin panel
// (no dynamic registration). The secret is shown once; only its SHA-256 is
// stored (it is 256 random bits, so a fast hash is enough).
export interface IOAuthClient {
  clientId: string;
  secretHash: string;
  agent: Types.ObjectId;
  name: string;
  redirectUris: string[];   // compared exactly
  createdBy: Types.ObjectId;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
export interface IOAuthClientDocument extends IOAuthClient, Document {}

const schema = new Schema<IOAuthClientDocument>(
  {
    clientId:     { type: String, required: true, unique: true },
    secretHash:   { type: String, required: true },
    agent:        { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name:         { type: String, required: true },
    redirectUris: { type: [String], required: true },
    createdBy:    { type: Schema.Types.ObjectId, ref: "User", required: true },
    revokedAt:    { type: Date, default: null },
  },
  { timestamps: true }
);

export default model<IOAuthClientDocument>("OAuthClient", schema);
