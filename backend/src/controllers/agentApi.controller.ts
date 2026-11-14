import { Request, Response } from "express";
import AgentPostService from "../services/agentPosts.service";
import ChangeRequestService from "../services/changeRequests.service";
import GuidelinesService from "../services/guidelines.service";
import AgentImageService from "../services/agentImages.service";
import { IChangeRequestDocument, CHANGE_STATUSES, ChangeStatus } from "../models/ChangeRequest";
import UserModel from "../models/User";
import { AppError, ValidationError } from "../config/errors";
import { isLang, LANGS, DEFAULT_LANG } from "../config/langs";
import { validateKind, validateDescription, validateProposedFields, validateTranslations } from "../utils/changeRequest";
import { normalizeTags } from "../utils/postMeta";

// The agent API (routes/agentApi.routes.ts): what the MCP server's tools
// call. req.agent is set by authenticateAgent. Comments are not reachable
// from here in any form.

const agentId = (req: Request) => req.agent!._id;

function optionalLang(v: unknown) {
  if (v === undefined) return undefined;
  if (!isLang(v)) throw new ValidationError(`lang must be one of ${LANGS.join(", ")}`);
  return v;
}

// The agent's view of a change request: no reviewer ids, only names
async function view(cr: IChangeRequestDocument) {
  const reviewerIds = cr.revisions.map((r) => r.review?.by).filter(Boolean);
  const reviewers = await UserModel.find({ _id: { $in: reviewerIds } }).select("name").lean();
  const nameOf = (id: unknown) => reviewers.find((u) => String(u._id) === String(id))?.name ?? null;
  return {
    id: String(cr._id),
    kind: cr.kind,
    status: cr.status,
    postId: cr.post ? String(cr.post) : null,
    lang: cr.lang,
    resultPostId: cr.resultPost ? String(cr.resultPost) : null,
    resultTranslationIds: (cr.resultTranslations ?? []).map(String),
    createdAt: cr.createdAt,
    updatedAt: cr.updatedAt,
    revisions: cr.revisions.map((r, i) => ({
      number: i + 1,
      fields: r.fields,
      translations: r.translations ?? [],
      description: r.description,
      baseHash: r.baseHash,
      createdAt: r.createdAt,
      review: r.review?.decision
        ? { decision: r.review.decision, by: nameOf(r.review.by), at: r.review.at, comment: r.review.comment }
        : null,
    })),
  };
}

class AgentApiController {

  static async listPosts(req: Request, res: Response): Promise<Response> {
    const status = req.query.status as string | undefined;
    if (status !== undefined && !["published", "draft", "all"].includes(status)) {
      throw new ValidationError("status must be published, draft or all");
    }
    const tag = typeof req.query.tag === "string" && req.query.tag ? normalizeTags([req.query.tag])[0] : undefined;
    const posts = await AgentPostService.list({
      status: status as "published" | "draft" | "all" | undefined,
      tag,
      series: typeof req.query.series === "string" ? req.query.series.slice(0, 80) : undefined,
      lang: optionalLang(req.query.lang),
      limit: Math.max(1, parseInt(req.query.limit as string) || 50),
      skip: Math.max(0, parseInt(req.query.skip as string) || 0),
    });
    return res.json(posts);
  }

  static async getPost(req: Request, res: Response): Promise<Response> {
    const post = await AgentPostService.get(req.params.id);
    if (!post) throw new AppError("POST_NOT_FOUND");
    return res.json(post);
  }

  static async getGuidelines(_req: Request, res: Response): Promise<Response> {
    return res.json(await GuidelinesService.current());
  }

  static async listChangeRequests(req: Request, res: Response): Promise<Response> {
    const status = req.query.status as string | undefined;
    if (status !== undefined && !(CHANGE_STATUSES as readonly string[]).includes(status)) {
      throw new ValidationError(`status must be one of ${CHANGE_STATUSES.join(", ")}`);
    }
    const list = await ChangeRequestService.listOwn(agentId(req), { status: status as ChangeStatus | undefined });
    return res.json(await Promise.all(list.map(view)));
  }

  // { data (base64) | url, filename?, alt? }: an image for a proposal
  static async uploadImage(req: Request, res: Response): Promise<Response> {
    const b = req.body ?? {};
    for (const k of ["data", "url", "filename", "alt"]) {
      if (b[k] !== undefined && typeof b[k] !== "string") throw new ValidationError(`${k} must be a string`);
    }
    const img = await AgentImageService.upload(agentId(req), { data: b.data, url: b.url, filename: b.filename, alt: b.alt });
    res.locals.auditDetail = img.filename;
    return res.status(201).json(img);
  }

  static async listImages(req: Request, res: Response): Promise<Response> {
    return res.json(await AgentImageService.listOwn(agentId(req)));
  }

  static async getChangeRequest(req: Request, res: Response): Promise<Response> {
    return res.json(await view(await ChangeRequestService.getOwn(agentId(req), req.params.id)));
  }

  // { kind, postId?, lang?, fields, translations?, description }
  // translations: only for kind "new", proposed together with the post
  static async createChangeRequest(req: Request, res: Response): Promise<Response> {
    const body = req.body ?? {};
    const kind = validateKind(body.kind);
    res.locals.auditDetail = kind;
    if (kind !== "new" && typeof body.postId !== "string") throw new ValidationError("postId is required");
    if (kind !== "new" && body.translations !== undefined) throw new ValidationError("translations can only be proposed with a new post");
    const lang = optionalLang(body.lang);
    const cr = await ChangeRequestService.create(agentId(req), {
      kind,
      postId: kind === "new" ? undefined : body.postId,
      lang,
      fields: validateProposedFields(kind, body.fields),
      translations: kind === "new" ? validateTranslations(body.translations, lang ?? DEFAULT_LANG) : [],
      description: validateDescription(body.description),
    });
    res.locals.changeRequestId = String(cr._id);
    return res.status(201).json(await view(cr));
  }

  // { fields, translations?, description }: a new revision. For a new
  // post, translations omitted = keep the previous revision's; [] = none
  static async reviseChangeRequest(req: Request, res: Response): Promise<Response> {
    const existing = await ChangeRequestService.getOwn(agentId(req), req.params.id);
    const body = req.body ?? {};
    if (existing.kind !== "new" && (req.body ?? {}).translations !== undefined) throw new ValidationError("translations can only be proposed with a new post");
    const cr = await ChangeRequestService.revise(agentId(req), req.params.id, {
      fields: validateProposedFields(existing.kind, body.fields),
      translations: existing.kind === "new" && body.translations !== undefined
        ? validateTranslations(body.translations, existing.lang ?? DEFAULT_LANG)
        : undefined,
      description: validateDescription(body.description),
    });
    return res.json(await view(cr));
  }
}

export default AgentApiController;
