import UserModel, { IUserDocument } from "../models/User";
import { UserRole } from "../types/userRole";
import { AppError } from "../config/errors";
import UserService from "./users.service";

// Account creation. Input is already validated by the controller; the
// password arrives in clear text and is hashed here.
interface NewAccount {
  name: string;
  email: string;
  password: string;
  termsAcceptedAt?: Date;
  termsVersion?: string;
}

class AuthService {

  static async signUp(data: NewAccount): Promise<IUserDocument> {
    return AuthService.create(data, UserRole.USER);
  }

  static async signUpAdmin(data: NewAccount): Promise<IUserDocument> {
    return AuthService.create(data, UserRole.ADMIN);
  }

  // A taken name or email is a 409 (unique indexes; a race between two
  // sign-ups ends the same way).
  private static async create({ password, ...fields }: NewAccount, role: UserRole): Promise<IUserDocument> {
    if (await UserModel.exists({ email: fields.email })) throw new AppError("USER_ALREADY_EXISTS");
    try {
      return await UserModel.create({ ...fields, hash: await UserService.hashPassword(password), role });
    } catch (err) {
      throw UserService.duplicateToConflict(err);
    }
  }
}

export default AuthService;
