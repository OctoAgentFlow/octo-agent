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
      daily_limit?: number;
    };
    tone: "Professional" | "Friendly" | "Degen" | "Web3-native";
    execution_mode: "manual" | "review" | "autopilot";
    safety: {
      require_approval: boolean;
      max_per_hour?: number;
      blocked_keywords: string[];
    };
  };
  last_run_at?: string;
  next_run_at?: string;
  last_scan_status?: string;
  last_scan_message?: string;
  last_scan_at?: string;
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
  recipient_segment?: AutoDMRecipientSegment | string;
  message_preview?: string;
  generation_reason?: string;
  message_variants?: AutoDMMessageVariantApi[];
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
  last_inbound_scan_at?: string;
  inbound_reply_at?: string;
  inbound_reply_event_id?: string;
  generated_at: string;
  approved_at?: string;
  blocked_at?: string;
  sent_at?: string;
  diagnostics?: AutoDMDiagnosticApi[];
};

export type AutoDMTasksData = {
  items: AutoDMTaskApi[];
};

export type AutoDMDiagnosticApi = {
  key: string;
  label: string;
  status: string;
  severity: "info" | "success" | "warning" | "error" | string;
  detail?: string;
};

export type AutoDMMessageVariantApi = {
  type: string;
  label: string;
  message: string;
};

export type AutoDMOverviewData = {
  plan_code: string;
  period_start?: string;
  period_end?: string;
  monthly_limit: number;
  monthly_used: number;
  monthly_remaining: number;
  daily_soft_limit: number;
  daily_used: number;
  daily_remaining: number;
  next_reset_at?: string;
  quota_exhausted: boolean;
  upgrade_required: boolean;
  segment_metrics?: AutoDMSegmentMetricApi[];
};

export type AutoDMSegmentMetricApi = {
  segment: AutoDMRecipientSegment | string;
  sent: number;
  failed: number;
  blocked: number;
  review: number;
  unsubscribed: number;
  replies: number;
  send_success_rate_pct: number;
  reply_rate_pct: number;
  reply_tracking_available: boolean;
};

export type AutoDMRecipientRuleApi = {
  id: number;
  x_account_id: number;
  recipient_user_id: string;
  recipient_username?: string;
  recipient_segment?: AutoDMRecipientSegment | string;
  status: "allowlisted" | "blocked" | "unsubscribed";
  unsubscribe_token?: string;
  unsubscribe_url?: string;
  source?: string;
  reason?: string;
  last_matched_at?: string;
  updated_at?: string;
};

export type AutoDMRecipientSegment = "lead" | "partner" | "community" | "investor" | "existing_user";

export type AutoDMRecipientRulesData = {
  items: AutoDMRecipientRuleApi[];
  total: number;
};

export type AutoDMRecipientRulesQuery = {
  search?: string;
  status?: AutoDMRecipientRuleApi["status"] | "";
  segment?: AutoDMRecipientSegment | "";
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

export type AutoDMRecipientImportPreviewRowApi = {
  line: number;
  recipient_user_id?: string;
  recipient_username?: string;
  recipient_segment?: AutoDMRecipientSegment | string;
  status: "ready" | "existing" | "duplicate_in_file" | "invalid" | string;
  message?: string;
};

export type AutoDMRecipientImportPreviewData = {
  valid: number;
  skipped: number;
  duplicates_in_file: number;
  existing: number;
  will_import: number;
  rows?: AutoDMRecipientImportPreviewRowApi[];
  errors?: string[];
  warnings?: string[];
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
  target_tweet_id?: string;
  target_tweet_url?: string;
  target_author_handle?: string;
  target_text?: string;
  target_category: "kol" | "founder" | "project" | "competitor" | "customer" | "media" | "analyst" | "investor" | "developer" | "community" | "ecosystem" | "partner" | "other" | string;
  priority: number;
  notes?: string;
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

export type AutoCommentBulkImportData = {
  imported: number;
  updated: number;
  skipped: number;
  items: AutoCommentTargetApi[];
  errors?: string[];
};

export type AutoCommentBulkImportPayload = {
  x_account_id: number;
  raw_handles: string;
  target_category?: string;
  priority?: number;
  notes?: string;
};

export type AutoCommentTargetSuggestionData = {
  items: Array<{
    handle: string;
    display_name?: string;
    category: string;
    priority: number;
    reason: string;
    search_query?: string;
    needs_verify: boolean;
  }>;
  target_count: number;
  target_limit: number;
  suggestion_limit: number;
};

export type AutoCommentAnalyticsData = {
  summary: {
    total_tasks: number;
    published: number;
    failed: number;
    pending: number;
    auto_commentable: number;
    manual_suggestions: number;
    quote_post_ready: number;
    restricted: number;
    average_opportunity: number;
    target_count: number;
    target_limit: number;
    monthly_scans_used: number;
    monthly_scan_limit: number;
    monthly_comments_used: number;
    monthly_comment_limit: number;
  };
  by_category: Array<{
    key: string;
    label: string;
    total: number;
    published: number;
    failed: number;
    average_opportunity: number;
  }>;
  by_target: Array<{
    key: string;
    label: string;
    total: number;
    published: number;
    failed: number;
    average_opportunity: number;
  }>;
  recent_published: Array<{
    id: number;
    target_username: string;
    target_category: string;
    comment_tweet_id: string;
    comment_url: string;
    generated_comment: string;
    sent_at?: string;
  }>;
  recent_failures: Array<{
    id: number;
    target_username: string;
    target_category: string;
    failure_category?: string;
    failure_reason?: string;
    updated_at?: string;
  }>;
  health: Array<{
    target_id: number;
    target_username: string;
    target_category: string;
    priority: number;
    status: string;
    issue_type: string;
    severity: "high" | "medium" | "low" | string;
    message: string;
    suggested_action: string;
    last_checked_at?: string;
    last_seen_tweet_at?: string;
    last_failure_reason?: string;
    average_opportunity: number;
    failed_count: number;
    total_tasks: number;
  }>;
};

export type AutoCommentTaskApi = {
  id: number;
  bot_id: number;
  x_account_id: number;
  target_id: number;
  target_user_id?: string;
  target_username: string;
  target_tweet_id: string;
  target_tweet_text?: string;
  target_tweet_author?: string;
  generated_comment?: string;
  feedback_signal_count?: number;
  feedback_signal_summary?: {
    count: number;
    scenes: string[];
    issue_tags: string[];
    latest_comment?: string;
    applied_learning_rules?: Array<{
      issue: string;
      confidence: number;
      accurate_judgments: number;
      instruction: string;
      evidence?: string[];
      preference_status?: string;
    }>;
  };
  opportunity_score: number;
  generation_reason?: string;
  matched_keywords?: string[];
  referenced_content?: string[];
  source_type?: string;
  source_ref?: string;
  source_region?: string;
  comment_variants?: Array<{
    type: "professional_view" | "engagement_question" | "soft_cta" | string;
    label: string;
    comment: string;
  }>;
  delivery_mode?: "auto_comment" | "manual_comment" | "quote_post" | "skip" | "inbound_handoff" | string;
  delivery_reason?: string;
  api_reply_eligible?: boolean;
  api_reply_block_reason?: string;
  manual_action_url?: string;
  quote_post_candidate?: string;
  status: "draft" | "review" | "pending_review" | "approved" | "ready_to_publish" | "processing" | "published" | "rejected" | "sending" | "blocked" | "failed" | "sent" | "handled" | "skipped";
  risk_level: "low" | "medium" | "high" | string;
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

export type AutoCommentFeedbackPayload = {
  rating: "positive" | "negative";
  issue_tags: string[];
  comment?: string;
};

export type AutoCommentTasksData = {
  items: AutoCommentTaskApi[];
};

export type AutoReplyDraftApi = {
  id: number;
  bot_id: number;
  x_account_id: number;
  comment_tweet_id?: string;
  comment_url?: string;
  comment_author_handle: string;
  root_tweet_text?: string;
  comment_text: string;
  generated_reply?: string;
  feedback_signal_count?: number;
  feedback_signal_summary?: {
    count: number;
    scenes: string[];
    issue_tags: string[];
    latest_comment?: string;
    applied_learning_rules?: Array<{
      issue: string;
      confidence: number;
      accurate_judgments: number;
      instruction: string;
      evidence?: string[];
      preference_status?: string;
    }>;
  };
  status: "draft" | "review" | "pending_review" | "approved" | "ready_to_publish" | "processing" | "published" | "rejected" | "failed" | "sent";
  risk_level: "low" | "medium" | "high" | string;
  capability_status: string;
  failure_category?: string;
  failure_reason?: string;
  approval_required: boolean;
  activity_log_id?: number;
  created_at: string;
  generated_at?: string;
  approved_at?: string;
  rejected_at?: string;
  sent_at?: string;
};

export type AutoReplyDraftsData = {
  items: AutoReplyDraftApi[];
};

export type AutoCommentTargetPayload = {
  x_account_id: number;
  target_tweet_url: string;
  target_tweet_id?: string;
  target_author_handle: string;
  target_text: string;
  target_category?: string;
  priority?: number;
  notes?: string;
};

export type AutoReplyDraftPayload = {
  x_account_id: number;
  comment_author_handle: string;
  root_tweet_text?: string;
  comment_text: string;
  comment_url?: string;
  comment_tweet_id?: string;
};

export type AutomationSavePayload = {
  enabled: boolean;
  frequency: {
    interval_minutes: number;
    daily_limit?: number;
  };
  tone: "Professional" | "Friendly" | "Degen" | "Web3-native";
  execution_mode?: "manual" | "review" | "autopilot";
  safety: {
    require_approval: boolean;
    max_per_hour?: number;
    blocked_keywords: string[];
  };
};

export const automationService = {
  async list() {
    const res = await request.get<ApiResponse<AutomationsData>>("/automations");
    return res.data.data;
  },
  async update(type: "post" | "reply" | "dm" | "comment", payload: AutomationSavePayload) {
    const { frequency, safety, ...rest } = payload;
    const body: AutomationSavePayload = {
      ...rest,
      frequency: {
        interval_minutes: frequency.interval_minutes,
      },
      safety: {
        require_approval: safety.require_approval,
        blocked_keywords: safety.blocked_keywords,
      },
    };
    const res = await request.put<ApiResponse<AutomationModuleApi>>(`/automations/${type}`, body);
    return res.data.data;
  },
  async toggle(type: "post" | "reply" | "dm" | "comment", enabled: boolean) {
    const res = await request.post<ApiResponse<AutomationModuleApi>>(`/automations/${type}/toggle`, { enabled });
    return res.data.data;
  },
  async updateExecutionMode(type: "post" | "reply" | "dm" | "comment", executionMode: "manual" | "review" | "autopilot") {
    const res = await request.patch<ApiResponse<AutomationModuleApi>>(`/automations/${type}/execution-mode`, {
      execution_mode: executionMode,
    });
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
  async dmOverview() {
    const res = await request.get<ApiResponse<AutoDMOverviewData>>("/auto-dm/overview");
    return res.data.data;
  },
  async dmRecipients(query?: AutoDMRecipientRulesQuery) {
    const params = {
      search: query?.search || undefined,
      status: query?.status || undefined,
      segment: query?.segment || undefined,
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
  async previewDMRecipientImport(csv: string, xAccountID?: number) {
    const res = await request.post<ApiResponse<AutoDMRecipientImportPreviewData>>("/auto-dm/recipients/import/preview", {
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
  async updateDMTaskMessage(id: number, messagePreview: string) {
    const res = await request.patch<ApiResponse<AutoDMTaskApi>>(`/auto-dm/tasks/${id}`, { message_preview: messagePreview });
    return res.data.data;
  },
  async retryDMTask(id: number) {
    const res = await request.post<ApiResponse<AutoDMTaskApi>>(`/auto-dm/tasks/${id}/retry`);
    return res.data.data;
  },
  async deleteDMTask(id: number) {
    await request.delete(`/auto-dm/tasks/${id}`);
  },
  async setDMRecipientRule(id: number, status: AutoDMRecipientRuleApi["status"], reason: string, segment?: AutoDMRecipientSegment) {
    const res = await request.post<ApiResponse<AutoDMRecipientRuleApi>>(`/auto-dm/tasks/${id}/recipient-rule`, { status, reason, recipient_segment: segment });
    return res.data.data;
  },
  async updateDMRecipientRule(id: number, status: AutoDMRecipientRuleApi["status"], reason: string, segment?: AutoDMRecipientSegment) {
    const res = await request.patch<ApiResponse<AutoDMRecipientRuleApi>>(`/auto-dm/recipient-rules/${id}`, { status, reason, recipient_segment: segment });
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
  async createCommentTweetTarget(payload: AutoCommentTargetPayload) {
    const res = await request.post<ApiResponse<AutoCommentTargetApi>>("/auto-comments/targets", payload);
    return res.data.data;
  },
  async bulkImportCommentTargets(payload: AutoCommentBulkImportPayload) {
    const res = await request.post<ApiResponse<AutoCommentBulkImportData>>("/auto-comments/targets/bulk-import", payload);
    return res.data.data;
  },
  async suggestCommentTargets(xAccountID: number) {
    const res = await request.post<ApiResponse<AutoCommentTargetSuggestionData>>("/auto-comments/targets/suggest", {
      x_account_id: xAccountID,
    });
    return res.data.data;
  },
  async generateCommentDraft(targetID: number) {
    const res = await request.post<ApiResponse<AutoCommentTaskApi>>(`/auto-comments/targets/${targetID}/generate`, {});
    return res.data.data;
  },
  async updateCommentTargetStatus(id: number, status: AutoCommentTargetApi["status"]) {
    const res = await request.patch<ApiResponse<AutoCommentTargetApi>>(`/auto-comments/targets/${id}`, { status });
    return res.data.data;
  },
  async deleteCommentTarget(id: number) {
    await request.delete(`/auto-comments/targets/${id}`);
  },
  async commentTasks() {
    const res = await request.get<ApiResponse<AutoCommentTasksData>>("/auto-comment/tasks");
    return res.data.data;
  },
  async commentDrafts(query?: { pageSize?: number }) {
    const res = await request.get<ApiResponse<AutoCommentTasksData>>("/auto-comments/drafts", {
      params: { page_size: query?.pageSize || 200 },
    });
    return res.data.data;
  },
  async commentAnalytics() {
    const res = await request.get<ApiResponse<AutoCommentAnalyticsData>>("/auto-comments/analytics");
    return res.data.data;
  },
  async approveCommentTask(id: number) {
    const res = await request.post<ApiResponse<AutoCommentTaskApi>>(`/auto-comments/drafts/${id}/approve`);
    return res.data.data;
  },
  async queueCommentQuotePost(id: number) {
    const res = await request.post<ApiResponse<AutoCommentTaskApi>>(`/auto-comments/drafts/${id}/quote-post`);
    return res.data.data;
  },
  async updateCommentDraft(id: number, generatedComment: string) {
    const res = await request.patch<ApiResponse<AutoCommentTaskApi>>(`/auto-comments/drafts/${id}`, {
      generated_comment: generatedComment,
    });
    return res.data.data;
  },
  async rewriteCommentDraft(id: number, payload: { rewrite_mode: string; feedback?: string; disabled_learning_issues?: string[] }) {
    const res = await request.post<ApiResponse<AutoCommentTaskApi>>(`/auto-comments/drafts/${id}/rewrite`, payload);
    return res.data.data;
  },
  async deleteCommentDraft(id: number) {
    await request.delete(`/auto-comments/drafts/${id}`);
  },
  async createCommentFeedback(id: number, payload: AutoCommentFeedbackPayload) {
    const res = await request.post<ApiResponse<unknown>>(`/auto-comments/drafts/${id}/feedback`, payload);
    return res.data.data;
  },
  async rejectCommentDraft(id: number, reason: string) {
    const res = await request.post<ApiResponse<AutoCommentTaskApi>>(`/auto-comments/drafts/${id}/reject`, { reason });
    return res.data.data;
  },
  async markCommentHandled(id: number) {
    const res = await request.post<ApiResponse<AutoCommentTaskApi>>(`/auto-comments/drafts/${id}/handled`, {});
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
  async replyDrafts(query?: { pageSize?: number }) {
    const res = await request.get<ApiResponse<AutoReplyDraftsData>>("/auto-replies/drafts", {
      params: { page_size: query?.pageSize },
    });
    return res.data.data;
  },
  async generateReplyDraft(payload: AutoReplyDraftPayload) {
    const res = await request.post<ApiResponse<AutoReplyDraftApi>>("/auto-replies/drafts/generate", payload);
    return res.data.data;
  },
  async updateReplyDraft(id: number, generatedReply: string) {
    const res = await request.patch<ApiResponse<AutoReplyDraftApi>>(`/auto-replies/drafts/${id}`, {
      generated_reply: generatedReply,
    });
    return res.data.data;
  },
  async rewriteReplyDraft(id: number, payload: { rewrite_mode: string; feedback?: string; disabled_learning_issues?: string[] }) {
    const res = await request.post<ApiResponse<AutoReplyDraftApi>>(`/auto-replies/drafts/${id}/rewrite`, payload);
    return res.data.data;
  },
  async approveReplyDraft(id: number) {
    const res = await request.post<ApiResponse<AutoReplyDraftApi>>(`/auto-replies/drafts/${id}/approve`);
    return res.data.data;
  },
  async rejectReplyDraft(id: number, reason: string) {
    const res = await request.post<ApiResponse<AutoReplyDraftApi>>(`/auto-replies/drafts/${id}/reject`, { reason });
    return res.data.data;
  },
  async retryReplyDraft(id: number) {
    const res = await request.post<ApiResponse<AutoReplyDraftApi>>(`/auto-replies/drafts/${id}/retry`);
    return res.data.data;
  },
};
