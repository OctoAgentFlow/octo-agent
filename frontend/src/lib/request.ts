import axios, { type InternalAxiosRequestConfig } from "axios";
import { getAccessToken, getRefreshToken, signIn, signOut } from "@/lib/auth-session";
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

export function apiErrorCode(error: unknown) {
  return axios.isAxiosError(error) ? (error.response?.data as ApiErrBody | undefined)?.error_code : undefined;
}

export function apiErrorMessage(error: unknown) {
  return axios.isAxiosError(error) ? (error.response?.data as ApiErrBody | undefined)?.message : undefined;
}

type TokenData = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

type ApiResponse<T> = {
  code: number;
  message: string;
  data: T;
};

type RetryableRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean;
};

let refreshPromise: Promise<string | null> | null = null;

function isAuthEndpoint(url?: string) {
  return Boolean(url?.includes("/auth/login") || url?.includes("/auth/register") || url?.includes("/auth/refresh"));
}

async function refreshAccessToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;
  if (!refreshPromise) {
    refreshPromise = axios
      .post<ApiResponse<TokenData>>(`${request.defaults.baseURL}/auth/refresh`, {
        refresh_token: refreshToken,
      })
      .then((res) => {
        const tokens = res.data.data;
        signIn(tokens.access_token, tokens.refresh_token);
        return tokens.access_token;
      })
      .catch(() => null)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

request.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error?.config as RetryableRequestConfig | undefined;
    if (error?.response?.status === 401) {
      const canRefresh = original && !original._retry && !isAuthEndpoint(original.url);
      if (canRefresh) {
        original._retry = true;
        const token = await refreshAccessToken();
        if (token) {
          original.headers.Authorization = `Bearer ${token}`;
          return request(original);
        }
      }
      signOut();
    }
    const code = (error?.response?.data as ApiErrBody | undefined)?.error_code;
    if (code === "subscription_expired") {
      emitSubscriptionExpired();
    }
    return Promise.reject(error);
  }
);
