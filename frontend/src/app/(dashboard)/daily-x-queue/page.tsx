import { redirect } from "next/navigation";

type DailyXQueuePageProps = {
  searchParams?: Promise<{ bot_id?: string }>;
};

export default async function DailyXQueuePage({ searchParams }: DailyXQueuePageProps) {
  const params = await searchParams;
  const query = new URLSearchParams({
    panel: "generate",
    legacy_source: "daily_x_queue",
  });
  if (params?.bot_id) query.set("bot_id", params.bot_id);
  redirect(`/content-drafts?${query.toString()}`);
}
