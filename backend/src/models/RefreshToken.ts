import { Schema, model, Document, Types } from "mongoose";

// Refresh tokens rotate on every use: the used one is kept (usedAt) until it
// expires, so presenting it again is detected as reuse and revokes the
// whole grant. Only the SHA-256 is stored.
export interface IRefreshToken {
  tokenHash: string;
  grant: Types.ObjectId;
  client: Types.ObjectId;
  scopes: string[];
  resource: string;
  expiresAt: Date;
  usedAt: Date | null;
}
export interface IRefreshTokenDocument extends IRefreshToken, Document {}

const schema = new Schema<IRefreshTokenDocument>({
  tokenHash: { type: String, required: true, unique: true },
  grant:     { type: Schema.Types.ObjectId, ref: "OAuthGrant", required: true, index: true },
  client:    { type: Schema.Types.ObjectId, ref: "OAuthClient", required: true },
  scopes:    { type: [String], required: true },
  resource:  { type: String, required: true },
  expiresAt: { type: Date, required: true },
  usedAt:    { type: Date, default: null },
});
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default model<IRefreshTokenDocument>("RefreshToken", schema);
