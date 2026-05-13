import { request } from "@/lib/request";

type ApiResponse<T> = {
  code: number;
  message: string;
  data: T;
};

export type AutomationModuleApi = {
  type: "post" | "reply" | "dm" | "comment";
  name: string;
  state: "Running" | "Queued" | "Paused" | "Needs Review";
  config: {
    enabled: boolean;
    frequency: {
      interval_minutes: number;
      daily_limit: number;
    };
    tone: "Professional" | "Friendly" | "Degen" | "Web3-native";
    safety: {
      require_approval: boolean;
      max_per_hour: number;
      blocked_keywords: string[];
    };
  };
  last_run_at?: string;
  next_run_at?: string;
  executed_today: number;
  reply_usage?: {
    today_count: number;
    daily_limit: number;
    remaining_today: number;
    last_executed_at?: string;
  };
};

export type AutomationsData = {
  modules: AutomationModuleApi[];
};

export type AutomationRuntimeStatusApi = {
  queue_depth: number;
  last_success_at: string;
  retries_last_24h: number;
  needs_review: number;
};

export type AutoDMTaskApi = {
  id: number;
  x_account_id?: number;
  account_handle: string;
  recipient_source: string;
  recipient_user_id?: string;
  recipient_username?: string;
  message_preview?: string;
  status: "review" | "approved" | "sending" | "blocked" | "failed" | "sent";
  capability_status: string;
  failure_category?: string;
  failure_reason?: string;
  retryable: boolean;
  retry_after_at?: string;
  attempt_count: number;
  last_attempt_at?: string;
  approval_required: boolean;
  activity_log_id?: number;
  dm_conversation_id?: string;
  dm_event_id?: string;
  generated_at: string;
  approved_at?: string;
  blocked_at?: string;
  sent_at?: string;
};

export type AutoDMTasksData = {
  items: AutoDMTaskApi[];
};

export type AutoDMRecipientRuleApi = {
  id: number;
  x_account_id: number;
  recipient_user_id: string;
  recipient_username?: string;
  status: "allowlisted" | "blocked" | "unsubscribed";
  unsubscribe_token?: string;
  unsubscribe_url?: string;
  source?: string;
  reason?: string;
  last_matched_at?: string;
  updated_at?: string;
};

export type AutoDMRecipientRulesData = {
  items: AutoDMRecipientRuleApi[];
  total: number;
};

export type AutoDMRecipientRulesQuery = {
  search?: string;
  status?: AutoDMRecipientRuleApi["status"] | "";
  xAccountID?: number;
  limit?: number;
};

export type AutoDMRecipientImportData = {
  imported: number;
  skipped: number;
  batch?: AutoDMRecipientImportApi;
  items: AutoDMRecipientRuleApi[];
  errors?: string[];
};

export type AutoDMRecipientImportApi = {
  id: number;
  x_account_id: number;
  source: string;
  imported: number;
  skipped: number;
  errors?: string[];
  imported_at: string;
};

export type AutoDMRecipientImportsData = {
  items: AutoDMRecipientImportApi[];
};

export type AutoDMRecipientBulkUpdateData = {
  updated: number;
  items: AutoDMRecipientRuleApi[];
};

export type AutoDMPreferenceData = {
  recipient_username?: string;
  status: string;
};

export type AutoCommentTargetApi = {
  id: number;
  x_account_id: number;
  target_user_id?: string;
  target_username: string;
  target_display_name?: string;
  status: "active" | "paused";
  last_seen_tweet_id?: string;
  last_seen_tweet_at?: string;
  last_checked_at?: string;
  last_commented_at?: string;
  last_failure_reason?: string;
  resolved_at?: string;
};

export type AutoCommentTargetsData = {
  items: AutoCommentTargetApi[];
};

export type AutoCommentTaskApi = {
  id: number;
  x_account_id: number;
  target_id: number;
  target_user_id?: string;
  target_username: string;
  target_tweet_id: string;
  target_tweet_text?: string;
  target_tweet_author?: string;
  generated_comment?: string;
  status: "review" | "approved" | "sending" | "blocked" | "failed" | "sent";
  capability_status: string;
  failure_category?: string;
  failure_reason?: string;
  retryable: boolean;
  retry_after_at?: string;
  attempt_count: number;
  last_attempt_at?: string;
  approval_required: boolean;
  activity_log_id?: number;
  comment_tweet_id?: string;
  detected_at: string;
  generated_at?: string;
  approved_at?: string;
  blocked_at?: string;
  sent_at?: string;
};

export type AutoCommentTasksData = {
  items: AutoCommentTaskApi[];
};

export type AutomationSavePayload = {
  enabled: boolean;
  frequency: {
    interval_minutes: number;
    daily_limit: number;
  };
  tone: "Professional" | "Friendly" | "Degen" | "Web3-native";
  safety: {
    require_approval: boolean;
    max_per_hour: number;
    blocked_keywords: string[];
  };
};

export const automationService = {
  async list() {
    const res = await request.get<ApiResponse<AutomationsData>>("/automations");
    return res.data.data;
  },
  async update(type: "post" | "reply" | "dm" | "comment", payload: AutomationSavePayload) {
    const res = await request.put<ApiResponse<AutomationModuleApi>>(`/automations/${type}`, payload);
    return res.data.data;
  },
  async toggle(type: "post" | "reply" | "dm" | "comment", enabled: boolean) {
    const res = await request.post<ApiResponse<AutomationModuleApi>>(`/automations/${type}/toggle`, { enabled });
    return res.data.data;
  },
  async runtimeStatus() {
    const res = await request.get<ApiResponse<AutomationRuntimeStatusApi>>("/automations/runtime-status");
    return res.data.data;
  },
  async dmTasks() {
    const res = await request.get<ApiResponse<AutoDMTasksData>>("/auto-dm/tasks");
    return res.data.data;
  },
  async dmRecipients(query?: AutoDMRecipientRulesQuery) {
    const params = {
      search: query?.search || undefined,
      status: query?.status || undefined,
      x_account_id: query?.xAccountID || undefined,
      limit: query?.limit || undefined,
    };
    const res = await request.get<ApiResponse<AutoDMRecipientRulesData>>("/auto-dm/recipients", { params });
    return res.data.data;
  },
  async dmRecipientImports() {
    const res = await request.get<ApiResponse<AutoDMRecipientImportsData>>("/auto-dm/recipients/imports");
    return res.data.data;
  },
  async importDMRecipients(csv: string, xAccountID?: number) {
    const res = await request.post<ApiResponse<AutoDMRecipientImportData>>("/auto-dm/recipients/import", {
      csv,
      x_account_id: xAccountID || 0,
    });
    return res.data.data;
  },
  async approveDMTask(id: number) {
    const res = await request.post<ApiResponse<AutoDMTaskApi>>(`/auto-dm/tasks/${id}/approve`);
    return res.data.data;
  },
  async blockDMTask(id: number, reason: string) {
    const res = await request.post<ApiResponse<AutoDMTaskApi>>(`/auto-dm/tasks/${id}/block`, { reason });
    return res.data.data;
  },
  async retryDMTask(id: number) {
    const res = await request.post<ApiResponse<AutoDMTaskApi>>(`/auto-dm/tasks/${id}/retry`);
    return res.data.data;
  },
  async setDMRecipientRule(id: number, status: AutoDMRecipientRuleApi["status"], reason: string) {
    const res = await request.post<ApiResponse<AutoDMRecipientRuleApi>>(`/auto-dm/tasks/${id}/recipient-rule`, { status, reason });
    return res.data.data;
  },
  async updateDMRecipientRule(id: number, status: AutoDMRecipientRuleApi["status"], reason: string) {
    const res = await request.patch<ApiResponse<AutoDMRecipientRuleApi>>(`/auto-dm/recipient-rules/${id}`, { status, reason });
    return res.data.data;
  },
  async bulkUpdateDMRecipientRules(ids: number[], status: AutoDMRecipientRuleApi["status"], reason: string) {
    const res = await request.post<ApiResponse<AutoDMRecipientBulkUpdateData>>("/auto-dm/recipient-rules/bulk", { ids, status, reason });
    return res.data.data;
  },
  async getDMPreference(token: string) {
    const res = await request.get<ApiResponse<AutoDMPreferenceData>>(`/auto-dm/unsubscribe/${token}`);
    return res.data.data;
  },
  async unsubscribeDM(token: string) {
    const res = await request.post<ApiResponse<AutoDMPreferenceData>>(`/auto-dm/unsubscribe/${token}`);
    return res.data.data;
  },
  async commentTargets() {
    const res = await request.get<ApiResponse<AutoCommentTargetsData>>("/auto-comment/targets");
    return res.data.data;
  },
  async createCommentTarget(targetUsername: string, xAccountID?: number) {
    const res = await request.post<ApiResponse<AutoCommentTargetApi>>("/auto-comment/targets", {
      target_username: targetUsername,
      x_account_id: xAccountID || 0,
    });
    return res.data.data;
  },
  async updateCommentTargetStatus(id: number, status: AutoCommentTargetApi["status"]) {
    const res = await request.patch<ApiResponse<AutoCommentTargetApi>>(`/auto-comment/targets/${id}`, { status });
    return res.data.data;
  },
  async deleteCommentTarget(id: number) {
    await request.delete(`/auto-comment/targets/${id}`);
  },
  async commentTasks() {
    const res = await request.get<ApiResponse<AutoCommentTasksData>>("/auto-comment/tasks");
    return res.data.data;
  },
  async approveCommentTask(id: number) {
    const res = await request.post<ApiResponse<AutoCommentTaskApi>>(`/auto-comment/tasks/${id}/approve`);
    return res.data.data;
  },
  async blockCommentTask(id: number, reason: string) {
    const res = await request.post<ApiResponse<AutoCommentTaskApi>>(`/auto-comment/tasks/${id}/block`, { reason });
    return res.data.data;
  },
  async retryCommentTask(id: number) {
    const res = await request.post<ApiResponse<AutoCommentTaskApi>>(`/auto-comment/tasks/${id}/retry`);
    return res.data.data;
  },
};
