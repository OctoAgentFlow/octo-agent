import { AutomationOverview } from "@/components/dashboard/automation-overview";
import { RecentActivityList } from "@/components/dashboard/recent-activity-list";
import { StatusOverviewCards } from "@/components/dashboard/status-overview-cards";
import { TrialUpgradeBanner } from "@/components/dashboard/trial-upgrade-banner";
import { XAccountStatus } from "@/components/dashboard/x-account-status";

export default function DashboardPage() {
  return (
    <div className="space-y-4 md:space-y-5">
      <StatusOverviewCards />
      <XAccountStatus />
      <AutomationOverview />
      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <RecentActivityList />
        <TrialUpgradeBanner />
      </div>
    </div>
  );
}
