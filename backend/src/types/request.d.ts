import { Request } from 'express';

declare global {
  namespace Express {
    interface Request {
      user?: {
        _id: string;
        role: "admin" | "user";
        email: string;
      };
      // Agent API only (middleware/agentAuth.middleware.ts)
      agent?: {
        _id: string;
        name: string;
        grantId: string;
        scopes: string[];
      };
    }
  }
}