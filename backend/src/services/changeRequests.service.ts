import { Types } from "mongoose";
import ChangeRequestModel, {
  IChangeRequest, IChangeRequestDocument, ChangeKind, ChangeStatus, ProposedFields, IReview,
} from "../models/ChangeRequest";
import PostModel from "../models/Post";
import UserModel from "../models/User";
import CommentModel from "../models/Comment";
import { AppError } from "../config/errors";
import { env } from "../config/env";
import { DEFAULT_LANG, Lang } from "../config/langs";
import { contentHash } from "../utils/contentHash";
import { isObjectId } from "../utils/validation";
import AgentPostService from "./agentPosts.service";
import AuditService from "./audit.service";

// Change requests: agents propose (create, revise, read their own), admins
// review (accept, decline). On accept this service, not the agent, writes
// to the site. Fields arrive already validated and sanitised
// (utils/changeRequest.ts).

// Still waiting for the agent or the reviewer: count towards the limit
const ACTIVE: ChangeStatus[] = ["open", "outdated", "declined"];
const REVISABLE: ChangeStatus[] = ["open", "outdated", "declined"];

export interface NewChangeRequest {
  kind: ChangeKind;
  postId?: string;
  lang?: Lang;
  fields: ProposedFields;
  description: string;
}

type CR = IChangeRequestDocument;

const current = (cr: IChangeRequest) => cr.revisions[cr.revisions.length - 1];
const date = (d: Date) => d.toISOString().slice(0, 10);

// System comment posted on an edited post, in the post's language
function editedComment(lang: string, agent: string, admin: string, on: Date): string {
  return lang === "es"
    ? `${agent} editó este artículo bajo la supervisión de ${admin} el ${date(on)}.`
    : `${agent} edited this post under the supervision of ${admin} on ${date(on)}.`;
}

class ChangeRequestService {

  // ---------------------------------------------------------------- agents

  static async create(agentId: string, req: NewChangeRequest): Promise<CR> {
    const active = await ChangeRequestModel.countDocuments({ agent: agentId, status: { $in: ACTIVE } });
    if (active >= env.maxOpenChangeRequests) {
      throw new AppError("TOO_MANY_CHANGE_REQUESTS", `At most ${env.maxOpenChangeRequests} open change requests`);
    }

    let post: Types.ObjectId | null = null;
    let baseHash: string | null = null;
    let lang: string | null = null;

    if (req.kind === "new") {
      lang = req.lang ?? DEFAULT_LANG;
    } else {
      const target = req.postId ? await AgentPostService.getVisibleDocument(req.postId) : null;
      if (!target) throw new AppError("POST_NOT_FOUND");
      post = target._id as Types.ObjectId;
      baseHash = contentHash(target);
      if (req.kind === "translation") {
        if (target.translationOf) throw new AppError("BAD_REQUEST", "Translate the original post, not a translation");
        if (!req.lang || req.lang === target.lang) throw new AppError("BAD_REQUEST", "lang must be a different language than the post's");
        if (await PostModel.exists({ translationOf: target._id, lang: req.lang })) throw new AppError("TRANSLATION_EXISTS");
        lang = req.lang;
      }
    }

    return ChangeRequestModel.create({
      kind: req.kind,
      agent: agentId,
      post,
      lang,
      revisions: [{ fields: req.fields, description: req.description, baseHash, review: null }],
      status: "open",
    });
  }

  // New revision of one of the agent's requests (after a decline, when
  // outdated, or to improve an open one). It's based on the current post.
  static async revise(agentId: string, id: string, rev: { fields: ProposedFields; description: string }): Promise<CR> {
    const cr = await ChangeRequestService.getOwn(agentId, id);
    if (!REVISABLE.includes(cr.status)) throw new AppError("CHANGE_REQUEST_NOT_OPEN");

    let baseHash: string | null = null;
    if (cr.post) {
      const target = await AgentPostService.getVisibleDocument(String(cr.post));
      if (!target) {
        await ChangeRequestService.setStatus(cr, "closed");
        throw new AppError("POST_NOT_FOUND");
      }
      baseHash = contentHash(target);
    }

    const updated = await ChangeRequestModel.findOneAndUpdate(
      { _id: cr._id, agent: agentId, status: { $in: REVISABLE } },
      {
        $push: { revisions: { fields: rev.fields, description: rev.description, baseHash, review: null } },
        $set: { status: "open" },
      },
      { new: true }
    );
    if (!updated) throw new AppError("CHANGE_REQUEST_NOT_OPEN");
    return updated;
  }

  // One of this agent's requests. Another agent's is "not found", like a
  // missing one, so ids can't be probed.
  static async getOwn(agentId: string, id: string): Promise<CR> {
    const cr = isObjectId(id) ? await ChangeRequestModel.findOne({ _id: id, agent: agentId }) : null;
    if (!cr) throw new AppError("CHANGE_REQUEST_NOT_FOUND");
    return ChangeRequestService.refresh(cr);
  }

  static async listOwn(agentId: string, opts: { status?: ChangeStatus; limit?: number } = {}): Promise<CR[]> {
    const q: Record<string, unknown> = { agent: agentId };
    if (opts.status) q.status = opts.status;
    const list = await ChangeRequestModel.find(q).sort({ updatedAt: -1 }).limit(Math.min(opts.limit ?? 50, 100));
    return Promise.all(list.map((cr) => ChangeRequestService.refresh(cr)));
  }

  // ---------------------------------------------------------------- admins

  static async list(opts: { kind?: ChangeKind; status?: ChangeStatus; agent?: string; limit?: number } = {}): Promise<CR[]> {
    const q: Record<string, unknown> = {};
    if (opts.kind) q.kind = opts.kind;
    if (opts.status) q.status = opts.status;
    if (opts.agent && isObjectId(opts.agent)) q.agent = opts.agent;
    const list = await ChangeRequestModel.find(q).sort({ updatedAt: -1 }).limit(Math.min(opts.limit ?? 100, 200))
      .populate("agent", "name");
    return Promise.all(list.map((cr) => ChangeRequestService.refresh(cr)));
  }

  static async get(id: string): Promise<CR> {
    const cr = isObjectId(id) ? await ChangeRequestModel.findById(id).populate("agent", "name") : null;
    if (!cr) throw new AppError("CHANGE_REQUEST_NOT_FOUND");
    return ChangeRequestService.refresh(cr);
  }

  // revision: the number (1-based) of the revision the admin reviewed; if the
  // agent submitted a newer one meanwhile, nothing is applied.
  // publish: for new posts and translations, publish now or keep as draft.
  static async accept(adminId: string, id: string, opts: { revision: number; publish?: boolean }): Promise<CR> {
    const cr = await ChangeRequestService.get(id);
    if (cr.status === "outdated") throw new AppError("CHANGE_REQUEST_OUTDATED");
    if (cr.status !== "open") throw new AppError("CHANGE_REQUEST_NOT_OPEN");
    if (opts.revision !== cr.revisions.length) throw new AppError("CHANGE_REQUEST_STALE_REVIEW");

    const admin = await UserModel.findById(adminId).select("name").lean();
    const agentId = String((cr.agent as unknown as { _id?: Types.ObjectId })._id ?? cr.agent);
    const agent = await UserModel.findById(agentId).select("name deletedAt").lean();
    if (!admin || !agent || agent.deletedAt) throw new AppError("CHANGE_REQUEST_NOT_OPEN");

    const at = new Date();
    const review: IReview = { by: new Types.ObjectId(adminId), at, decision: "accepted", comment: "" };
    const n = cr.revisions.length;

    // Claim the request first (open -> accepted, same revision count), so two
    // accepts, or an accept racing a new revision, can't both apply.
    const claimed = await ChangeRequestModel.findOneAndUpdate(
      { _id: cr._id, status: "open", revisions: { $size: n } },
      { $set: { status: "accepted", review, [`revisions.${n - 1}.review`]: review } },
      { new: true }
    );
    if (!claimed) throw new AppError("CHANGE_REQUEST_NOT_OPEN");

    try {
      const resultPost = await ChangeRequestService.apply(claimed, agentId, agent.name, admin.name, at, !!opts.publish);
      if (resultPost) claimed.resultPost = resultPost;
      await claimed.save();
    } catch (err) {
      // Nothing was written (apply checks before writing): reopen
      await ChangeRequestModel.updateOne(
        { _id: cr._id },
        { $set: { status: "open", review: cr.review, [`revisions.${n - 1}.review`]: null } }
      );
      throw err;
    }

    await AuditService.log({
      event: "review", admin: adminId, agent: agentId, changeRequest: cr._id as Types.ObjectId,
      post: claimed.resultPost ?? claimed.post, detail: "accepted",
    });
    return claimed;
  }

  static async decline(adminId: string, id: string, comment: string): Promise<CR> {
    if (!comment.trim()) throw new AppError("INVALID_INPUT", "A comment for the agent is required");
    const cr = await ChangeRequestService.get(id);
    if (cr.status !== "open" && cr.status !== "outdated") throw new AppError("CHANGE_REQUEST_NOT_OPEN");

    const n = cr.revisions.length;
    const review: IReview = { by: new Types.ObjectId(adminId), at: new Date(), decision: "declined", comment };
    const declined = await ChangeRequestModel.findOneAndUpdate(
      { _id: cr._id, status: { $in: ["open", "outdated"] }, revisions: { $size: n } },
      { $set: { status: "declined", review, [`revisions.${n - 1}.review`]: review } },
      { new: true }
    );
    if (!declined) throw new AppError("CHANGE_REQUEST_NOT_OPEN");

    await AuditService.log({
      event: "review", admin: adminId, agent: String(declined.agent), changeRequest: declined._id as Types.ObjectId,
      post: declined.post, detail: `declined: ${comment}`,
    });
    return declined;
  }

  // Requests that can't be applied any more (post deleted, agent removed)
  static async closeActive(filter: { post?: Types.ObjectId | string; agent?: Types.ObjectId | string }): Promise<void> {
    await ChangeRequestModel.updateMany({ ...filter, status: { $in: ACTIVE } }, { $set: { status: "closed" } });
  }

  // ---------------------------------------------------------------- internals

  // open <-> outdated as the target changes; closed when the target is gone
  // or hidden from agents. Final states never change.
  private static async refresh(cr: CR): Promise<CR> {
    if (!cr.post || (cr.status !== "open" && cr.status !== "outdated")) return cr;
    const target = await AgentPostService.getVisibleDocument(String(cr.post));
    if (!target) return ChangeRequestService.setStatus(cr, "closed");
    const fresh = contentHash(target) === current(cr).baseHash;
    if (fresh && cr.status === "outdated") return ChangeRequestService.setStatus(cr, "open");
    if (!fresh && cr.status === "open") return ChangeRequestService.setStatus(cr, "outdated");
    return cr;
  }

  private static async setStatus(cr: CR, status: ChangeStatus): Promise<CR> {
    await ChangeRequestModel.updateOne({ _id: cr._id, status: cr.status }, { $set: { status } });
    cr.status = status;
    return cr;
  }

  // Performs the write. Returns the post created (new, translation).
  private static async apply(
    cr: CR, agentId: string, agentName: string, adminName: string, at: Date, publish: boolean
  ): Promise<Types.ObjectId | null> {
    const rev = current(cr);
    const f = rev.fields;

    if (cr.kind === "edit") {
      const target = await PostModel.findById(cr.post);
      if (!target || target.mcpVisible === false) throw new AppError("POST_NOT_FOUND");
      if (contentHash(target) !== rev.baseHash) throw new AppError("CHANGE_REQUEST_OUTDATED");
      for (const key of ["title", "summary", "content", "tags", "series"] as const) {
        if (f[key] !== undefined) (target as unknown as Record<string, unknown>)[key] = f[key];
      }
      await target.save();
      await CommentModel.create({
        post: target._id,
        author: agentId,
        content: editedComment(target.lang, agentName, adminName, at),
        published: true,
      });
      return null;
    }

    if (cr.kind === "new") {
      const post = await PostModel.create({
        author: agentId,
        title: f.title, summary: f.summary, content: f.content,
        tags: f.tags ?? [], series: f.series ?? "",
        lang: cr.lang ?? DEFAULT_LANG,
        published: publish,
      });
      return post._id as Types.ObjectId;
    }

    // translation: tags and series stay those of the original
    const original = await PostModel.findById(cr.post);
    if (!original || original.mcpVisible === false) throw new AppError("POST_NOT_FOUND");
    if (contentHash(original) !== rev.baseHash) throw new AppError("CHANGE_REQUEST_OUTDATED");
    try {
      const post = await PostModel.create({
        author: agentId,
        title: f.title, summary: f.summary, content: f.content,
        tags: original.tags, series: original.series,
        lang: cr.lang,
        translationOf: original._id,
        published: publish,
      });
      return post._id as Types.ObjectId;
    } catch (err) {
      if ((err as { code?: number }).code === 11000) throw new AppError("TRANSLATION_EXISTS");
      throw err;
    }
  }
}

export default ChangeRequestService;
