import { User } from "../types/user";
import { API_BASE_URL } from "../constants/constants";
import { createContext, useContext, useState, ReactNode, useEffect } from "react";

type Role = User["role"]; // "admin" | "user"

interface AuthContextType {
  role: Role | null;
  _id: string | null;
  isLoggedIn: boolean;
  isLoading: boolean;
  login: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [_id, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  async function getUser(): Promise<User | null> {
    try {
      // 200 with { user: null } when not logged in (no 401 in the console)
      const res = await fetch(`${API_BASE_URL}/auth/session`, {
        credentials: "include",
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { user: User | null };
      return body.user;
    } catch (error) {
      return null;
    }
  }

  const login = async () => {
    try {
      const user = await getUser();
      setUserId(user?._id || null);
      setRole(user?.role || null);
      setIsLoggedIn(true);
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      // Call backend to clear cookie
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUserId(null);
      setRole(null);
      setIsLoggedIn(false);
    }
  };

  useEffect(() => {
    getUser()
      .then((user) => {
        if (user) {
          setUserId(user._id);
          setRole(user.role);
          setIsLoggedIn(true);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <AuthContext.Provider value={{ role, _id, isLoggedIn, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside an AuthProvider");
  return ctx;
};
