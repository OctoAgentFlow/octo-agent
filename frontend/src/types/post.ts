export type PostStatus = "draft" | "scheduled" | "processing" | "published" | "failed";

export type PostItem = {
  id: number;
  user_id: number;
  x_account_id: number;
  content: string;
  status: PostStatus;
  scheduled_at?: string | null;
  published_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type PostListData = {
  items: PostItem[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
  };
};

export type PostExecuteResult = {
  post: PostItem;
  tweet_id?: string;
};
