import { Request, Response } from "express";
import UserService from "../services/users.service";
import { isObjectId, validateName, validateEmail, validatePassword } from "../utils/validation";
import { UserRole } from "../types/userRole";
import { AppError } from "../config/errors";
import { MAX_NAME_LENGTH } from "../config/validation";

function checkUserId(id: string): void {
  if (!isObjectId(id)) throw new AppError("INVALID_USER_ID");
}

class UserController {

  // Admin list. ?name= is a case-insensitive "contains" search, ?role= exact.
  static async getAllUsers(req: Request, res: Response): Promise<Response> {
    const name = typeof req.query.name === "string" ? req.query.name.trim().slice(0, MAX_NAME_LENGTH) : undefined;
    const role = req.query.role as string | undefined;
    if (role !== undefined && !(Object.values(UserRole) as string[]).includes(role)) throw new AppError("INVALID_INPUT");

    const page  = Math.max(1, parseInt(req.query.page  as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));

    const users = await UserService.getAllUsers({
      sorted: true,
      filter: { name: name || undefined, role: role as UserRole | undefined },
      limit,
      skip: (page - 1) * limit,
    });
    return res.json(users);
  }

  static async getUserById(req: Request, res: Response): Promise<Response> {
    checkUserId(req.params.id);
    const user = await UserService.getUserById(req.params.id);
    if (!user) throw new AppError("USER_NOT_FOUND");
    return res.json(user);
  }

  // Name and email only; any other field (role, hash) is ignored.
  static async patchUserById(req: Request, res: Response): Promise<Response> {
    checkUserId(req.params.id);
    const body = req.body ?? {};
    const user = await UserService.patchUserById(req.params.id, {
      name:  body.name  ? validateName(body.name)   : undefined,
      email: body.email ? validateEmail(body.email) : undefined,
    });
    return res.json(user);
  }

  static async updateUserPassword(req: Request, res: Response): Promise<Response> {
    checkUserId(req.params.id);
    const { currentPassword, newPassword } = req.body ?? {};
    await UserService.updateUserPassword(req.params.id, currentPassword, validatePassword(newPassword));
    return res.json({ message: "Password updated successfully" });
  }

  static async deleteUserById(req: Request, res: Response): Promise<Response> {
    checkUserId(req.params.id);
    await UserService.deleteUserById(req.params.id);
    return res.status(204).send();
  }
}

export default UserController;
