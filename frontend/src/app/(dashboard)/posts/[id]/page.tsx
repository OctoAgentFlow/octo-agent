"use client";

import { useParams } from "next/navigation";

import { PostDetailClient } from "@/components/posts/post-detail-client";
import { Card, CardHeader } from "@/components/ui/card";
import { useT } from "@/i18n/use-t";

export default function PostDetailPage() {
  const params = useParams();
  const { t } = useT();
  const raw = params.id;
  const id = typeof raw === "string" ? Number(raw) : Number(Array.isArray(raw) ? raw[0] : raw);

  if (!Number.isFinite(id) || id <= 0) {
    return (
      <Card>
        <CardHeader title={t("posts.list.error")} description="Invalid post id." />
      </Card>
    );
  }

  return <PostDetailClient postId={id} />;
}
