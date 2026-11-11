import { Types } from "mongoose";
import { UserRole } from "./userRole";

export interface IUser {
  name: string;
  email: string;
  hash: string;
  role: UserRole;
  termsAcceptedAt?: Date;   // public sign-up: when the terms of use were accepted
  termsVersion?: string;    // which version (date) of the terms
  createdAt: Date;
  updatedAt: Date;
}