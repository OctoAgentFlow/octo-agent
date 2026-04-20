import type { ConnectedXAccount } from "@/types/accounts";

import { AccountCard } from "./account-card";

type AccountListProps = {
  accounts: ConnectedXAccount[];
  onManage: (id: string) => void;
  onReconnect: (id: string) => void;
  onDisconnect: (id: string) => Promise<void>;
  disconnectingAccountId?: string | null;
};

export function AccountList({ accounts, onManage, onReconnect, onDisconnect, disconnectingAccountId }: AccountListProps) {
  return (
    <div className="space-y-3">
      {accounts.map((account) => (
        <AccountCard
          key={account.id}
          account={account}
          onManage={onManage}
          onReconnect={onReconnect}
          onDisconnect={onDisconnect}
          isDisconnecting={disconnectingAccountId === account.id}
        />
      ))}
    </div>
  );
}
