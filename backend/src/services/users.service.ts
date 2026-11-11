import bcrypt from "bcryptjs";
import { FilterQuery, SortOrder } from "mongoose";
import UserModel, { IUserDocument } from "../models/User";
import CommentModel from "../models/Comment";
import { IUser } from "../types/user";

import {
  isObjectId,
  sanitizeText,
  sanitizeMongoInput,
  escapeRegex,
  isValidEmail
} from "../utils/validation";

class UserService {
  
  private static buildFilter(filter?: Partial<IUser>): FilterQuery<IUser> {
    const mongoFilter: FilterQuery<IUser> = {};
    if (!filter) return mongoFilter;
    
    const allowedFields: (keyof IUser)[] = ["name", "email", "role"];
    
    for (const key of allowedFields) {
      const value = filter[key];
      if (value == null) continue;
      
      if (typeof value === "boolean") {
        mongoFilter[key] = value;
        continue;
      }
      
      if (typeof value === "string") {
        const safeStr = sanitizeMongoInput(sanitizeText(value));
        
        if (key === "email" && !isValidEmail(safeStr)) continue;
        
        mongoFilter[key] = new RegExp(escapeRegex(safeStr), "i");
        continue;
      }
      
      if (value instanceof RegExp) {
        mongoFilter[key] = value;
      }
    }
    
    return mongoFilter;
  }
  
  static async getAllUsers({
    sorted = true,
    filter,
    limit = 50,
    skip = 0
  }: {
    sorted?: boolean;
    filter?: Partial<IUser>;
    limit?: number;
    skip?: number;
  }): Promise<IUserDocument[]> {
    const mongoFilter = this.buildFilter(filter);

    const sortOrder: { [key: string]: SortOrder } = {
      name: sorted ? "asc" : "desc"
    };

    return UserModel.find(mongoFilter).sort(sortOrder).skip(skip).limit(limit);
  }
  
  static async getUserById(id: string): Promise<IUserDocument | null> {
    if (!isObjectId(id)) return null;
    
    try {
      return await UserModel.findById(id);
    } catch (err) {
      console.error("Error: getUserById:", err);
      return null;
    }
  }
  
  static async getUserByName(name: string): Promise<IUserDocument | null> {
    const safeName = sanitizeMongoInput(sanitizeText(name));
    try {
      return await UserModel.findOne({ name: new RegExp(`^${escapeRegex(safeName)}$`, "i") });
    } catch (err) {
      console.error("Error: getUserByName:", err);
      return null;
    }
  }
  
  static async patchUserById(id: string, partial: Partial<IUser>): Promise<IUserDocument | null> {
    if (!isObjectId(id)) return null;

    // "hash" is intentionally excluded — password changes go through updateUserPassword only
    const allowedFields: (keyof IUser)[] = ["name", "email"];
    const updateData: Partial<Record<keyof IUser, any>> = {};
    
    for (const key of allowedFields) {
      const value = partial[key];
      if (value === undefined) continue;
      
      if (typeof value === "string") {
        if (key === "email" && !isValidEmail(value)) continue;
        updateData[key] = sanitizeMongoInput(sanitizeText(value));
      } else {
        updateData[key] = value;
      }
    }
    
    try {
      return await UserModel.findByIdAndUpdate(id, updateData, { new: true });
    } catch (err) {
      console.error("Error: patchUserById:", err);
      return null;
    }
  }
  
  static async updateUserPassword(
    id: string,
    currentPassword: string,
    newPassword: string
  ): Promise<boolean> {
    if (!isObjectId(id)) return false;
    
    try {
      const user = await UserModel.findById(id);
      if (!user) return false;
      
      const isMatch = await bcrypt.compare(currentPassword, user.hash);
      if (!isMatch) return false;
      
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(newPassword, salt);
      
      user.hash = hashedPassword;
      await user.save();
      
      return true;
    } catch (err) {
      console.error("Error: updateUserPassword:", err);
      return false;
    }
  }
  
  static async deleteUserById(id: string): Promise<boolean> {
    if (!isObjectId(id)) return false;
    
    try {
      // Right to erasure: the account and everything the user wrote go
      // together (comments are deleted, not just hidden or anonymised).
      if (!(await UserModel.exists({ _id: id }))) return false;
      await CommentModel.deleteMany({ author: id });
      const result = await UserModel.deleteOne({ _id: id });
      return result.deletedCount === 1;
    } catch (err) {
      console.error("Error: deleteUserById:", err);
      return false;
    }
  }
}

export default UserService;