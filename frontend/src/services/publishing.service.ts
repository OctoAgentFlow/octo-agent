import { request } from "@/lib/request";

type ApiResponse<T> = {
  code: number;
  message: string;
  data: T;
};

export type PublishJobApi = {
  id: number;
  user_id: number;
  twitter_account_id: number;
  bot_id: number;
  source_type: "post" | "comment" | "reply" | "dm";
  source_id: number;
  content: string;
  status: "pending" | "processing" | "published" | "failed" | "cancelled";
  execution_mode: string;
  publish_mode: "simulated" | "dry_run" | "real" | "";
  attempt_count: number;
  max_attempts: number;
  next_attempt_at?: string;
  last_error?: string;
  external_id?: string;
  external_url?: string;
  raw_response?: string;
  published_at?: string;
  created_at: string;
  updated_at: string;
};

export type PublishJobsData = {
  items: PublishJobApi[];
  settings: {
    real_publish_enabled: boolean;
    manual_publish_enabled: boolean;
    per_account_daily_limit: number;
    per_account_min_interval_seconds: number;
    dry_run: boolean;
  };
};

export const publishingService = {
  async jobs() {
    const res = await request.get<ApiResponse<PublishJobsData>>("/publishing/jobs");
    return res.data.data;
  },
  async retry(id: number) {
    const res = await request.post<ApiResponse<PublishJobApi>>(`/publishing/jobs/${id}/retry`);
    return res.data.data;
  },
  async cancel(id: number) {
    const res = await request.post<ApiResponse<PublishJobApi>>(`/publishing/jobs/${id}/cancel`);
    return res.data.data;
  },
  async publishNow(id: number) {
    const res = await request.post<ApiResponse<PublishJobApi>>(`/publishing/jobs/${id}/publish-now`);
    return res.data.data;
  },
};
