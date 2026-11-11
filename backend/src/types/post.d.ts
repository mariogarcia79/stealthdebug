import { Types } from "mongoose";

export interface IPost {
  author: Types.ObjectId;
  title: string;
  summary: string;
  content: string;
  published: boolean;
  tags: string[];
  series: string;
  createdAt: Date;
  updatedAt: Date;
}