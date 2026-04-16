import { PaymentHistoryTable } from "./payment-history-table";
import { PaymentMethodPanel } from "./payment-method-panel";
import { PlanComparison } from "./plan-comparison";
import { SubscriptionStatusCard } from "./subscription-status-card";

export function BillingPageContent() {
  return (
    <div className="space-y-4 md:space-y-5">
      <SubscriptionStatusCard />
      <PlanComparison />
      <PaymentMethodPanel />
      <PaymentHistoryTable />
    </div>
  );
}
