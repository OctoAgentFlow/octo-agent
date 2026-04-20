import axios from "axios";
import { getAccessToken, signOut } from "@/lib/auth-session";
import { emitSubscriptionExpired } from "@/lib/subscription-expired-event";

export const request = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:10001/api/v1",
  timeout: 10000,
});

request.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

type ApiErrBody = {
  error_code?: string;
  message?: string;
};

request.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      signOut();
    }
    const code = (error?.response?.data as ApiErrBody | undefined)?.error_code;
    if (code === "subscription_expired") {
      emitSubscriptionExpired();
    }
    return Promise.reject(error);
  }
);
