import { Schema, model, Document, Types } from "mongoose";

// An image an agent uploaded for a proposal. It is not public: it lives
// here (already re-encoded to WebP, so without metadata) until the admin
// accepts a change request that uses it. Then it becomes a library image
// under the same file name, so /api/uploads/<filename> in the proposal
// works unchanged. Unused ones are removed after a while
// (services/agentImages.service.ts).
export interface IPendingImage {
  agent: Types.ObjectId;
  filename: string;       // future file name in the uploads directory
  originalName: string;
  alt: string;
  width: number;
  height: number;
  size: number;
  data: Buffer;           // the WebP file
  createdAt: Date;
  updatedAt: Date;
}

export interface IPendingImageDocument extends IPendingImage, Document {}

const pendingImageSchema = new Schema<IPendingImageDocument>(
  {
    agent:        { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    filename:     { type: String, required: true, unique: true },
    originalName: { type: String, default: "" },
    alt:          { type: String, default: "" },
    width:        { type: Number, required: true },
    height:       { type: Number, required: true },
    size:         { type: Number, required: true },
    data:         { type: Buffer, required: true },
  },
  { timestamps: true }
);

export default model<IPendingImageDocument>("PendingImage", pendingImageSchema);
