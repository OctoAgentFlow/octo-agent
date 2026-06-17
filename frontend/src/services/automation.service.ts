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

export type AutoDMPreferenceData = {
  recipient_username?: string;
  status: string;
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
  async getDMPreference(token: string) {
    const res = await request.get<ApiResponse<AutoDMPreferenceData>>(`/auto-dm/unsubscribe/${token}`);
    return res.data.data;
  },
  async unsubscribeDM(token: string) {
    const res = await request.post<ApiResponse<AutoDMPreferenceData>>(`/auto-dm/unsubscribe/${token}`);
    return res.data.data;
  },
};
