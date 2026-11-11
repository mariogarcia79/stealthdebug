import { Schema, model, Document, Model } from 'mongoose';
import { IUser } from '../types/user';
import { UserRole } from "../types/userRole";

export interface IUserDocument extends IUser, Document {}
export interface IUserModel extends Model<IUserDocument> {}

const userSchema = new Schema<IUserDocument>(
  {
    name:   { type: String,   required: true, unique: true },
    email:  { type: String,   required: true, unique: true },
    hash:   { type: String,   required: true },
    role: {
      type: String,
      enum: Object.values(UserRole),
      default: UserRole.USER,
    },
    termsAcceptedAt: { type: Date },
    termsVersion:    { type: String },
  },
  {
    timestamps: true,
    // The password hash (and terms bookkeeping) never leave the server in an
    // API response; code that needs the hash reads it from the document.
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.hash;
        delete ret.__v;
        return ret;
      },
    },
  }
);

const User = model<IUserDocument, IUserModel>('User', userSchema);

export default User;