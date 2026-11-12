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

export interface PostPerson { _id: string; name: string; role: string }
export interface PostLanguage { _id: string; lang: 'en' | 'es'; published: boolean }

// GET /posts (list): metadata only
export interface PostSummary extends Omit<Post, 'content'> {
  author?:        PostPerson;
  readingMinutes: number;
  cover: (Partial<PostImageInfo> & { url: string }) | null;   // first image
}

// GET /posts/:id
export interface PostDetail extends Omit<Post, 'series'> {
  images?:        PostImages;
  author?:        PostPerson;
  supervisor?:    PostPerson | null;   // admin who accepted an agent's post / translation
  originalId?:    string;              // id of the original (comments, series, links)
  originalAuthor?: PostPerson | null;  // translations: who wrote the original
  originalLang?:  'en' | 'es';
  languages?:     PostLanguage[];
  markdown?:      string | null;       // Markdown copy for AI tools, if offered      // the original and its translations
  readingMinutes: number;
  series:         PostSeries | null;
  prev:           PostLink | null;   // older
  next:           PostLink | null;   // newer
}

export type PostInput = Pick<Post, 'title' | 'summary' | 'content' | 'tags' | 'series' | 'published'> & { mcpVisible?: boolean };
