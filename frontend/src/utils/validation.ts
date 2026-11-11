const _env: any = (import.meta as any).env || {};
export const MIN_PASSWORD_LENGTH = Number(_env.VITE_MIN_PASSWORD_LENGTH) || 8;
export const MAX_TITLE_LENGTH = Number(_env.VITE_MAX_TITLE_LENGTH) || 300;
export const MAX_SUMMARY_LENGTH = Number(_env.VITE_MAX_SUMMARY_LENGTH) || 1000;
export const MAX_CONTENT_LENGTH = Number(_env.VITE_MAX_CONTENT_LENGTH) || 20000;

export function isValidEmail(email: unknown): boolean {
  if (typeof email !== 'string') return false;
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

export function validateSignup(name: string, email: string, password: string): string | null {
  if (!name || name.trim().length === 0) return 'Name is required';
  if (!email || !isValidEmail(email)) return 'A valid email is required';
  if (!password || password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  return null;
}

export function validateLogin(name: string, password: string): string | null {
  if (!name || name.trim().length === 0) return 'Name is required';
  if (!password) return 'Password is required';
  return null;
}

export function validatePost(title: string, summary: string, content: string): string | null {
  if (!title || title.trim().length === 0) return 'Title is required';
  if (title.length > MAX_TITLE_LENGTH) return `Title must be ${MAX_TITLE_LENGTH} characters or less`;
  if (!summary || summary.trim().length === 0) return 'Summary is required';
  if (summary.length > MAX_SUMMARY_LENGTH) return `Summary must be ${MAX_SUMMARY_LENGTH} characters or less`;
  if (!content || content.trim().length === 0) return 'Content is required';
  if (content.length > MAX_CONTENT_LENGTH) return `Content must be ${MAX_CONTENT_LENGTH} characters or less`;
  return null;
}
