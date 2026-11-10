import { Media } from '../types/media';
import { API_BASE_URL } from '../constants/constants';

async function errorText(response: Response): Promise<string> {
  try {
    const body = await response.json();
    return body?.message || body?.error || response.statusText;
  } catch {
    return response.statusText;
  }
}

// Admin-only media library (backend: /api/media).
class MediaAPI {
  static async list(q?: string): Promise<Media[]> {
    const qs = q ? `?q=${encodeURIComponent(q)}` : '';
    const response = await fetch(`${API_BASE_URL}/media${qs}`, { credentials: 'include' });
    if (!response.ok) throw new Error(`Failed to load media: ${await errorText(response)}`);
    return response.json();
  }

  static async upload(file: File): Promise<Media> {
    const formData = new FormData();
    formData.append('file', file);
    // Content-Type is set by the browser (multipart boundary)
    const response = await fetch(`${API_BASE_URL}/media`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    if (!response.ok) throw new Error(`Upload failed: ${await errorText(response)}`);
    return response.json();
  }

  static async updateAlt(id: string, alt: string): Promise<Media> {
    const response = await fetch(`${API_BASE_URL}/media/${id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alt }),
    });
    if (!response.ok) throw new Error(`Failed to save alt text: ${await errorText(response)}`);
    return response.json();
  }

  static async remove(id: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/media/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!response.ok) throw new Error(`Failed to delete: ${await errorText(response)}`);
  }
}

export default MediaAPI;
