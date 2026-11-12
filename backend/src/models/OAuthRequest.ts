import { Schema, model, Document, Types } from "mongoose";

// An authorization request (/authorize) waiting for an admin's consent.
// Its id is the random handle the consent page uses; it expires by itself.
export interface IOAuthRequest {
  _id: string;
  client: Types.ObjectId;
  agent: Types.ObjectId;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  scopes: string[];
  resource: string;
  expiresAt: Date;
}
export interface IOAuthRequestDocument extends Omit<IOAuthRequest, "_id">, Document<string> {}

const schema = new Schema<IOAuthRequestDocument>({
  _id:           { type: String },
  client:        { type: Schema.Types.ObjectId, ref: "OAuthClient", required: true },
  agent:         { type: Schema.Types.ObjectId, ref: "User", required: true },
  redirectUri:   { type: String, required: true },
  state:         { type: String, required: true },
  codeChallenge: { type: String, required: true },
  scopes:        { type: [String], required: true },
  resource:      { type: String, required: true },
  expiresAt:     { type: Date, required: true },
});
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default model<IOAuthRequestDocument>("OAuthRequest", schema);
