import { request } from "@/lib/request";
export const analyticsService = { overview: () => request.get("/analytics") };
