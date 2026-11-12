import bcrypt from "bcryptjs";
import { FilterQuery, SortOrder } from "mongoose";
import UserModel, { IUserDocument } from "../models/User";
import CommentModel from "../models/Comment";
import { IUser } from "../types/user";
import { UserRole } from "../types/userRole";
import { AppError } from "../config/errors";

import {
  isObjectId,
  sanitizeText,
  sanitizeMongoInput,
  escapeRegex
} from "../utils/validation";

class UserService {
  
  // name/email: case-insensitive "contains"; role: exact match
  private static buildFilter(filter?: { name?: string; email?: string; role?: UserRole }): FilterQuery<IUser> {
    const mongoFilter: FilterQuery<IUser> = {};
    if (!filter) return mongoFilter;
    if (filter.role) mongoFilter.role = filter.role;

    const allowedFields = ["name", "email"] as const;

    for (const key of allowedFields) {
      const value = filter[key];
      if (value == null) continue;
      
      const safeStr = sanitizeMongoInput(sanitizeText(value));
      if (safeStr) mongoFilter[key] = new RegExp(escapeRegex(safeStr), "i");
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
    filter?: { name?: string; email?: string; role?: UserRole };
    limit?: number;
    skip?: number;
  }): Promise<IUserDocument[]> {
    const mongoFilter = this.buildFilter(filter);
    // Agents have their own admin page (services/agents.service.ts)
    if (!mongoFilter.role) mongoFilter.role = { $ne: UserRole.AGENT };

    const sortOrder: { [key: string]: SortOrder } = {
      name: sorted ? "asc" : "desc"
    };

    return UserModel.find(mongoFilter).sort(sortOrder).skip(skip).limit(limit);
  }
  
  // null when there is no such user
  static async getUserById(id: string): Promise<IUserDocument | null> {
    if (!isObjectId(id)) return null;
    return UserModel.findById(id);
  }

  static async getUserByName(name: string): Promise<IUserDocument | null> {
    const safeName = sanitizeMongoInput(sanitizeText(name));
    return UserModel.findOne({ name: new RegExp(`^${escapeRegex(safeName)}$`, "i") });
  }

  // Profile fields only: the role and the password hash are never changed
  // here (passwords go through updateUserPassword). Input is already
  // validated by the controller.
  static async patchUserById(id: string, fields: { name?: string; email?: string }): Promise<IUserDocument> {
    const update: { name?: string; email?: string } = {};
    if (fields.name !== undefined) update.name = fields.name;
    if (fields.email !== undefined) update.email = fields.email;
    await UserService.notAgent(id);
    try {
      const user = await UserModel.findOneAndUpdate({ _id: id, role: { $ne: UserRole.AGENT } }, update, { new: true });
      if (!user) throw new AppError("USER_NOT_FOUND");
      return user;
    } catch (err) {
      throw UserService.duplicateToConflict(err);
    }
  }

  static async updateUserPassword(id: string, currentPassword: unknown, newPassword: string): Promise<void> {
    const user = await UserService.notAgent(id);

    const isMatch = typeof currentPassword === "string" && await bcrypt.compare(currentPassword, user.hash);
    if (!isMatch) throw new AppError("INCORRECT_PASSWORD");

    user.hash = await UserService.hashPassword(newPassword);
    await user.save();
  }

  // The user, if it exists and isn't an agent: agents are changed and removed
  // only through AgentService, which keeps their authorship.
  private static async notAgent(id: string): Promise<IUserDocument> {
    const user = isObjectId(id) ? await UserModel.findById(id) : null;
    if (!user) throw new AppError("USER_NOT_FOUND");
    if (user.role === UserRole.AGENT) throw new AppError("AGENT_MANAGED");
    return user;
  }

  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  // Unique index violation on name/email -> 409 "User already exists"
  static duplicateToConflict(err: unknown): unknown {
    return (err as { code?: number })?.code === 11000 ? new AppError("USER_ALREADY_EXISTS") : err;
  }

  static async deleteUserById(id: string): Promise<void> {
    await UserService.notAgent(id);
    // Right to erasure: the account and everything the user wrote go
    // together (comments are deleted, not just hidden or anonymised).
    await CommentModel.deleteMany({ author: id });
    await UserModel.deleteOne({ _id: id });
  }
}

export default UserService;