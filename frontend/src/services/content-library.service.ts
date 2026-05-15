import { request } from "@/lib/request";

type ApiResponse<T> = {
  code: number;
  message: string;
  data: T;
};

export type ContentLibraryItemType =
  | "idea"
  | "product_update"
  | "faq"
  | "case_study"
  | "announcement"
  | "link"
  | "thread_seed";

export type ContentLibraryStatus = "active" | "paused" | "archived";

export type ContentLibraryItemApi = {
  id: number;
  user_id: number;
  twitter_account_id?: number;
  bot_id?: number;
  title: string;
  item_type: ContentLibraryItemType;
  body: string;
  source_url?: string;
  topics: string[];
  growth_goal?: string;
  cta_preference?: string;
  priority: number;
  status: ContentLibraryStatus;
  usage_count: number;
  last_used_at?: string;
  created_at: string;
  updated_at: string;
};

export type ContentLibraryItemsData = {
  items: ContentLibraryItemApi[];
};

export type ContentLibraryItemPayload = {
  twitter_account_id?: number;
  bot_id?: number;
  title: string;
  item_type: ContentLibraryItemType;
  body: string;
  source_url?: string;
  topics: string[];
  growth_goal?: string;
  cta_preference?: string;
  priority: number;
  status: ContentLibraryStatus;
};

export const contentLibraryService = {
  async list(query?: { twitterAccountID?: number; botID?: number; status?: ContentLibraryStatus | ""; limit?: number }) {
    const res = await request.get<ApiResponse<ContentLibraryItemsData>>("/content-library/items", {
      params: {
        twitter_account_id: query?.twitterAccountID || undefined,
        bot_id: query?.botID || undefined,
        status: query?.status || undefined,
        limit: query?.limit || undefined,
      },
    });
    return res.data.data;
  },
  async create(payload: ContentLibraryItemPayload) {
    const res = await request.post<ApiResponse<ContentLibraryItemApi>>("/content-library/items", payload);
    return res.data.data;
  },
  async update(id: number, payload: ContentLibraryItemPayload) {
    const res = await request.put<ApiResponse<ContentLibraryItemApi>>(`/content-library/items/${id}`, payload);
    return res.data.data;
  },
  async delete(id: number) {
    await request.delete(`/content-library/items/${id}`);
  },
};
