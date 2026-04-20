"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";

import type { ActivityRange, ActivityRecord, ActivityStatus, ActivityType } from "@/types/activity";
import { activityService } from "@/services/activity.service";
import {
  broadcastDataSynced,
  broadcastPageRefreshComplete,
  subscribePageRefreshRequest,
} from "@/lib/app-page-refresh";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";

import { ActivityFilters } from "@/components/activity/activity-filters";
import { ActivityList } from "@/components/activity/activity-list";
import { ActivityLoading } from "@/components/activity/activity-loading";
import { ActivityEmptyState } from "@/components/activity/activity-empty-state";
import { ActivityPageHeader } from "@/components/activity/activity-page-header";

type Filters = {
  type: ActivityType | "all";
  status: ActivityStatus | "all";
  range: ActivityRange;
};

function rangeMs(range: ActivityRange) {
  if (range === "24h") return 24 * 60 * 60 * 1000;
  if (range === "7d") return 7 * 24 * 60 * 60 * 1000;
  return 30 * 24 * 60 * 60 * 1000;
}

export default function ActivityPage() {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [recordsRaw, setRecordsRaw] = useState<ActivityRecord[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [now] = useState(() => Date.now());
  const [filters, setFilters] = useState<Filters>({ type: "all", status: "all", range: "24h" });

  const fetchActivities = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const data = await activityService.list({
        page,
        page_size: pageSize,
        type: filters.type === "all" ? undefined : filters.type,
        status: filters.status === "all" ? undefined : filters.status,
      });
      setRecordsRaw(
        data.items.map((item) => ({
          id: String(item.id),
          type: item.type,
          status: item.status,
          previewKey: item.preview_key,
          accountHandle: item.account_handle,
          executedAt: item.executed_at,
          errorMessage: item.error_message,
          replyCommentTweetId: item.reply_comment_tweet_id,
          replyToUsername: item.reply_to_username,
          replyToTextPreview: item.reply_to_text_preview,
          replyTextPreview: item.reply_text_preview,
        }))
      );
      setTotal(data.pagination.total);
      broadcastDataSynced(Date.now());
    } catch (error) {
      if (axios.isAxiosError(error)) {
        setErrorMessage(error.response?.data?.message || "Failed to load activities.");
      } else {
        setErrorMessage("Failed to load activities.");
      }
    } finally {
      setLoading(false);
    }
  }, [filters.status, filters.type, page, pageSize]);

  useEffect(() => {
    void fetchActivities();
  }, [fetchActivities]);

  useEffect(() => {
    return subscribePageRefreshRequest(() => {
      void (async () => {
        try {
          await fetchActivities();
        } finally {
          broadcastPageRefreshComplete();
        }
      })();
    });
  }, [fetchActivities]);

  useEffect(() => {
    setPage(1);
  }, [filters.type, filters.status]);

  const records = useMemo(() => {
    const maxAge = rangeMs(filters.range);
    return recordsRaw
      .filter((r) => now - new Date(r.executedAt).getTime() <= maxAge)
      .sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime());
  }, [filters.range, now, recordsRaw]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4 md:space-y-5">
      <ActivityPageHeader count={records.length} />
      <ActivityFilters value={filters} onChange={setFilters} />
      {loading ? (
        <ActivityLoading />
      ) : errorMessage ? (
        <Card>
          <CardHeader title="Failed to load activities" description={errorMessage} />
          <div className="flex justify-end">
            <Button onClick={() => void fetchActivities()}>Retry</Button>
          </div>
        </Card>
      ) : records.length === 0 ? (
        <ActivityEmptyState />
      ) : (
        <div className="space-y-3">
          <ActivityList records={records as ActivityRecord[]} />
          <Card className="p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-white/65">
                Page {page} / {totalPages}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  Previous
                </Button>
                <Button variant="outline" disabled={page >= totalPages || loading} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

