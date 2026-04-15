import { request } from "@/lib/request";
export const accountService = { list: () => request.get("/accounts") };
