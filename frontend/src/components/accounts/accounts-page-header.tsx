"use client";

import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/use-t";

type AccountsPageHeaderProps = {
  onAddAccount: () => void;
  addDisabled?: boolean;
  addDisabledReason?: string;
};

export function AccountsPageHeader({ onAddAccount, addDisabled = false, addDisabledReason }: AccountsPageHeaderProps) {
  const { t } = useT();
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 className="text-title">{t("accounts.page.title")}</h2>
        <p className="text-subtitle mt-2">{t("accounts.page.subtitle")}</p>
        {addDisabled && addDisabledReason ? <p className="mt-2 text-xs text-amber-100/80">{addDisabledReason}</p> : null}
      </div>
      <Button onClick={onAddAccount} disabled={addDisabled}>
        <Plus className="size-4" />
        {t("accounts.actions.add")}
      </Button>
    </div>
  );
}
