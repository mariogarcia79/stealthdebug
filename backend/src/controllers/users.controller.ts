import { Request, Response } from "express";
import UserService from "../services/users.service";
import {
  escapeRegex,
  isObjectId,
  validateName,
  validateEmail,
  validatePassword
} from '../utils/validation';
import { UserRole } from "../types/userRole";
import { IUser } from "../types/user";
import { FilterQuery } from "mongoose";
import { sendError } from "../config/errors";

class UserController {
  
  static async getAllUsers(req: Request, res: Response): Promise<Response> {
    const queryName = req.query.name as string | undefined;
    const queryRole = req.query.role as string | undefined;

    const page  = Math.max(1, parseInt(req.query.page  as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const skip  = (page - 1) * limit;

    const filter: FilterQuery<IUser> = { };

    try {
      if (queryName) {
        const cleanName = validateName(queryName);
        filter.name = {
          $regex: new RegExp(escapeRegex(cleanName), 'i')
        };
      }

      if (queryRole && ![UserRole.ADMIN, UserRole.USER]
          .includes(queryRole as UserRole)) {
        return sendError(res, 'INVALID_INPUT');
      }

      if (queryRole) {
        filter.role = queryRole as UserRole;
      }

      const users = await UserService.getAllUsers({ sorted: true, filter, limit, skip });
      return res.json(users);
    } catch (error: unknown) {
      console.error(error instanceof Error ? error : "Unknown error");
      return sendError(res, 'UNKNOWN_ERROR');
    }
  }
  
  static async getUserById(req: Request, res: Response): Promise<Response> {
    const id = req.params.id;
    if (!isObjectId(id)) return sendError(res, 'INVALID_USER_ID');
    
    try {            
      const user = await UserService.getUserById(id);

      if (!user) {
        return sendError(res, 'USER_NOT_FOUND');
      }
      
      return res.json(user);
    } catch (error: unknown) {
      console.error(error instanceof Error ? error : "Unknown error");
      return sendError(res, 'UNKNOWN_ERROR');
    }
  }
  
  static async patchUserById(req: Request, res: Response): Promise<Response> {
    const id = req.params.id;
    const body: Partial<IUser> = {};
      
    if (!isObjectId(id)) {
      return sendError(res, 'INVALID_USER_ID');
    }
    
    if (req.body.role && ![UserRole.ADMIN, UserRole.USER]
        .includes(req.body.role as UserRole)) {
      return sendError(res, 'INVALID_INPUT');
    }

    try {
      const cleanName = req.body.name ?
        validateName(req.body.name) :
        undefined;
      const cleanEmail = req.body.email ?
        validateEmail(req.body.email) :
        undefined;
      const cleanRole = req.body.role ?
        req.body.role :
        undefined;

      body.name  = cleanName  || undefined;
      body.email = cleanEmail || undefined;
      body.role  = cleanRole  || undefined;

      const updatedUser = await UserService.patchUserById(id, body);
      if (!updatedUser) {
        return sendError(res, 'USER_NOT_FOUND');
      }
      
      return res.json(updatedUser);
    } catch (error: unknown) {
      console.error(error instanceof Error ? error : "Unknown error");
      return sendError(res, 'UNKNOWN_ERROR');
    }
  }
  
  static async updateUserPassword(req: Request, res: Response): Promise<Response> {
    const id = req.params.id;
    const { currentPassword, newPassword } = req.body;
     
    if (!isObjectId(id)) {
      return sendError(res, 'INVALID_USER_ID');
    }
    
    try {
      const cleanPassword = validatePassword(newPassword);

      const isUpdated = await UserService
        .updateUserPassword(id, currentPassword, cleanPassword);
      
      if (!isUpdated) {
        return sendError(res, 'INCORRECT_PASSWORD');
      }
      
      return res.json({ message: 'Password updated successfully' });
    } catch (error: unknown) {
      console.error(error instanceof Error ? error : "Unknown error");
      return sendError(res, 'UNKNOWN_ERROR');
    }
  }
  
  static async deleteUserById(req: Request, res: Response): Promise<Response> {
    const id = req.params.id;
    if (!isObjectId(id)) {
      return sendError(res, 'INVALID_USER_ID');
    }

    try {  
      const isDeleted = await UserService.deleteUserById(id);
      if (!isDeleted) {
        return sendError(res, 'USER_NOT_FOUND');
      }
      
      return res
        .status(204)
        .send();
    } catch (error: unknown) {
      console.error(error instanceof Error ? error : "Unknown error");
      return sendError(res, 'UNKNOWN_ERROR');
    }
  }
}

export default UserController;
