"use client";

import axios from "axios";

export type ApiErrorBody = {
  message?: string;
  error_code?: string;
};

export function getErrorBody(error: unknown): ApiErrorBody | undefined {
  if (!axios.isAxiosError(error)) return undefined;
  return error.response?.data as ApiErrorBody | undefined;
}

export function errorMessage(error: unknown, fallback: string) {
  return getErrorBody(error)?.message || fallback;
}
