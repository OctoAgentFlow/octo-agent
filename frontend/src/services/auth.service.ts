import { request } from "@/lib/request";
export const authService = { login: () => request.post("/auth/login") };
