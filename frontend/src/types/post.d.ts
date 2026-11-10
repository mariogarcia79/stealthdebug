import type { PostImages } from './media';

export interface Post {
  _id:        string;
  title:      string;
  summary:    string;
  content:    string;
  published:  boolean;
  createdAt:  string;
  updatedAt:  string;
  // Present on GET /posts/:id: size data for referenced uploads
  images?:    PostImages;
}
