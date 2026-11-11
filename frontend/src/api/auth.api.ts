import { API_BASE_URL } from '../constants/constants';

class AuthAPI {
  static async _signUp(name: string, email: string, password: string, admin: boolean = false) {
    const method = admin ? "signup-admin" : "signup";
    const headers = { 'Content-Type': 'application/json' };
    const options: RequestInit = {
      method: 'POST',
      headers,
      body: JSON.stringify(admin ? { name, email, password } : { name, email, password, acceptTerms: true }),
    };
    
    // Only add credentials for admin signup (needs cookie auth)
    if (admin) {
      options.credentials = 'include';
    }

    const response = await fetch(`${API_BASE_URL}/auth/${method}`, options);

    if (!response.ok) {
      let errText = response.statusText;
      try {
        const errJson = await response.json();
        errText = errJson?.message || errJson?.error || errText;
      } catch {}
      throw new Error(errText);
    }
    return await response.json();
  }

  // Public sign-up: only called once the visitor has ticked the terms box
  static async signUp(name: string, email: string, password: string) {
    return this._signUp(name, email, password);
  }

  static async signUpAdmin(name: string, email: string, password: string, role: string) {
    if (role !== 'admin') {
      throw new Error('Only admins can create admin accounts');
    }
    return this._signUp(name, email, password, true);
  }

  static async logIn(name: string, password: string) {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',  // Send cookies with request
      body: JSON.stringify({ name, password }),
    });

    if (!response.ok) {
      let errText = response.statusText;
      try {
        const errJson = await response.json();
        errText = errJson?.message || errJson?.error || errText;
      } catch {}
      throw new Error(`Failed to login: ${errText}`);
    }
    return await response.json();
  }

  static async logout() {
    const response = await fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });

    if (!response.ok) {
      let errText = response.statusText;
      try {
        const errJson = await response.json();
        errText = errJson?.message || errJson?.error || errText;
      } catch {}
      throw new Error(`Failed to logout: ${errText}`);
    }
    return await response.json();
  }
}

export default AuthAPI;
