import { Schema, model, Document, Types } from "mongoose";

// A change proposed by an agent, reviewed by an admin (like a pull request).
// Agents never write posts: on accept, the application does
// (services/changeRequests.service.ts).
export const CHANGE_KINDS = ["edit", "new", "translation"] as const;
export type ChangeKind = (typeof CHANGE_KINDS)[number];

// open      waiting for review
// outdated  the target post changed since the revision was based on it:
//           can't be accepted until the agent submits a new revision
// declined  the reviewer asked for changes (comment); the agent may revise
// accepted  applied to the site (final)
// closed    withdrawn: target post deleted or hidden, or agent removed (final)
export const CHANGE_STATUSES = ["open", "outdated", "declined", "accepted", "closed"] as const;
export type ChangeStatus = (typeof CHANGE_STATUSES)[number];

export interface ProposedFields {
  title?: string;
  summary?: string;
  content?: string;
  tags?: string[];
  series?: string;
}

// A translation proposed together with a new post (kind "new"): created
// with it, in the same accept. Tags and series come from the new post.
export interface ProposedTranslation {
  lang: string;
  title: string;
  summary: string;
  content: string;
}

export interface IReview {
  by: Types.ObjectId | null;
  at: Date | null;
  decision: "accepted" | "declined" | null;
  comment: string;
}

export interface IRevision {
  fields: ProposedFields;
  translations: ProposedTranslation[];  // new: translations bundled with the post
  description: string;     // the agent's explanation, like a PR description
  baseHash: string | null; // contentHash of the target when proposed (edit, translation)
  createdAt: Date;
  review: IReview | null;  // the decision on this revision, if any (history)
}

export interface IChangeRequest {
  kind: ChangeKind;
  agent: Types.ObjectId;
  post: Types.ObjectId | null;   // target (edit: the post; translation: the original)
  lang: string | null;           // new / translation: language of the result
  revisions: IRevision[];        // oldest first; the last one is current
  status: ChangeStatus;
  review: IReview;               // latest decision
  resultPost: Types.ObjectId | null;  // accepted new / translation: the post created
  resultTranslations: Types.ObjectId[]; // accepted new: the bundled translations created
  createdAt: Date;
  updatedAt: Date;
}

export interface IChangeRequestDocument extends IChangeRequest, Document {}

const fieldsSchema = new Schema<ProposedFields>(
  {
    title:   { type: String },
    summary: { type: String },
    content: { type: String },
    // undefined = not proposed; [] = remove all tags
    tags:    { type: [String], default: undefined },
    series:  { type: String },
  },
  { _id: false }
);

const translationSchema = new Schema<ProposedTranslation>(
  {
    lang:    { type: String, required: true },
    title:   { type: String, required: true },
    summary: { type: String, required: true },
    content: { type: String, required: true },
  },
  { _id: false }
);

const reviewSchema = new Schema<IReview>(
  {
    by:       { type: Schema.Types.ObjectId, ref: "User", default: null },
    at:       { type: Date, default: null },
    decision: { type: String, enum: ["accepted", "declined", null], default: null },
    comment:  { type: String, default: "" },
  },
  { _id: false }
);

const revisionSchema = new Schema<IRevision>(
  {
    fields:      { type: fieldsSchema, required: true },
    translations: { type: [translationSchema], default: [] },
    description: { type: String, required: true },
    baseHash:    { type: String, default: null },
    createdAt:   { type: Date, default: () => new Date() },
    review:      { type: reviewSchema, default: null },
  },
  { _id: false }
);

const changeRequestSchema = new Schema<IChangeRequestDocument>(
  {
    kind:   { type: String, enum: CHANGE_KINDS, required: true },
    agent:  { type: Schema.Types.ObjectId, ref: "User", required: true },
    post:   { type: Schema.Types.ObjectId, ref: "Post", default: null },
    lang:   { type: String, default: null },
    revisions: { type: [revisionSchema], required: true },
    status: { type: String, enum: CHANGE_STATUSES, default: "open" },
    review: { type: reviewSchema, default: () => ({}) },
    resultPost: { type: Schema.Types.ObjectId, ref: "Post", default: null },
    resultTranslations: { type: [{ type: Schema.Types.ObjectId, ref: "Post" }], default: [] },
  },
  { timestamps: true }
);

changeRequestSchema.index({ agent: 1, status: 1 });
changeRequestSchema.index({ post: 1, status: 1 });

export default model<IChangeRequestDocument>("ChangeRequest", changeRequestSchema);
