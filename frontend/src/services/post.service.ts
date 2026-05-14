import { request } from "@/lib/request";

import type { PostExecuteResult, PostItem, PostListData } from "@/types/post";

type ApiResponse<T> = {
  code: number;
  message: string;
  data: T;
};

export type PostCreateBody = {
  x_account_id: number;
  content: string;
  status?: string;
  scheduled_at?: string | null;
  published_at?: string | null;
};

export type PostUpdateBody = {
  x_account_id?: number;
  content?: string;
  status?: string;
  scheduled_at?: string | null;
  published_at?: string | null;
};

export type PostGenerateBody = {
  x_account_id: number;
  topic?: string;
};

export type PostGenerateResult = {
  content: string;
  bot_id?: number;
  scene: "auto_post";
  usage: {
    ai_generations_month: number;
  };
  limits: {
    ai_generations_monthly: number;
  };
};

export const postService = {
  async list(params?: { page?: number; page_size?: number }) {
    const res = await request.get<ApiResponse<PostListData>>("/posts", { params });
    return res.data.data;
  },

  async get(id: number) {
    const res = await request.get<ApiResponse<PostItem>>(`/posts/${id}`);
    return res.data.data;
  },

  async create(body: PostCreateBody) {
    const res = await request.post<ApiResponse<PostItem>>("/posts", body);
    return res.data.data;
  },

  async generate(body: PostGenerateBody) {
    const res = await request.post<ApiResponse<PostGenerateResult>>("/posts/generate", body);
    return res.data.data;
  },

  async update(id: number, body: PostUpdateBody) {
    const res = await request.put<ApiResponse<PostItem>>(`/posts/${id}`, body);
    return res.data.data;
  },

  async remove(id: number) {
    await request.delete(`/posts/${id}`);
  },

  /** Manual publish to X (draft or scheduled only). */
  async execute(id: number) {
    const res = await request.post<ApiResponse<PostExecuteResult>>(`/posts/${id}/execute`);
    return res.data.data;
  },
};
