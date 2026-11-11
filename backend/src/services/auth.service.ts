import UserModel, { IUserDocument } from "../models/User";
import { IUser } from "../types/user";
import { UserRole } from "../types/userRole";

class AuthService {

  static async signUp(data: Partial<IUser>): Promise<IUserDocument | null> {
    return this._signUp({
      ...data,
      role: UserRole.USER
    });
  }

  static async signUpAdmin(data: Partial<IUser>): Promise<IUserDocument | null> {
    return this._signUp({
      ...data,
      role: UserRole.ADMIN
    });
  }

  private static async _signUp(data: Partial<IUser>): Promise<IUserDocument | null> {
    try {
      const exists = await UserModel.findOne({ email: data.email });
      
      if (exists) {
        console.error("email already registered");
        return null;
      }

      const newUser = new UserModel({
        name: data.name,
        email: data.email,
        hash: data.hash,
        role: data.role,
        termsAcceptedAt: data.termsAcceptedAt,
        termsVersion: data.termsVersion
      });

      return await newUser.save();

    } catch (err) {
      console.error("Error: _signUp:", err);
      return null;
    }
  }
}

export default AuthService;