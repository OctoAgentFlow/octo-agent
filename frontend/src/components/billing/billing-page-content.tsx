import type { CurrentSubscription, PaymentMethodOption, PaymentRecord, Plan } from "@/types/billing";

import { PaymentHistoryTable } from "./payment-history-table";
import { PaymentMethodPanel } from "./payment-method-panel";
import { PlanComparison } from "./plan-comparison";
import { SubscriptionStatusCard } from "./subscription-status-card";

type BillingPageContentProps = {
  subscription: CurrentSubscription | null;
  plans: Plan[];
  paymentMethods: PaymentMethodOption[];
  paymentRecords: PaymentRecord[];
  onConfirmTx?: (orderId: string, txHash: string) => Promise<void>;
  onPaymentConfirmed?: () => void;
};

export function BillingPageContent({
  subscription,
  plans,
  paymentMethods,
  paymentRecords,
  onConfirmTx,
  onPaymentConfirmed,
}: BillingPageContentProps) {
  return (
    <div className="space-y-4 md:space-y-5">
      <SubscriptionStatusCard subscription={subscription} />
      <PlanComparison plans={plans} />
      <PaymentMethodPanel paymentMethods={paymentMethods} onPaid={onPaymentConfirmed} />
      <PaymentHistoryTable paymentRecords={paymentRecords} onConfirmTx={onConfirmTx} />
    </div>
  );
}
