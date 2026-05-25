import { request } from "@/lib/request";

type ApiResponse<T> = {
  code: number;
  message: string;
  data: T;
};

export type ReferralInfoApi = {
  code: string;
  invite_link: string;
  use_count: number;
  signup_inviter_points: number;
  signup_invitee_points: number;
  first_purchase_points: number;
};

export const referralService = {
  async info() {
    const res = await request.get<ApiResponse<ReferralInfoApi>>("/referrals/me");
    return res.data.data;
  },
};
