import { request } from "@/lib/request";
import type { OAFBot } from "@/types/oaf-bot";
import type { ContentLibraryItemApi } from "@/services/content-library.service";
import type { AutoPostDraftApi } from "@/services/content-drafts.service";

type ApiResponse<T> = {
  code: number;
  message: string;
  data: T;
};

export type DailyXQueueContextApi = {
  id: number;
  x_handle: string;
  website_url?: string;
  product_context?: string;
  target_audience?: string;
  voice_preference?: string;
  guardrails?: string;
  bot_id: number;
  content_library_id: number;
  activated: boolean;
};

export type DailyXQueueDraftApi = AutoPostDraftApi & {
  why_generated: string;
  source_used: string;
  copied_count: number;
};

export type DailyXQueueRunItemApi = {
  id: number;
  run_id: number;
  draft_id: number;
  item_type: string;
  status: string;
  content_direction?: string;
  created_at: string;
};

export type DailyXQueueRunApi = {
  id: number;
  status: string;
  draft_count: number;
  review_actions_count: number;
  approved_or_copied_count: number;
  learning_applied_count: number;
  started_at: string;
  completed_at?: string;
  items: DailyXQueueRunItemApi[];
};

export type DailyXQueueOverviewApi = {
  context?: DailyXQueueContextApi;
  bot?: OAFBot;
  source_material?: ContentLibraryItemApi;
  drafts: DailyXQueueDraftApi[];
  latest_run?: DailyXQueueRunApi;
  review_actions_count: number;
  approved_or_copied_count: number;
  activated: boolean;
  learning_applied_count: number;
  learning_summary?: string;
};

export type DailyXQueueSetupPayload = {
  bot_id?: number;
  x_handle: string;
  website_url?: string;
  product_context?: string;
  target_audience?: string;
  voice_preference?: string;
  guardrails?: string;
};

export type DailyXQueueSourcePayload = {
  title: string;
  body: string;
  source_url?: string;
  topics?: string[];
  growth_goal?: string;
  cta_preference?: string;
};

export type DailyXQueueSetupApi = {
  context: DailyXQueueContextApi;
  bot: OAFBot;
};

export type DailyXQueueSourceApi = {
  context: DailyXQueueContextApi;
  source_material: ContentLibraryItemApi;
};

export type DailyXQueueGenerateApi = {
  context: DailyXQueueContextApi;
  drafts: DailyXQueueDraftApi[];
  run?: DailyXQueueRunApi;
  learning_applied_count: number;
  learning_summary?: string;
};

export type DailyXQueueActionApi = {
  draft: DailyXQueueDraftApi;
  review_actions_count: number;
  approved_or_copied_count: number;
  activated: boolean;
  message?: string;
};

export const dailyXQueueService = {
  async overview() {
    const res = await request.get<ApiResponse<DailyXQueueOverviewApi>>("/daily-x-queue/overview");
    return res.data.data;
  },
  async setup(payload: DailyXQueueSetupPayload) {
    const res = await request.post<ApiResponse<DailyXQueueSetupApi>>("/daily-x-queue/setup", payload);
    return res.data.data;
  },
  async saveSourceMaterial(payload: DailyXQueueSourcePayload) {
    const res = await request.post<ApiResponse<DailyXQueueSourceApi>>("/daily-x-queue/source-material", payload);
    return res.data.data;
  },
  async importWebsiteSource(sourceUrl: string) {
    const res = await request.post<ApiResponse<DailyXQueueSourceApi>>("/daily-x-queue/source-material/import-url", {
      source_url: sourceUrl,
    });
    return res.data.data;
  },
  async selectSourceMaterial(contentLibraryID: number) {
    const res = await request.post<ApiResponse<DailyXQueueSourceApi>>("/daily-x-queue/source-material/select", {
      content_library_id: contentLibraryID,
    });
    return res.data.data;
  },
  async generate() {
    const res = await request.post<ApiResponse<DailyXQueueGenerateApi>>("/daily-x-queue/generate", {});
    return res.data.data;
  },
  async updateDraft(id: number, generatedContent: string) {
    const res = await request.patch<ApiResponse<DailyXQueueActionApi>>(`/daily-x-queue/drafts/${id}`, {
      generated_content: generatedContent,
    });
    return res.data.data;
  },
  async approveDraft(id: number) {
    const res = await request.post<ApiResponse<DailyXQueueActionApi>>(`/daily-x-queue/drafts/${id}/approve`, {});
    return res.data.data;
  },
  async rejectDraft(id: number, reason: string) {
    const res = await request.post<ApiResponse<DailyXQueueActionApi>>(`/daily-x-queue/drafts/${id}/reject`, { reason });
    return res.data.data;
  },
  async rewriteDraft(id: number, rewriteMode: string, feedback?: string) {
    const res = await request.post<ApiResponse<DailyXQueueActionApi>>(`/daily-x-queue/drafts/${id}/rewrite`, {
      rewrite_mode: rewriteMode,
      feedback,
    });
    return res.data.data;
  },
  async copyDraft(id: number) {
    const res = await request.post<ApiResponse<DailyXQueueActionApi>>(`/daily-x-queue/drafts/${id}/copy`, {});
    return res.data.data;
  },
};
