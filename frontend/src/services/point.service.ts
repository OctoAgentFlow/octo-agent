import { request } from "@/lib/request";

type ApiResponse<T> = {
  code: number;
  message: string;
  data: T;
};

export type PointAccountApi = {
  balance: number;
  frozen: number;
  lifetime_earned: number;
  lifetime_spent: number;
  exchange_rate: string;
};

export type PointActivityApi = {
  code: string;
  title: string;
  description: string;
  points: number;
  claimed: boolean;
  claimable: boolean;
};

export type PointLedgerApi = {
  id: string;
  event_type: string;
  activity_code?: string;
  order_id?: string;
  points: number;
  balance_after: number;
  frozen_after: number;
  created_at: string;
  details?: string;
};

export type PointCenterApi = {
  account: PointAccountApi;
  activities: PointActivityApi[];
  ledger: PointLedgerApi[];
};

export const pointService = {
  async center() {
    const res = await request.get<ApiResponse<PointCenterApi>>("/points/center");
    return res.data.data;
  },
  async claim(activityCode: string) {
    const res = await request.post<ApiResponse<PointCenterApi>>("/points/claim", {
      activity_code: activityCode,
    });
    return res.data.data;
  },
  async redeem(code: string) {
    const res = await request.post<ApiResponse<PointCenterApi>>("/points/redeem", { code });
    return res.data.data;
  },
};
