import type { PostImages, PostImageInfo } from './media';

export interface PostLink {
  _id:   string;
  title: string;
}

export interface PostSeries {
  name:  string;
  part:  number;          // 1-based position among published posts of the series; 0 = this post is a draft
  total: number;
  posts: PostLink[];      // oldest first
}

export interface Post {
  _id:        string;
  title:      string;
  summary:    string;
  content:    string;     // not included in the list endpoint
  published:  boolean;
  tags:       string[];
  series:     string;     // "" = not part of a series
  lang?:      'en' | 'es';
  translationOf?: string | null;   // set on translations: the original's id
  mcpVisible?: boolean;   // false: hidden from AI agents (MCP)
  createdAt:  string;
  updatedAt:  string;
}

// GET /posts (list): metadata only
export interface PostSummary extends Omit<Post, 'content'> {
  readingMinutes: number;
  cover: (Partial<PostImageInfo> & { url: string }) | null;   // first image
}

// GET /posts/:id
export interface PostDetail extends Omit<Post, 'series'> {
  images?:        PostImages;
  readingMinutes: number;
  series:         PostSeries | null;
  prev:           PostLink | null;   // older
  next:           PostLink | null;   // newer
}

export type PostInput = Pick<Post, 'title' | 'summary' | 'content' | 'tags' | 'series' | 'published'> & { mcpVisible?: boolean };
