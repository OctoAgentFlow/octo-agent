import { request } from "@/lib/request";

type ApiResponse<T> = {
  code: number;
  message: string;
  data: T;
};

export type AutoPostExecutionMode = "manual" | "review" | "autopilot";
export type AutoPostLengthMode = "standard" | "long";

export type AutoPostPlanApi = {
  id: number;
  user_id: number;
  x_account_id: number;
  bot_id: number;
  account_handle?: string;
  bot_name?: string;
  enabled: boolean;
  execution_mode: AutoPostExecutionMode;
  /** Deprecated: retained for old API responses; monthly plan quota is enforced instead. */
  daily_limit?: number;
  min_interval_minutes: number;
  posting_windows?: string;
  timezone: string;
  content_length_mode: AutoPostLengthMode;
  last_run_at?: string;
  next_run_at?: string;
  processing_at?: string;
  created_at: string;
  updated_at: string;
};

export type AutoPostDraftApi = {
  id: number;
  user_id: number;
  plan_id: number;
  bot_id: number;
  x_account_id: number;
  content_library_item_id?: number;
  content_title?: string;
  bot_name?: string;
  account_handle?: string;
  content_direction?: string;
  content_hash?: string;
  generated_content: string;
  status: "draft" | "pending_review" | "approved" | "ready_to_publish" | "published" | "rejected" | "failed";
  risk_level: string;
  capability_status: string;
  failure_category?: string;
  failure_reason?: string;
  approval_required: boolean;
  activity_log_id?: number;
  created_at: string;
  generated_at?: string;
  approved_at?: string;
  rejected_at?: string;
  published_at?: string;
};

export type AutoPostPlansData = {
  items: AutoPostPlanApi[];
};

export type AutoPostDraftsData = {
  items: AutoPostDraftApi[];
};

export type AutoPostGenerationRunApi = {
  id: number;
  user_id: number;
  plan_id: number;
  x_account_id: number;
  account_handle?: string;
  bot_id: number;
  bot_name?: string;
  content_library_item_id?: number;
  content_title?: string;
  content_library_item_title?: string;
  status: "completed" | "skipped" | "failed";
  skip_reason?: string;
  generated_draft_id?: number;
  error_message?: string;
  created_at: string;
};

export type AutoPostGenerationRunsData = {
  items: AutoPostGenerationRunApi[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
  };
};

export type AutoPostGenerationRunQuery = {
  status?: AutoPostGenerationRunApi["status"] | "all";
  xAccountID?: number;
  range?: "all" | "24h" | "7d" | "30d";
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
};

export type AutoPostPlanPayload = {
  x_account_id: number;
  enabled: boolean;
  execution_mode: AutoPostExecutionMode;
  min_interval_minutes: number;
  posting_windows: string;
  timezone: string;
  content_length_mode: AutoPostLengthMode;
};

export const autoPostService = {
  async plans() {
    const res = await request.get<ApiResponse<AutoPostPlansData>>("/auto-post/plans");
    return res.data.data;
  },
  async createPlan(payload: AutoPostPlanPayload) {
    const res = await request.post<ApiResponse<AutoPostPlanApi>>("/auto-post/plans", payload);
    return res.data.data;
  },
  async updatePlan(id: number, payload: AutoPostPlanPayload) {
    const res = await request.put<ApiResponse<AutoPostPlanApi>>(`/auto-post/plans/${id}`, payload);
    return res.data.data;
  },
  async generateDraft(planID: number, contentDirection: string, contentLibraryItemID?: number) {
    const res = await request.post<ApiResponse<AutoPostDraftApi>>(`/auto-post/plans/${planID}/generate`, {
      content_direction: contentDirection,
      content_library_item_id: contentLibraryItemID || 0,
    });
    return res.data.data;
  },
  async drafts() {
    const res = await request.get<ApiResponse<AutoPostDraftsData>>("/auto-post/drafts");
    return res.data.data;
  },
  async runs(query?: AutoPostGenerationRunQuery) {
    const res = await request.get<ApiResponse<AutoPostGenerationRunsData>>("/auto-post/runs", {
      params: {
        status: query?.status && query.status !== "all" ? query.status : undefined,
        x_account_id: query?.xAccountID || undefined,
        range: query?.range && query.range !== "all" ? query.range : undefined,
        date_from: query?.dateFrom || undefined,
        date_to: query?.dateTo || undefined,
        page: query?.page || 1,
        page_size: query?.pageSize || 20,
      },
    });
    return res.data.data;
  },
  async runNow(planID: number) {
    const res = await request.post<ApiResponse<AutoPostGenerationRunApi>>(`/auto-post/plans/${planID}/run-now`);
    return res.data.data;
  },
  async updateDraft(id: number, generatedContent: string) {
    const res = await request.patch<ApiResponse<AutoPostDraftApi>>(`/auto-post/drafts/${id}`, {
      generated_content: generatedContent,
    });
    return res.data.data;
  },
  async approveDraft(id: number) {
    const res = await request.post<ApiResponse<AutoPostDraftApi>>(`/auto-post/drafts/${id}/approve`);
    return res.data.data;
  },
  async preparePublish(id: number) {
    const res = await request.post<ApiResponse<AutoPostDraftApi>>(`/auto-post/drafts/${id}/prepare-publish`);
    return res.data.data;
  },
  async rejectDraft(id: number, reason: string) {
    const res = await request.post<ApiResponse<AutoPostDraftApi>>(`/auto-post/drafts/${id}/reject`, { reason });
    return res.data.data;
  },
};
