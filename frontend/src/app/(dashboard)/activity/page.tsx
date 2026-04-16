"use client";

import { useMemo, useState } from "react";

import { activityRecordsMock } from "@/mocks/activity/activity.mock";
import type { ActivityRange, ActivityRecord, ActivityStatus, ActivityType } from "@/types/activity";

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
  const [loading] = useState(false);
  const [now] = useState(() => Date.now());
  const [filters, setFilters] = useState<Filters>({ type: "all", status: "all", range: "24h" });

  const records = useMemo(() => {
    const maxAge = rangeMs(filters.range);
    return activityRecordsMock
      .filter((r) => now - new Date(r.executedAt).getTime() <= maxAge)
      .filter((r) => (filters.type === "all" ? true : r.type === filters.type))
      .filter((r) => (filters.status === "all" ? true : r.status === filters.status))
      .sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime());
  }, [filters, now]);

  return (
    <div className="space-y-4 md:space-y-5">
      <ActivityPageHeader count={records.length} />
      <ActivityFilters value={filters} onChange={setFilters} />
      {loading ? (
        <ActivityLoading />
      ) : records.length === 0 ? (
        <ActivityEmptyState />
      ) : (
        <ActivityList records={records as ActivityRecord[]} />
      )}
    </div>
  );
}

