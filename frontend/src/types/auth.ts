export interface User {
  id: string;
  full_name: string;
  email: string;
  created_at: string;
}

export interface RegisterPayload {
  full_name: string;
  email: string;
  password: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: User;
}

export interface ApiErrorShape {
  detail: string | { msg: string; loc: (string | number)[] }[];
}

export interface UpdateProfilePayload {
  full_name: string;
}

export interface ChangePasswordPayload {
  current_password: string;
  new_password: string;
}
