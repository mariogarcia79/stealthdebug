import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

import {
  validateEmail,
  validateName,
  validatePassword
} from '../utils/validation';

import AuthService from "../services/auth.service";
import UserService from "../services/users.service";
import { ERRORS, sendError } from "../config/errors";
import { blacklistToken } from "../middleware/tokenBlacklist";

if (!process.env.JWT_SECRET) {
  throw new Error("FATAL: JWT_SECRET environment variable must be set");
}
const secret = process.env.JWT_SECRET;


class AuthController {

  static async signUp(req: Request, res: Response): Promise<Response> {
    const { name, email, password } = req.body;
    
    try {
      const cleanName = validateName(name);
      const cleanEmail = validateEmail(email);
      const cleanPassword = validatePassword(password);

      const hashedPassword = await bcrypt.hash(cleanPassword, 10);
      const newUser = await AuthService.signUp({
        name: cleanName,
        email: cleanEmail,
        hash: hashedPassword
      });

      if (!newUser) {
        return sendError(res, 'BAD_REQUEST');
      }

      return res
        .status(201)
        .json(newUser);

    } catch (err: unknown) {
      if (err instanceof Error)
        return res.status(400).json({ error: err.message });
      return sendError(res, 'UNKNOWN_ERROR');
    }
  }

  static async signUpAdmin(req: Request, res: Response): Promise<Response> {
    const { name, email, password } = req.body;
    
    try {
      const cleanName = validateName(name);
      const cleanEmail = validateEmail(email);
      const cleanPassword = validatePassword(password);

      const hashedPassword = await bcrypt.hash(cleanPassword, 10);
      const newUser = await AuthService.signUpAdmin({
        name: cleanName,
        email: cleanEmail,
        hash: hashedPassword
      });

      if (!newUser) {
        return sendError(res, 'BAD_REQUEST');
      }

      return res
        .status(201)
        .json(newUser);

    } catch (err: unknown) {
      if (err instanceof Error)
        return res.status(400).json({ error: err.message });
      return sendError(res, 'UNKNOWN_ERROR');
    }
  }
  
  static async logIn(req: Request, res: Response): Promise<Response> {
    const { name, password } = req.body;
    
    try {
      const cleanName = validateName(name);
      const cleanPassword = validatePassword(password);

      const user = await UserService.getUserByName(cleanName);

      // Compare against a dummy hash when user is not found to prevent timing-based
      // username enumeration. Both paths take the same bcrypt time.
      const DUMMY_HASH = "$2b$10$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
      const hashToCompare = user ? user.hash : DUMMY_HASH;
      const isMatch = await bcrypt.compare(cleanPassword, hashToCompare);

      if (!user || !isMatch) {
        return sendError(res, 'INVALID_CREDENTIALS');
      }
      
      const token = jwt.sign(
        { 
          _id: user._id,
          role: user.role,
          email: user.email
        },
        secret,
        { expiresIn: "1h" }
      );
      
      res.cookie("jwt", token, {
        maxAge: 1000 * 60 * 60, // 1 hour
        secure: true,
        httpOnly: true,
        sameSite: "strict",
      });

      return res.json({ 
        message: "Login successful",
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role
        }
      });

    } catch (err: unknown) {
      console.error(err);
      return sendError(res, 'UNKNOWN_ERROR');
    }
  }

  static async getUserInfo(req: Request, res: Response): Promise<Response> {
    try {
      if (!req.user) {
        return sendError(res, 'UNAUTHORIZED');
      }

      const user = await UserService.getUserById(req.user._id);
      if (!user) {
        return sendError(res, 'USER_NOT_FOUND');
      }

      return res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      });
    } catch (err: unknown) {
      return sendError(res, 'UNKNOWN_ERROR');
    }
  }

  static async logout(req: Request, res: Response): Promise<Response> {
    const token = req.cookies.jwt;
    if (token) {
      try {
        const decoded = jwt.decode(token) as { exp?: number } | null;
        if (decoded?.exp) {
          blacklistToken(token, decoded.exp);
        }
      } catch {}
    }
    res.clearCookie("jwt");
    return res.json({ message: "Logged out successfully" });
  }
}

export default AuthController;
