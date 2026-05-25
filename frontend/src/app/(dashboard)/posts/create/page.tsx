import { PostCreateClient } from "@/components/posts/post-create-client";

type CreatePostPageProps = {
  searchParams?: Promise<{ source?: string }>;
};

export default async function CreatePostPage({ searchParams }: CreatePostPageProps) {
  const params = await searchParams;
  return <PostCreateClient source={params?.source === "auto_post" ? "auto_post" : undefined} />;
}
