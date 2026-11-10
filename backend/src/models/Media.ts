import { Schema, model, Document, Model, Types } from "mongoose";

// One document per image file in the uploads volume.
//
// The original file keeps its historical URL (/api/uploads/<filename>) so
// existing posts keep working; resized copies live in uploads/variants/.
export interface IMediaVariant {
  width: number;
  height: number;
  filename: string;   // relative to the variants directory
  size: number;       // bytes
}

export interface IMedia {
  filename: string;       // file name in the uploads directory (unique)
  originalName: string;   // name of the file the user uploaded
  alt: string;            // default alt text suggested when inserting
  width: number;
  height: number;
  size: number;           // bytes of the original
  variants: IMediaVariant[];
  uploadedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IMediaDocument extends IMedia, Document {}
export interface IMediaModel extends Model<IMediaDocument> {}

const variantSchema = new Schema<IMediaVariant>(
  {
    width:    { type: Number, required: true },
    height:   { type: Number, required: true },
    filename: { type: String, required: true },
    size:     { type: Number, required: true },
  },
  { _id: false }
);

const mediaSchema = new Schema<IMediaDocument>(
  {
    filename:     { type: String, required: true, unique: true },
    originalName: { type: String, required: true },
    alt:          { type: String, default: "" },
    width:        { type: Number, required: true },
    height:       { type: Number, required: true },
    size:         { type: Number, required: true },
    variants:     { type: [variantSchema], default: [] },
    uploadedBy:   { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

const Media = model<IMediaDocument, IMediaModel>("Media", mediaSchema, "media");

export default Media;
