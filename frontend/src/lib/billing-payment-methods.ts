import type { BillingPaymentMethodApi } from "@/services/billing.service";
import type { PaymentMethodOption } from "@/types/billing";

function maskAddr(addr: string) {
  const s = addr.trim();
  if (s.length <= 14) return s;
  return `${s.slice(0, 8)}…${s.slice(-6)}`;
}

function networkKeyForApi(network: string) {
  const n = network.trim().toUpperCase();
  if (n === "BEP20") return "billing.payment.network.bep20";
  if (n === "ERC20") return "billing.payment.network.erc20";
  return "billing.payment.network.trc20";
}

export function mapPaymentMethods(items: BillingPaymentMethodApi[]): PaymentMethodOption[] {
  return items.map((m) => ({
    methodKey: "billing.payment.method.usdt",
    networkKey: networkKeyForApi(m.network),
    networkCode: m.network.trim().toUpperCase(),
    receiverMasked: maskAddr(m.receiver_address),
    tokenMasked: maskAddr(m.token_address),
    chainId: m.chain_id,
    note: m.note,
    isDefault: m.is_default,
  }));
}
