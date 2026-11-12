import { Schema, model, Document, Types } from "mongoose";

// What agents did and what admins decided. Kept 30 days (TTL index), then
// MongoDB removes entries by itself. Never holds tokens, secrets or bodies.
export const AUDIT_RETENTION_DAYS = 30;

export interface IAuditLog {
  at: Date;
  event: string;            // "tool_call", "review", "grant_approved", "agent_registered", ...
  agent: Types.ObjectId | null;
  admin: Types.ObjectId | null;
  tool: string | null;      // tool_call: the agent API operation
  post: Types.ObjectId | null;
  changeRequest: Types.ObjectId | null;
  outcome: string;          // "ok" or an error (HTTP status / error key)
  detail: string;           // short, e.g. the decision or the reviewer's comment
}
export interface IAuditLogDocument extends IAuditLog, Document {}

const schema = new Schema<IAuditLogDocument>({
  at:            { type: Date, default: () => new Date() },
  event:         { type: String, required: true },
  agent:         { type: Schema.Types.ObjectId, ref: "User", default: null },
  admin:         { type: Schema.Types.ObjectId, ref: "User", default: null },
  tool:          { type: String, default: null },
  post:          { type: Schema.Types.ObjectId, ref: "Post", default: null },
  changeRequest: { type: Schema.Types.ObjectId, ref: "ChangeRequest", default: null },
  outcome:       { type: String, default: "ok" },
  detail:        { type: String, default: "" },
});

schema.index({ at: 1 }, { expireAfterSeconds: AUDIT_RETENTION_DAYS * 24 * 3600 });
schema.index({ agent: 1, at: -1 });
schema.index({ event: 1, at: -1 });

export default model<IAuditLogDocument>("AuditLog", schema);
