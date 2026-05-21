import type { ConnectedXAccount } from "@/types/accounts";
import type { OAFBot } from "@/types/oaf-bot";

import { AccountCard } from "./account-card";

type AccountListProps = {
  accounts: ConnectedXAccount[];
  bots: OAFBot[];
  onReconnect: (id: string) => void;
  onDisconnect: (id: string) => Promise<void>;
  disconnectingAccountId?: string | null;
};

export function AccountList({ accounts, bots, onReconnect, onDisconnect, disconnectingAccountId }: AccountListProps) {
  return (
    <div className="space-y-3">
      {accounts.map((account) => {
        const boundBot = bots.find((bot) => bot.twitter_account_id === Number(account.id));
        return (
          <AccountCard
            key={account.id}
            account={account}
            boundBot={boundBot}
            onReconnect={onReconnect}
            onDisconnect={onDisconnect}
            isDisconnecting={disconnectingAccountId === account.id}
          />
        );
      })}
    </div>
  );
}
