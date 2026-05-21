"use client";

import type { ActivityRecord } from "@/types/activity";

import { ActivityItem } from "./activity-item";

export function ActivityList({ records }: { records: ActivityRecord[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#2f3336] bg-[#0f1419]">
      {records.map((record) => (
        <ActivityItem key={record.id} record={record} />
      ))}
    </div>
  );
}
