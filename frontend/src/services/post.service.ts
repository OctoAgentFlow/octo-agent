import { request } from "@/lib/request";
export const postService = { list: () => request.get("/posts") };
