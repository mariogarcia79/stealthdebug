import { Types } from "mongoose";
import GuidelinesModel from "../models/Guidelines";

class GuidelinesService {
  // Current guidelines; version 0 and empty content before the first save
  static async current(): Promise<{ version: number; content: string; savedAt: Date | null }> {
    const g = await GuidelinesModel.findOne().sort({ version: -1 }).lean();
    return { version: g?.version ?? 0, content: g?.content ?? "", savedAt: g?.createdAt ?? null };
  }

  // Saves a new version (content already validated by the caller)
  static async save(content: string, adminId: Types.ObjectId | string) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const version = (await GuidelinesService.current()).version + 1;
      try {
        const g = await GuidelinesModel.create({ version, content, savedBy: adminId });
        return { version: g.version, content: g.content, savedAt: g.createdAt };
      } catch (err) {
        // two saves at once: the unique index on version refuses one; retry
        if ((err as { code?: number }).code !== 11000) throw err;
      }
    }
    throw new Error("could not save guidelines");
  }

  static async history(limit = 50) {
    return GuidelinesModel.find().sort({ version: -1 }).limit(limit)
      .select("version savedBy createdAt").populate("savedBy", "name").lean();
  }

  static async getVersion(version: number) {
    return GuidelinesModel.findOne({ version }).lean();
  }
}

export default GuidelinesService;
