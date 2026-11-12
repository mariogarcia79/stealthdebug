import { Types } from "mongoose";

export interface IPost {
  author: Types.ObjectId;
  title: string;
  summary: string;
  content: string;
  published: boolean;
  tags: string[];
  series: string;
  lang: string;                          // "en" | "es" (config/langs.ts)
  translationOf: Types.ObjectId | null;  // set on translations: the original post
  mcpVisible: boolean;                   // false: hidden from agents (MCP)
  createdAt: Date;
  updatedAt: Date;
}