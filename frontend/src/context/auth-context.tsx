"use client";

import * as React from "react";
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { authService } from "@/services/auth-service";
import { tokenStorage } from "@/lib/token-storage";
import { extractApiErrorMessage } from "@/lib/api-client";
import type { LoginPayload, RegisterPayload, User, UpdateProfilePayload, ChangePasswordPayload } from "@/types/auth";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (payload: UpdateProfilePayload) => Promise<void>;
  changePassword: (payload: ChangePasswordPayload) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // isLoading tracks the initial "restore session" check on page load, so
  // ProtectedRoute knows not to redirect before we've had a chance to look
  // for an existing token.
  const [isLoading, setIsLoading] = useState(true);

  const restoreSession = useCallback(async () => {
    const token = tokenStorage.getAccessToken();
    if (!token) {
      setIsLoading(false);
      return;
    }
    try {
      const currentUser = await authService.getCurrentUser();
      setUser(currentUser);
    } catch {
      tokenStorage.clear();
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  const login = useCallback(async (payload: LoginPayload) => {
    try {
      const data = await authService.login(payload);
      tokenStorage.setTokens(data.access_token, data.refresh_token);
      setUser(data.user);
      toast.success(`Welcome back, ${data.user.full_name}!`);
    } catch (error) {
      toast.error(extractApiErrorMessage(error));
      throw error;
    }
  }, []);

  const register = useCallback(async (payload: RegisterPayload) => {
    try {
      const data = await authService.register(payload);
      // Automatic login after successful registration: the backend already
      // returns tokens on register, so no separate login call is needed.
      tokenStorage.setTokens(data.access_token, data.refresh_token);
      setUser(data.user);
      toast.success(`Welcome to The AI Software Engineer, ${data.user.full_name}!`);
    } catch (error) {
      toast.error(extractApiErrorMessage(error));
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } catch {
      // Even if the server call fails, we still clear local session state.
    } finally {
      tokenStorage.clear();
      setUser(null);
      toast.success("Logged out successfully");
    }
  }, []);

  const updateProfile = useCallback(async (payload: UpdateProfilePayload) => {
    try {
      const updatedUser = await authService.updateProfile(payload);
      setUser(updatedUser);
      toast.success("Profile updated");
    } catch (error) {
      toast.error(extractApiErrorMessage(error));
      throw error;
    }
  }, []);

  const changePassword = useCallback(async (payload: ChangePasswordPayload) => {
    try {
      await authService.changePassword(payload);
      toast.success("Password updated successfully");
    } catch (error) {
      toast.error(extractApiErrorMessage(error));
      throw error;
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
        updateProfile,
        changePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
