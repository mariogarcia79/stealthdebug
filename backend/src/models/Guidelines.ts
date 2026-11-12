import { Schema, model, Document, Types } from "mongoose";

// Writing guidelines for agents (style://guidelines). Every save is a new
// version; the highest is current. Old versions are kept as history.
export interface IGuidelines {
  version: number;
  content: string;
  savedBy: Types.ObjectId;
  createdAt: Date;
}
export interface IGuidelinesDocument extends IGuidelines, Document {}

const schema = new Schema<IGuidelinesDocument>(
  {
    version: { type: Number, required: true, unique: true },
    content: { type: String, default: "" },
    savedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export default model<IGuidelinesDocument>("Guidelines", schema);
