import { request } from "@/lib/request";
export const agentService = { list: () => request.get("/agents") };
