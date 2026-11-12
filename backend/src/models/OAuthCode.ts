import { Schema, model, Document, Types } from "mongoose";

// Authorization code: single use, a few minutes. Only its SHA-256 is stored.
// usedAt is kept so a second use can be detected (and the grant revoked).
export interface IOAuthCode {
  codeHash: string;
  grant: Types.ObjectId;
  client: Types.ObjectId;
  redirectUri: string;
  codeChallenge: string;
  scopes: string[];
  resource: string;
  expiresAt: Date;
  usedAt: Date | null;
}
export interface IOAuthCodeDocument extends IOAuthCode, Document {}

const schema = new Schema<IOAuthCodeDocument>({
  codeHash:      { type: String, required: true, unique: true },
  grant:         { type: Schema.Types.ObjectId, ref: "OAuthGrant", required: true },
  client:        { type: Schema.Types.ObjectId, ref: "OAuthClient", required: true },
  redirectUri:   { type: String, required: true },
  codeChallenge: { type: String, required: true },
  scopes:        { type: [String], required: true },
  resource:      { type: String, required: true },
  expiresAt:     { type: Date, required: true },
  usedAt:        { type: Date, default: null },
});
// Removed an hour after expiry (reuse is still detected meanwhile)
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });

export default model<IOAuthCodeDocument>("OAuthCode", schema);
