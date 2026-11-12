// Shared helpers for route tests. They run the real app (supertest) against a
// real MongoDB: MONGO_TEST_URI (default mongodb://127.0.0.1:27017), one
// throwaway database per Jest worker, emptied before each test.
import mongoose, { Types } from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import UserModel from "../models/User";
import PostModel from "../models/Post";
import CommentModel from "../models/Comment";
import { UserRole } from "../types/userRole";

export const PASSWORD = "Test-Password-123!";
const passwordHash = bcrypt.hashSync(PASSWORD, 4);   // low cost: tests only

export async function connectTestDb(): Promise<void> {
  const base = (process.env.MONGO_TEST_URI || "mongodb://127.0.0.1:27017").replace(/\/+$/, "");
  await mongoose.connect(`${base}/sd_test_${process.env.JEST_WORKER_ID ?? "0"}`, { serverSelectionTimeoutMS: 5000 });
}

export async function clearTestDb(): Promise<void> {
  const collections = await mongoose.connection.db!.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
}

export async function closeTestDb(): Promise<void> {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}

let counter = 0;
export async function createUser(role: UserRole = UserRole.USER, name?: string) {
  counter++;
  const n = name ?? `${role}${counter}`;
  return UserModel.create({ name: n, email: `${n.toLowerCase()}@example.test`, hash: passwordHash, role });
}

// Session cookie, signed exactly like a real login.
export function cookieFor(user: { _id: unknown; role: string; email: string }): string {
  const token = jwt.sign({ _id: user._id, role: user.role, email: user.email }, process.env.JWT_SECRET!, { expiresIn: "1h" });
  return `jwt=${token}`;
}

export async function createPost(author: Types.ObjectId, fields: Partial<{ title: string; summary: string; content: string; published: boolean; tags: string[]; series: string }> = {}) {
  return PostModel.create({
    author,
    title: "A post",
    summary: "Its summary",
    content: "Some **markdown** content",
    published: true,
    ...fields,
  });
}

export async function createComment(post: Types.ObjectId, author: Types.ObjectId, content = "A comment") {
  return CommentModel.create({ post, author, content, published: true });
}
