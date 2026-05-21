import type { ConnectedXAccount } from "@/types/accounts";
import type { AutomationModuleApi } from "@/services/automation.service";
import type { AutoPostPlanApi } from "@/services/auto-post.service";
import type { ReviewQueueItemApi } from "@/services/review-queue.service";
import type { OAFBot } from "@/types/oaf-bot";

import { AccountCard, type AccountAutomationState, type AccountQueueSummary } from "./account-card";

type AccountListProps = {
  accounts: ConnectedXAccount[];
  bots: OAFBot[];
  automationModules: AutomationModuleApi[];
  autoPostPlans: AutoPostPlanApi[];
  queueItems: ReviewQueueItemApi[];
  onReconnect: (id: string) => void;
  onDisconnect: (id: string) => Promise<void>;
  disconnectingAccountId?: string | null;
};

const automationTypes: Array<AccountAutomationState["type"]> = ["post", "reply", "comment", "dm"];

export function AccountList({
  accounts,
  bots,
  automationModules,
  autoPostPlans,
  queueItems,
  onReconnect,
  onDisconnect,
  disconnectingAccountId,
}: AccountListProps) {
  return (
    <div className="space-y-3">
      {accounts.map((account) => {
        const accountID = Number(account.id);
        const boundBot = bots.find((bot) => bot.twitter_account_id === Number(account.id));
        const postPlan = autoPostPlans.find((plan) => plan.x_account_id === accountID);
        const accountQueueItems = queueItems.filter((item) => item.twitter_account_id === accountID);
        const automationStates = automationTypes.map<AccountAutomationState>((type) => {
          const automationModule = automationModules.find((item) => item.type === type);
          const mode = type === "post" ? postPlan?.execution_mode || automationModule?.config.execution_mode || "review" : automationModule?.config.execution_mode || "review";
          return {
            type,
            enabled: type === "post" ? Boolean(postPlan?.enabled) : Boolean(automationModule?.config.enabled),
            configured: type === "post" ? Boolean(postPlan) : Boolean(automationModule),
            mode,
          };
        });
        const queueSummary = accountQueueItems.reduce<AccountQueueSummary>(
          (summary, item) => {
            summary.total += 1;
            if (item.status === "pending_review") summary.pendingReview += 1;
            if (item.status === "ready_to_publish") summary.readyToPublish += 1;
            if (item.status === "failed") summary.failed += 1;
            if (item.status === "published") summary.published += 1;
            return summary;
          },
          { total: 0, pendingReview: 0, readyToPublish: 0, failed: 0, published: 0 }
        );
        return (
          <AccountCard
            key={account.id}
            account={account}
            boundBot={boundBot}
            automationStates={automationStates}
            queueSummary={queueSummary}
            onReconnect={onReconnect}
            onDisconnect={onDisconnect}
            isDisconnecting={disconnectingAccountId === account.id}
          />
        );
      })}
    </div>
  );
}
