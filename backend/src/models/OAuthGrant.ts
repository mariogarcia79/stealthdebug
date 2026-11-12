import { Schema, model, Document, Types } from "mongoose";

// An admin's approval of an agent's client for some scopes (the consent).
// Refresh tokens belong to a grant, and the agent API checks the grant on
// every call: revoking it cuts the agent off immediately.
export const AGENT_SCOPES = ["posts:read", "changes:write"] as const;
export type AgentScope = (typeof AGENT_SCOPES)[number];

export interface IOAuthGrant {
  agent: Types.ObjectId;
  client: Types.ObjectId;
  scopes: AgentScope[];
  approvedBy: Types.ObjectId;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
export interface IOAuthGrantDocument extends IOAuthGrant, Document {}

const schema = new Schema<IOAuthGrantDocument>(
  {
    agent:      { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    client:     { type: Schema.Types.ObjectId, ref: "OAuthClient", required: true },
    scopes:     { type: [String], enum: AGENT_SCOPES, required: true },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    lastUsedAt: { type: Date, default: null },
    revokedAt:  { type: Date, default: null },
  },
  { timestamps: true }
);

export default model<IOAuthGrantDocument>("OAuthGrant", schema);
