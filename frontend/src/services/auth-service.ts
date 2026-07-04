import { apiClient } from "@/lib/api-client";
import type {
  LoginPayload,
  RegisterPayload,
  TokenResponse,
  User,
  UpdateProfilePayload,
  ChangePasswordPayload,
} from "@/types/auth";

export const authService = {
  async register(payload: RegisterPayload): Promise<TokenResponse> {
    const { data } = await apiClient.post<TokenResponse>("/api/auth/register", payload);
    return data;
  },

  async login(payload: LoginPayload): Promise<TokenResponse> {
    const { data } = await apiClient.post<TokenResponse>("/api/auth/login", payload);
    return data;
  },

  async logout(): Promise<void> {
    await apiClient.post("/api/auth/logout");
  },

  async getCurrentUser(): Promise<User> {
    const { data } = await apiClient.get<User>("/api/auth/me");
    return data;
  },

  async updateProfile(payload: UpdateProfilePayload): Promise<User> {
    const { data } = await apiClient.patch<User>("/api/auth/me", payload);
    return data;
  },

  async changePassword(payload: ChangePasswordPayload): Promise<void> {
    await apiClient.post("/api/auth/change-password", payload);
  },
};
