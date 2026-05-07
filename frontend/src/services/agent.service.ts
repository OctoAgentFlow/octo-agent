import { request } from "@/lib/request";
import type { Agent } from "@/types/agent";

type ApiResponse<T> = {
  code: number;
  message: string;
  data: T;
};

export const agentService = {
  async list() {
    const res = await request.get<ApiResponse<Agent[]>>("/agents");
    return res.data.data;
  },
};
