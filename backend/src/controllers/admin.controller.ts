import { Request, Response } from "express";
import ChangeRequestService from "../services/changeRequests.service";
import AgentService from "../services/agents.service";
import GuidelinesService from "../services/guidelines.service";
import AuditService from "../services/audit.service";
import PostModel from "../models/Post";
import UserModel from "../models/User";
import { CHANGE_KINDS, CHANGE_STATUSES, IChangeRequestDocument } from "../models/ChangeRequest";
import { AppError, ValidationError } from "../config/errors";
import { MAX_CONTENT_LENGTH } from "../config/validation";
import { contentHash } from "../utils/contentHash";
import { validateName, isObjectId } from "../utils/validation";
import { csrfTokenFor } from "../middleware/csrf.middleware";
import AgentImageService, { proposalTexts } from "../services/agentImages.service";
import MediaService from "../services/media.service";
import { isSafeUploadName } from "../utils/media";

// The admin side of agents (routes/admin.routes.ts): reviewing change
// requests, managing agents, the guidelines and the audit log.

const POST_FIELDS = "title summary content tags series lang published translationOf mcpVisible updatedAt";
async function names(ids: unknown[]): Promise<Record<string, string>> {
  const users = await UserModel.find({ _id: { $in: ids.filter(Boolean) } }).select("name").lean();
  return Object.fromEntries(users.map((u) => [String(u._id), u.name]));
}

// A change request as the review screens need it
async function view(cr: IChangeRequestDocument) {
  const o = cr.toObject() as unknown as Record<string, unknown> & { revisions: { review?: { by?: unknown } | null }[]; review?: { by?: unknown } };
  const n = await names([...o.revisions.map((r) => r.review?.by), o.review?.by]);
  const agent = cr.agent as unknown as { _id?: unknown; name?: string };
  return {
    ...o,
    agent: { _id: agent._id ?? cr.agent, name: agent.name ?? "" },
    revisions: o.revisions.map((r) => ({ ...r, review: r.review ? { ...r.review, byName: n[String(r.review.by)] ?? null } : null })),
    review: o.review ? { ...o.review, byName: n[String(o.review.by)] ?? null } : null,
  };
}

function listQuery(q: Request["query"]) {
  const kind = q.kind as string | undefined;
  const status = q.status as string | undefined;
  if (kind && !(CHANGE_KINDS as readonly string[]).includes(kind)) throw new ValidationError("Invalid kind");
  if (status && !(CHANGE_STATUSES as readonly string[]).includes(status)) throw new ValidationError("Invalid status");
  return { kind: kind as never, status: status as never, agent: typeof q.agent === "string" ? q.agent : undefined };
}

class AdminController {
  static csrf(req: Request, res: Response): Response {
    res.setHeader("Cache-Control", "no-store");
    return res.json({ csrf: csrfTokenFor(req) });
  }

  // ---- change requests

  static async listChangeRequests(req: Request, res: Response): Promise<Response> {
    const list = await ChangeRequestService.list(listQuery(req.query));
    const posts = await PostModel.find({ _id: { $in: list.map((c) => c.post).filter(Boolean) } }).select("title").lean();
    const titles = Object.fromEntries(posts.map((p) => [String(p._id), p.title]));
    return res.json(await Promise.all(list.map(async (cr) => {
      const v = await view(cr);
      const last = cr.revisions[cr.revisions.length - 1];
      // the list doesn't need every revision's full content
      return {
        _id: cr._id, kind: cr.kind, status: cr.status, agent: v.agent, lang: cr.lang,
        post: cr.post ? { _id: cr.post, title: titles[String(cr.post)] ?? null } : null,
        title: last.fields.title ?? titles[String(cr.post)] ?? null,
        description: last.description, revisions: cr.revisions.length,
        createdAt: cr.createdAt, updatedAt: cr.updatedAt,
      };
    })));
  }

  // Detail with what to diff against: the target post as it is now (edit),
  // or the original (translation). New posts are diffed against nothing.
  static async getChangeRequest(req: Request, res: Response): Promise<Response> {
    const cr = await ChangeRequestService.get(req.params.id);
    const target = cr.post ? await PostModel.findById(cr.post).select(POST_FIELDS).lean() : null;
    const translations = cr.post ? await PostModel.find({ translationOf: cr.post }).select("_id lang").lean() : [];
    // Images the proposal uses: library ones (sizes for the preview) and the
    // agent's unpublished uploads (served to the admin only, see pendingImage)
    const texts = proposalTexts(cr);
    const agentId = String((cr.agent as unknown as { _id?: unknown })._id ?? cr.agent);
    const pending = await AgentImageService.forProposal(agentId, texts);
    return res.json({
      changeRequest: await view(cr),
      target: target ? { ...target, contentHash: contentHash(target), translations } : null,
      images: {
        library: await MediaService.imagesForContent(texts),
        pending: pending.map((p) => ({ ...p, previewUrl: `/api/admin/pending-images/${p.filename}` })),
      },
    });
  }

  // An agent's unpublished image, for the review screen
  static async pendingImage(req: Request, res: Response): Promise<Response | void> {
    const data = isSafeUploadName(req.params.filename) ? await AgentImageService.file(req.params.filename) : null;
    if (!data) throw new AppError("NOT_FOUND");
    res.set({ "Content-Type": "image/webp", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
    return res.send(data);
  }

  // { revision, publish? }
  static async accept(req: Request, res: Response): Promise<Response> {
    const { revision, publish } = req.body ?? {};
    if (!Number.isInteger(revision)) throw new ValidationError("revision must be the number of the reviewed revision");
    if (publish !== undefined && typeof publish !== "boolean") throw new ValidationError("publish must be true or false");
    const cr = await ChangeRequestService.accept(req.user!._id, req.params.id, { revision, publish });
    return res.json(await view(await ChangeRequestService.get(String(cr._id))));
  }

  // { comment } (required: it tells the agent what to change)
  static async decline(req: Request, res: Response): Promise<Response> {
    const comment = req.body?.comment;
    if (typeof comment !== "string" || !comment.trim() || comment.length > 5000) {
      throw new ValidationError("A comment for the agent is required (at most 5000 characters)");
    }
    const cr = await ChangeRequestService.decline(req.user!._id, req.params.id, comment.trim());
    return res.json(await view(await ChangeRequestService.get(String(cr._id))));
  }

  // ---- agents

  static async listAgents(_req: Request, res: Response): Promise<Response> {
    return res.json(await AgentService.list());
  }

  // { name, redirectUris? } -> includes the client secret, shown once
  static async registerAgent(req: Request, res: Response): Promise<Response> {
    const { name, redirectUris } = req.body ?? {};
    if (redirectUris !== undefined && !Array.isArray(redirectUris)) throw new ValidationError("redirectUris must be a list");
    res.setHeader("Cache-Control", "no-store");
    return res.status(201).json(await AgentService.register(req.user!._id, { name: validateName(name), redirectUris }));
  }

  static async revokeAgentTokens(req: Request, res: Response): Promise<Response> {
    return res.json({ revoked: await AgentService.revokeTokens(req.user!._id, req.params.id) });
  }

  static async removeAgent(req: Request, res: Response): Promise<Response> {
    await AgentService.remove(req.user!._id, req.params.id);
    return res.status(204).send();
  }

  // ---- guidelines

  static async getGuidelines(_req: Request, res: Response): Promise<Response> {
    const [current, history] = await Promise.all([GuidelinesService.current(), GuidelinesService.history()]);
    return res.json({ ...current, history });
  }

  static async getGuidelinesVersion(req: Request, res: Response): Promise<Response> {
    const g = await GuidelinesService.getVersion(Number(req.params.version));
    if (!g) throw new AppError("NOT_FOUND");
    return res.json({ version: g.version, content: g.content, savedAt: g.createdAt });
  }

  static async saveGuidelines(req: Request, res: Response): Promise<Response> {
    const content = req.body?.content;
    if (typeof content !== "string" || content.length > MAX_CONTENT_LENGTH) {
      throw new ValidationError(`Content must be a string of at most ${MAX_CONTENT_LENGTH} characters`);
    }
    return res.json(await GuidelinesService.save(content, req.user!._id));
  }

  // ---- audit log: ?event=&agent=&before=<ISO date>&limit=
  static async auditLog(req: Request, res: Response): Promise<Response> {
    const before = typeof req.query.before === "string" ? new Date(req.query.before) : undefined;
    if (before && isNaN(before.getTime())) throw new ValidationError("before must be a date");
    const agent = typeof req.query.agent === "string" && isObjectId(req.query.agent) ? req.query.agent : undefined;
    const entries = await AuditService.list({
      agent, before,
      event: typeof req.query.event === "string" ? req.query.event.slice(0, 40) : undefined,
      limit: Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 100)),
    });
    const n = await names(entries.flatMap((e) => [e.agent, e.admin]));
    return res.json(entries.map((e) => ({
      ...e,
      agentName: e.agent ? n[String(e.agent)] ?? null : null,
      adminName: e.admin ? n[String(e.admin)] ?? null : null,
    })));
  }
}

export default AdminController;
