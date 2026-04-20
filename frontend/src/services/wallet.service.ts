import { request } from "@/lib/request";

type ApiResponse<T> = {
  code: number;
  message: string;
  data: T;
};

type WalletChallengeData = {
  challenge_id: string;
  message: string;
  nonce: string;
  expired_at: string;
};

export const walletService = {
  async createChallenge(payload: { address: string; chain_id: number }) {
    const res = await request.post<ApiResponse<WalletChallengeData>>("/wallet/challenge", payload);
    return res.data.data;
  },
  async bind(payload: { challenge_id: string; address: string; signature: string; chain_id: number }) {
    const res = await request.post<ApiResponse<{ wallet_address: string; bound_at: string }>>("/wallet/bind", payload);
    return res.data.data;
  },
  async unbind(payload: { address: string; chain_id: number }) {
    const res = await request.delete<ApiResponse<Record<string, never>>>("/wallet/bind", { data: payload });
    return res.data.data;
  },
};
