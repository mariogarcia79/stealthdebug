import { Schema, model, Document, Model } from 'mongoose';
import { IPost } from '../types/post';
import { LANGS, DEFAULT_LANG } from '../config/langs';

export interface IPostDocument extends IPost, Document {}
export interface IPostModel extends Model<IPostDocument> {}

const postSchema = new Schema<IPostDocument>(
  {
    author:     { type: Schema.Types.ObjectId, ref: "User", required: true },
    title:      { type: String,   required: true },
    summary:    { type: String,   required: true },
    content:    { type: String,   required: true },
    published:  { type: Boolean,  required: true },
    // Added later: older documents lack them and get these defaults on read.
    tags:       { type: [String], default: [] },
    series:     { type: String,   default: "" },
    // Language of the post. A translation is a post of its own, linked to the
    // original; it isn't listed separately (the original links to it).
    lang:          { type: String, enum: LANGS, default: DEFAULT_LANG },
    translationOf: { type: Schema.Types.ObjectId, ref: "Post", default: null },
    // Unchecked in the editor: agents can't see the post (nor its
    // translations) and no change request can target it.
    mcpVisible:    { type: Boolean, default: true },
    // Posts written or translated by an agent: the admin who accepted them
    // (named in the banner)
    supervisor:    { type: Schema.Types.ObjectId, ref: "User", default: null }
  },
  { 
    timestamps: true
  }
);

// One translation per language
postSchema.index(
  { translationOf: 1, lang: 1 },
  { unique: true, partialFilterExpression: { translationOf: { $type: "objectId" } } }
);

const Post = model<IPostDocument, IPostModel>('Post', postSchema);

export default Post;