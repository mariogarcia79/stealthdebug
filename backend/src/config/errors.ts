// Centralized error strings used across the backend
// Keep these values stable so frontend can rely on them
export const ERRORS = {
  UNAUTHORIZED:         { message: 'Unauthorized',                  status: 401 },
  MISSING_AUTH_TOKEN:   { message: 'Missing authentication token',  status: 401 },
  INVALID_TOKEN:        { message: 'Invalid or expired token',      status: 401 },
  USER_NOT_FOUND:       { message: 'User not found',                status: 404 },
  INVALID_USER_ID:      { message: 'Invalid user ID',               status: 400 },
  POST_NOT_FOUND:       { message: 'Post not found',                status: 404 },
  POST_IS_PUBLISHED:    { message: 'Unpublish the post before deleting it', status: 409 },
  INVALID_POST_ID:      { message: 'Invalid post ID',               status: 400 },
  INVALID_POST:         { message: 'Invalid or missing post',       status: 400 },
  FAILED_CREATE_POST:   { message: 'Failed to create post',         status: 500 },
  COMMENT_NOT_FOUND:    { message: 'Comment not found',             status: 404 },
  INVALID_COMMENT_ID:   { message: 'Invalid comment ID',            status: 400 },
  FAILED_CREATE_COMMENT:{ message: 'Failed to create comment',      status: 500 },
  UPLOAD_ERROR:         { message: 'Upload error',                  status: 400 },
  INVALID_INPUT:        { message: 'Invalid input',                 status: 400 },
  INCORRECT_PASSWORD:   { message: 'Incorrect password',            status: 401 },
  INVALID_CREDENTIALS:  { message: 'Invalid username or password',  status: 401 },
  USER_ALREADY_EXISTS:  { message: 'User already exists',           status: 409 },
  UNKNOWN_ERROR:        { message: 'Unknown error',                 status: 500 },
  BAD_REQUEST:          { message: 'Bad request',                   status: 400 },
  FORBIDDEN:            { message: 'Forbidden',                     status: 403 },
  NOT_FOUND:            { message: 'Not found',                     status: 404 },
  INVALID_JSON:         { message: 'Request body is not valid JSON', status: 400 },
  PAYLOAD_TOO_LARGE:    { message: 'Request body too large',        status: 413 },
} as const;

export type ErrorKey = keyof typeof ERRORS;

export const sendError = (
  res: import('express').Response,
  key: ErrorKey,
  overrideMessage?: string
) => {
  const entry = ERRORS[key];
  const message = overrideMessage || entry.message;
  return res.status(entry.status).json({ error: message });
};


// Errors with a known meaning. Services and controllers throw these; the error
// middleware (middleware/error.middleware.ts) turns them into the response
// { error: message } with the status from ERRORS. Anything else thrown is an
// unexpected failure: logged, and answered with a generic 500.
export class AppError extends Error {
  readonly key: ErrorKey;
  readonly status: number;
  // Extra fields merged into the JSON response (e.g. usedIn for media)
  readonly details?: Record<string, unknown>;

  constructor(key: ErrorKey, message?: string, details?: Record<string, unknown>) {
    super(message || ERRORS[key].message);
    this.name = "AppError";
    this.key = key;
    this.status = ERRORS[key].status;
    this.details = details;
  }
}

// Invalid client input (400). The message is shown to the user, so it must
// describe the problem without revealing internals.
export class ValidationError extends AppError {
  constructor(message: string) {
    super("INVALID_INPUT", message);
    this.name = "ValidationError";
  }
}
