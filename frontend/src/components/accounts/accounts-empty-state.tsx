import { Link2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { useT } from "@/i18n/use-t";

type AccountsEmptyStateProps = {
  onAddAccount: () => void;
};

export function AccountsEmptyState({ onAddAccount }: AccountsEmptyStateProps) {
  const { t } = useT();
  return (
    <Card>
      <CardHeader
        title={t("accounts.empty.title")}
        description={t("accounts.empty.description")}
      />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 text-sm text-white/65">
          <span className="inline-flex size-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
            <Link2 className="size-4 text-blue-200" />
          </span>
          <p>{t("accounts.empty.tip")}</p>
        </div>
        <Button onClick={onAddAccount}>{t("accounts.actions.add")}</Button>
      </div>
    </Card>
  );
}

