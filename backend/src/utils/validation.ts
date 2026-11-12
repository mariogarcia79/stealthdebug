import mongoose from 'mongoose';
import { ValidationError } from '../config/errors';
import {
  MIN_NAME_LENGTH,
  MAX_NAME_LENGTH,
  MIN_EMAIL_LENGTH,
  MAX_EMAIL_LENGTH,
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH
} from '../config/validation';

export function validateName (name: string): string {
  if (!name) throw new ValidationError("Name is required");
  if (typeof name !== 'string') throw new ValidationError("Name must be a string");

  let cleanName = name.trim();

  if (cleanName.length < MIN_NAME_LENGTH)
    throw new ValidationError(`Name must be at least ${MIN_NAME_LENGTH} characters long`);
  if (cleanName.length > MAX_NAME_LENGTH)
    throw new ValidationError(`Name must be at most ${MAX_NAME_LENGTH} characters long`);

  cleanName = sanitizeText(cleanName);
  cleanName = sanitizeMongoInput(cleanName);

  return cleanName;
}

export function validateEmail(email: string): string {
  if (!email) throw new ValidationError("Email is required");
  if (typeof email !== 'string') throw new ValidationError("Email must be a string");

  let cleanEmail = email.trim().toLowerCase();

  if (cleanEmail.length < MIN_EMAIL_LENGTH)
    throw new ValidationError(`Email must be at least ${MIN_EMAIL_LENGTH} characters long`);
  if (cleanEmail.length > MAX_EMAIL_LENGTH)
    throw new ValidationError(`Email must be at most ${MAX_EMAIL_LENGTH} characters long`);

  if (!isValidEmail(cleanEmail))
    throw new ValidationError("Invalid email format");

  cleanEmail = sanitizeText(cleanEmail);
  cleanEmail = sanitizeMongoInput(cleanEmail);
  return cleanEmail;
}

export function validatePassword(password: string): string {
  if (!password) throw new ValidationError("Password is required");
  if (typeof password !== 'string') throw new ValidationError("Password must be a string");

  if (password.length < MIN_PASSWORD_LENGTH)
    throw new ValidationError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long`);
  if (password.length > MAX_PASSWORD_LENGTH)
    throw new ValidationError(`Password must be at most ${MAX_PASSWORD_LENGTH} characters long`);

  if (!/[A-Z]/.test(password))
    throw new ValidationError("Password must contain at least one uppercase letter");
  if (!/[0-9]/.test(password))
    throw new ValidationError("Password must contain at least one digit");
  if (!/[^A-Za-z0-9]/.test(password))
    throw new ValidationError("Password must contain at least one special character");

  return password;
}

// Required text field: trimmed, length-checked and sanitised (markdown keeps
// its formatting; plain text loses HTML and control characters). "field" names
// the field in error messages ("Title is required").
export function validateInput(content: unknown, isMd: boolean, maxLen: number, field = "Content"): string {
  if (content === undefined || content === null || content === '') throw new ValidationError(`${field} is required`);
  if (typeof content !== 'string') throw new ValidationError(`${field} must be a string`);

  let cleanContent = content.trim();
  if (cleanContent.length === 0)
    throw new ValidationError(`${field} cannot be empty`);
  if (cleanContent.length > maxLen)
    throw new ValidationError(`${field} must be at most ${maxLen} characters long`);

  if (isMd) {
    cleanContent = sanitizeMongoInput(cleanContent);
    cleanContent = sanitizeMarkdown(cleanContent);
  } else {
    cleanContent = sanitizeText(cleanContent);
    cleanContent = sanitizeMongoInput(cleanContent);
  }
  return cleanContent;
}

export function isObjectId(id: unknown): boolean {
  if (!id || typeof id !== 'string') return false;
  return mongoose.Types.ObjectId.isValid(id);
}

export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isValidEmail(email: unknown): boolean {
  if (typeof email !== 'string') return false;
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

export function sanitizeText(input: unknown): string {
  if (input == null) return '';
  let text = String(input);

  // Remove all HTML tags
  text = text.replace(/<\/?[^>]+(>|$)/g, '');
  // Remove control characters and non-printable characters
  text = text.replace(/[\x00-\x1F\x7F]/g, '');
  // Normalize whitespace
  text = text.replace(/\s+/g, ' ').trim();

  return text;
}

// Server-side defense-in-depth for markdown content.
// The frontend's rehype-sanitize is the primary XSS defense; this removes
// the most dangerous constructs before storage so other rendering surfaces
// (email, RSS, API consumers) are not exposed to unfiltered HTML.
export function sanitizeMarkdown(input: unknown): string {
  let text = String(input);

  // Strip script tag and its contents entirely
  text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  // Strip tags that execute code or fetch remote resources
  text = text.replace(
    /<\/?(script|iframe|object|embed|form|input|button|link|meta|base|style|svg|math|frame|frameset|applet)\b[^>]*>/gi,
    ''
  );

  // Strip inline event handlers (onclick=, onload=, etc.)
  text = text.replace(/\s+on\w+\s*=\s*(['"])[^'"]*\1/gi, '');
  text = text.replace(/\s+on\w+\s*=\s*[^\s>]*/gi, '');

  // Strip javascript: URI schemes from href/src/action attributes
  text = text.replace(/(href|src|action)\s*=\s*(['"])javascript:[^'"]*\2/gi, '$1=""');

  return text;
}

export function sanitizeMongoInput(str: string): string {
  if (!str) return '';
  // Strip all leading '$' characters to prevent query operator injection
  // in flat string values. Mongoose's type coercion is the primary defense;
  // this is a secondary safeguard for string fields only.
  return str.replace(/^\$+/, '');
}
