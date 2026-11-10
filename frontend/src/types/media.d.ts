export interface MediaVariant {
  width: number;
  height: number;
  url: string;
  size: number;
}

export interface MediaUsage {
  _id: string;
  title: string;
  published: boolean;
}

export interface Media {
  _id: string;
  filename: string;
  url: string;          // original, e.g. /api/uploads/name-123-abc.webp
  thumbUrl: string;     // smallest resized copy (or the original)
  originalName: string;
  alt: string;
  width: number;
  height: number;
  size: number;
  variants: MediaVariant[];
  createdAt: string;
  usedIn: MediaUsage[];
}

// What the renderer needs to build a responsive <img>, keyed by filename.
export interface PostImageInfo {
  width: number;
  height: number;
  variants: { width: number; url: string }[];
}

export type PostImages = Record<string, PostImageInfo>;
