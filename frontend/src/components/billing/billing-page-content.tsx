import type {
  BillingOpsAction,
  BillingOpsSummary,
  BillingOrderFilterState,
  CurrentSubscription,
  PaymentMethodOption,
  PaymentRecord,
  Plan,
} from "@/types/billing";

import { PaymentHistoryTable } from "./payment-history-table";
import { PaymentMethodPanel } from "./payment-method-panel";
import { PlanComparison } from "./plan-comparison";
import { SubscriptionStatusCard } from "./subscription-status-card";

type BillingPageContentProps = {
  subscription: CurrentSubscription | null;
  plans: Plan[];
  paymentMethods: PaymentMethodOption[];
  paymentRecords: PaymentRecord[];
  opsSummary: BillingOpsSummary;
  canOperateBilling: boolean;
  filters: BillingOrderFilterState;
  onFiltersChange: (filters: BillingOrderFilterState) => void;
  onConfirmTx?: (orderId: string, txHash: string) => Promise<void>;
  onOpsAction?: (
    orderId: string,
    action: BillingOpsAction,
    payload?: { refundReason?: string; opsNote?: string }
  ) => Promise<void>;
  onPaymentConfirmed?: () => void;
};

export function BillingPageContent({
  subscription,
  plans,
  paymentMethods,
  paymentRecords,
  opsSummary,
  canOperateBilling,
  filters,
  onFiltersChange,
  onConfirmTx,
  onOpsAction,
  onPaymentConfirmed,
}: BillingPageContentProps) {
  return (
    <div className="space-y-4 md:space-y-5">
      <SubscriptionStatusCard subscription={subscription} />
      <PlanComparison plans={plans} />
      <PaymentMethodPanel paymentMethods={paymentMethods} onPaid={onPaymentConfirmed} />
      <PaymentHistoryTable
        paymentRecords={paymentRecords}
        opsSummary={opsSummary}
        canOperateBilling={canOperateBilling}
        filters={filters}
        onFiltersChange={onFiltersChange}
        onConfirmTx={onConfirmTx}
        onOpsAction={onOpsAction}
      />
    </div>
  );
}
