"use client";

import type { ActivityRecord } from "@/types/activity";

import { ActivityItem } from "./activity-item";

export function ActivityList({ records }: { records: ActivityRecord[] }) {
  return (
    <div className="space-y-3">
      {records.map((record) => (
        <ActivityItem key={record.id} record={record} />
      ))}
    </div>
  );
}

