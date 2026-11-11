import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import UserService from "../services/users.service";
import CommentModel from "../models/Comment";
import jwt from "jsonwebtoken";
import { ERRORS, sendError } from "../config/errors";
import { isTokenBlacklisted } from "./tokenBlacklist";

if (!process.env.JWT_SECRET) {
  throw new Error("FATAL: JWT_SECRET environment variable must be set");
}
const secret = process.env.JWT_SECRET;

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {

  const token = req.cookies.jwt;

  if (!token) {
    return sendError(res, 'MISSING_AUTH_TOKEN');
  }

  if (isTokenBlacklisted(token)) {
    return sendError(res, 'INVALID_TOKEN');
  }

  try {
    const decoded = jwt.verify(token, secret) as {
      _id: string;
      role: "admin" | "user";
      email: string;
    };

    const user = await UserService.getUserById(decoded._id);
    if (!user) {
      return sendError(res, 'USER_NOT_FOUND');
    }

    req.user = {
      _id: user.id.toString(),
      role: user.role as "admin" | "user",
      email: user.email,
    };

    next();
  } catch (err) {
    return sendError(res, 'INVALID_TOKEN');
  }
};

// For public routes that show more to a logged-in user (the admin sees
// unpublished posts): sets req.user when the session cookie is valid, and
// otherwise just continues as an anonymous request. Never rejects.
export const optionalAuth = async (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  const token = req.cookies?.jwt;
  if (!token || isTokenBlacklisted(token)) return next();
  try {
    const decoded = jwt.verify(token, secret) as { _id: string };
    const user = await UserService.getUserById(decoded._id);
    if (user) {
      req.user = { _id: user.id.toString(), role: user.role as "admin" | "user", email: user.email };
    }
  } catch {
    /* invalid or expired token: anonymous */
  }
  next();
};

export const checkRole = (...allowedRoles: ("admin" | "user")[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return sendError(res, 'UNAUTHORIZED');
    }

    if (!allowedRoles.includes(req.user.role)) {
      return sendError(res, 'FORBIDDEN');
    }

    next();
  };
};

export const validateUserId = (
  req: Request,
  res: Response,
  next: NextFunction
) => {

  if (!req.user) {
    return sendError(res, 'UNAUTHORIZED');
  }

  const routeUserId = req.params.id;

  if (req.user.role === "admin" ||
    req.user._id === routeUserId) {
    return next();
  }

  return sendError(res, 'FORBIDDEN');
};

// Checks that the requesting user owns the comment identified by :id, or is admin.
export const validateCommentOwner = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) return sendError(res, 'UNAUTHORIZED');
  if (req.user.role === "admin") return next();

  const commentId = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(commentId)) {
    return sendError(res, 'INVALID_COMMENT_ID');
  }

  try {
    const comment = await CommentModel.findById(commentId).select("author").lean();
    if (!comment) return sendError(res, 'COMMENT_NOT_FOUND');

    if (comment.author.toString() !== req.user._id) {
      return sendError(res, 'FORBIDDEN');
    }

    next();
  } catch {
    return sendError(res, 'UNKNOWN_ERROR');
  }
};
