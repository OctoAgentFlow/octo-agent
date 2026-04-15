import { request } from "@/lib/request";
export const userService = { profile: () => request.get("/users/me") };
