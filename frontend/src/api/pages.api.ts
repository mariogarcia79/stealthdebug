import { API_BASE_URL } from '../constants/constants';
import type { PostImages } from '../types/media';

// Standalone pages edited from the admin editor ("about")
export type PageSlug = 'about';

export interface Page {
  slug: PageSlug;
  content: string;          // markdown; "" = nothing written yet
  updatedAt: string | null; // null = never saved
  images?: PostImages;
}

async function errorText(response: Response): Promise<string> {
  try {
    const j = await response.json();
    return j?.message || j?.error || response.statusText;
  } catch {
    return response.statusText;
  }
}

class PagesAPI {
  static async get(slug: PageSlug): Promise<Page> {
    const response = await fetch(`${API_BASE_URL}/pages/${slug}`);
    if (!response.ok) throw new Error(`Failed to load page: ${await errorText(response)}`);
    return response.json();
  }

  static async save(slug: PageSlug, content: string): Promise<Page> {
    const response = await fetch(`${API_BASE_URL}/pages/${slug}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ content }),
    });
    if (!response.ok) throw new Error(`Failed to save page: ${await errorText(response)}`);
    return response.json();
  }
}

export default PagesAPI;
