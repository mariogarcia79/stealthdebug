import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

import { validateEmail, validateName, validatePassword } from "../utils/validation";
import AuthService from "../services/auth.service";
import UserService from "../services/users.service";
import { AppError, ValidationError } from "../config/errors";
import { env } from "../config/env";
import { blacklistToken } from "../middleware/tokenBlacklist";

// Version (effective date) of the terms of use accepted at sign-up. Bump it
// together with frontend/src/content/legal/*/terms.md when the terms change.
export const TERMS_VERSION = "2026-11-11";

// Compared against when the user doesn't exist, so a wrong name and a wrong
// password take the same bcrypt time (no username enumeration by timing).
const DUMMY_HASH = "$2b$10$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

// Never send the password hash back to the client.
function publicUser(u: { _id: unknown; name: string; email: string; role: string; createdAt?: Date }) {
  return { _id: u._id, name: u.name, email: u.email, role: u.role, createdAt: u.createdAt };
}

function validateAccount(body: Record<string, unknown>) {
  return {
    name: validateName(body.name as string),
    email: validateEmail(body.email as string),
    password: validatePassword(body.password as string),
  };
}

class AuthController {

  static async signUp(req: Request, res: Response): Promise<Response> {
    const body = req.body ?? {};
    // Public sign-up requires accepting the terms of use (and confirming the
    // minimum age, 14 in Spain); the acceptance date is kept as proof.
    if (body.acceptTerms !== true) {
      throw new ValidationError("You must accept the terms of use and the privacy policy");
    }
    const user = await AuthService.signUp({
      ...validateAccount(body),
      termsAcceptedAt: new Date(),
      termsVersion: TERMS_VERSION,
    });
    return res.status(201).json(publicUser(user));
  }

  static async signUpAdmin(req: Request, res: Response): Promise<Response> {
    const user = await AuthService.signUpAdmin(validateAccount(req.body ?? {}));
    return res.status(201).json(publicUser(user));
  }

  static async logIn(req: Request, res: Response): Promise<Response> {
    const { name, password } = req.body ?? {};

    // Login only checks the password against the stored hash. The strength
    // rules are for choosing a password (sign-up, change); applying them here
    // turned a wrong password into a 500 and revealed the rules.
    if (typeof password !== "string" || password.length === 0 || password.length > 256) {
      throw new AppError("INVALID_CREDENTIALS");
    }
    let cleanName: string;
    try {
      cleanName = validateName(name);
    } catch {
      throw new AppError("INVALID_CREDENTIALS");
    }

    const user = await UserService.getUserByName(cleanName);
    const isMatch = await bcrypt.compare(password, user ? user.hash : DUMMY_HASH);
    if (!user || !isMatch) throw new AppError("INVALID_CREDENTIALS");

    const token = jwt.sign({ _id: user._id, role: user.role, email: user.email }, env.jwtSecret, { expiresIn: "1h" });
    res.cookie("jwt", token, {
      maxAge: 1000 * 60 * 60, // 1 hour
      secure: true,
      httpOnly: true,
      sameSite: "strict",
    });

    return res.json({
      message: "Login successful",
      user: { _id: user._id, name: user.name, email: user.email, role: user.role },
    });
  }

  static async getUserInfo(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new AppError("UNAUTHORIZED");
    const user = await UserService.getUserById(req.user._id);
    if (!user) throw new AppError("USER_NOT_FOUND");
    return res.json({ _id: user._id, name: user.name, email: user.email, role: user.role });
  }

  static async logout(req: Request, res: Response): Promise<Response> {
    const token = req.cookies.jwt;
    if (token) {
      try {
        const decoded = jwt.decode(token) as { exp?: number } | null;
        if (decoded?.exp) blacklistToken(token, decoded.exp);
      } catch { /* not a JWT: nothing to block */ }
    }
    res.clearCookie("jwt");
    return res.json({ message: "Logged out successfully" });
  }
}

export default AuthController;
