import { Card } from "@/components/ui/card";

export function ActivityLoading() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, idx) => (
        <Card key={idx} className="p-4">
          <div className="flex items-start gap-3">
            <div className="size-10 rounded-2xl bg-white/8" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-40 rounded bg-white/8" />
              <div className="h-4 w-2/3 rounded bg-white/8" />
              <div className="h-3 w-1/3 rounded bg-white/8" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

