import { Types } from "mongoose";
import AuditLogModel, { IAuditLog } from "../models/AuditLog";

type Ref = Types.ObjectId | string | null | undefined;
const oid = (v: Ref) => (v && Types.ObjectId.isValid(String(v)) ? new Types.ObjectId(String(v)) : null);

export interface AuditEntry {
  event: string;
  agent?: Ref;
  admin?: Ref;
  tool?: string;
  post?: Ref;
  changeRequest?: Ref;
  outcome?: string;
  detail?: string;
}

class AuditService {
  // Never throws: a failing audit write is logged but doesn't fail the
  // operation it records.
  static async log(e: AuditEntry): Promise<void> {
    try {
      await AuditLogModel.create({
        event: e.event,
        agent: oid(e.agent),
        admin: oid(e.admin),
        tool: e.tool ?? null,
        post: oid(e.post),
        changeRequest: oid(e.changeRequest),
        outcome: e.outcome ?? "ok",
        detail: (e.detail ?? "").slice(0, 2000),
      });
    } catch (err) {
      console.error("Audit log write failed:", err);
    }
  }

  static async list(filter: { agent?: string; event?: string; limit?: number; before?: Date } = {}): Promise<IAuditLog[]> {
    const q: Record<string, unknown> = {};
    if (filter.agent && Types.ObjectId.isValid(filter.agent)) q.agent = new Types.ObjectId(filter.agent);
    if (filter.event) q.event = filter.event;
    if (filter.before) q.at = { $lt: filter.before };
    return AuditLogModel.find(q).sort({ at: -1 }).limit(Math.min(filter.limit ?? 100, 500)).lean();
  }
}

export default AuditService;
