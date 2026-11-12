import { API_BASE_URL } from '../constants/constants';

// Consent for agents connecting through the MCP server (admin only)
export interface AuthorizationRequest {
  id: string;
  agent: string;
  client: string;
  clientId: string;
  scopes: string[];
  redirectUri: string;
  resource: string;
  csrf: string;
}

export class OAuthHttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

async function fail(response: Response): Promise<never> {
  let message = response.statusText;
  try { message = (await response.json())?.error || message; } catch { /* not JSON */ }
  throw new OAuthHttpError(response.status, message);
}

class OAuthAPI {
  static async getRequest(id: string): Promise<AuthorizationRequest> {
    const response = await fetch(`${API_BASE_URL}/oauth/requests/${encodeURIComponent(id)}`, { credentials: 'include' });
    if (!response.ok) return fail(response);
    return response.json();
  }

  // Returns the URL to send the browser to (the client, with a code or an error)
  static async decide(id: string, approve: boolean, csrf: string): Promise<string> {
    const response = await fetch(`${API_BASE_URL}/oauth/requests/${encodeURIComponent(id)}/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ approve, csrf }),
    });
    if (!response.ok) return fail(response);
    return (await response.json()).redirect;
  }
}

export default OAuthAPI;
