import { request } from "@/lib/request";

type ApiResponse<T> = {
  code: number;
  message: string;
  data: T;
};

export type TokenData = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

type AuthResponse = {
  user: {
    id: number;
    email: string;
    name: string;
  };
  tokens: TokenData;
};

export type SendCodeResponse = {
  email: string;
  purpose: string;
  expires_in: number;
  code?: string;
};

export type MeData = {
  id: number;
  email: string;
  name: string;
  status: string;
  wallet_address?: string;
};

export const authService = {
  async login(payload: { email: string; password: string }) {
    const res = await request.post<ApiResponse<AuthResponse>>("/auth/login", payload);
    return res.data.data;
  },
  async register(payload: { email: string; password: string; name: string; verification_code: string }) {
    const res = await request.post<ApiResponse<AuthResponse>>("/auth/register", payload);
    return res.data.data;
  },
  async sendEmailCode(payload: { email: string; purpose?: "register" | "admin_login" }) {
    const res = await request.post<ApiResponse<SendCodeResponse>>("/auth/email-code/send", payload);
    return res.data.data;
  },
  async me() {
    const res = await request.get<ApiResponse<MeData>>("/users/me");
    return res.data.data;
  },
};
