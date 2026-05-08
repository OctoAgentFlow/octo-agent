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
    role: string;
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
  role: string;
  wallet_address?: string;
};

export type NotificationSettingsData = {
  email_enabled: boolean;
  in_app_enabled: boolean;
  automation_failure: boolean;
  billing_alerts: boolean;
  review_required: boolean;
  subscription_alerts: boolean;
  weekly_summary: boolean;
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
  async updateMe(payload: { name: string }) {
    const res = await request.patch<ApiResponse<MeData>>("/users/me", payload);
    return res.data.data;
  },
  async notificationSettings() {
    const res = await request.get<ApiResponse<NotificationSettingsData>>("/users/me/notification-settings");
    return res.data.data;
  },
  async updateNotificationSettings(payload: Partial<NotificationSettingsData>) {
    const res = await request.patch<ApiResponse<NotificationSettingsData>>("/users/me/notification-settings", payload);
    return res.data.data;
  },
};
