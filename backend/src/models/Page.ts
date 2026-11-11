import { Schema, model, Document } from 'mongoose';

// Standalone pages edited from the admin editor (currently only "about").
// A page that was never saved has no document: it is shown empty.
export interface IPage {
  slug:      string;
  content:   string;
  createdAt?: Date;
  updatedAt?: Date;
}
export interface IPageDocument extends IPage, Document {}

const pageSchema = new Schema<IPageDocument>(
  {
    slug:    { type: String, required: true, unique: true },
    content: { type: String, default: "" },
  },
  { timestamps: true }
);

const Page = model<IPageDocument>('Page', pageSchema);

export default Page;
