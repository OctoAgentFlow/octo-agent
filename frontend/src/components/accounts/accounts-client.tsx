"use client";

import { useMemo, useState } from "react";

import { accountsMock, emptyAccountsMock } from "@/mocks/accounts.mock";

import { AccountsEmptyState } from "./accounts-empty-state";
import { AccountsPageHeader } from "./accounts-page-header";
import { AccountList } from "./account-list";
import { BindAccountDialog } from "./bind-account-dialog";

export function AccountsClient() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const accounts = useMemo(() => (process.env.NODE_ENV === "test" ? emptyAccountsMock : accountsMock), []);

  const onManage = (id: string) => {
    console.log("manage account", id);
  };
  const onReconnect = (id: string) => {
    console.log("reconnect account", id);
  };
  const onDisconnect = (id: string) => {
    console.log("disconnect account", id);
  };

  return (
    <div className="space-y-4 md:space-y-5">
      <AccountsPageHeader onAddAccount={() => setDialogOpen(true)} />

      {accounts.length === 0 ? (
        <AccountsEmptyState onAddAccount={() => setDialogOpen(true)} />
      ) : (
        <div className="space-y-3">
          <AccountList accounts={accounts} onManage={onManage} onReconnect={onReconnect} onDisconnect={onDisconnect} />
        </div>
      )}

      <BindAccountDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}

