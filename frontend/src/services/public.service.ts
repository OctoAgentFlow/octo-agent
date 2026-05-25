import { request } from "@/lib/request";

type ApiResponse<T> = {
  code: number;
  message: string;
  data: T;
};

export type SiteLinksApi = {
  official_x_url: string;
  telegram_url: string;
};

export const publicService = {
  async siteLinks() {
    const res = await request.get<ApiResponse<SiteLinksApi>>("/public/site-links");
    return res.data.data;
  },
};
