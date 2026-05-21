"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import axios from "axios";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  LayoutDashboard,
  ReceiptText,
  RefreshCcw,
  Search,
  Settings,
  ShieldCheck,
  UserCog,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/providers/toast-provider";
import {
  broadcastDataSynced,
  broadcastPageRefreshComplete,
  subscribePageRefreshRequest,
} from "@/lib/app-page-refresh";
import { adminService, type AdminOverviewApi, type AdminUserListItemApi } from "@/services/admin.service";
import { billingService } from "@/services/billing.service";
import type { BillingOpsAction } from "@/types/billing";
import { useT } from "@/i18n/use-t";

type LoadState = "loading" | "ready" | "error" | "forbidden";
type AdminSection = "overview" | "users" | "billing" | "activity" | "system";

const sections: Array<{ id: AdminSection; labelKey: string; descriptionKey: string; icon: LucideIcon }> = [
  { id: "overview", labelKey: "admin.sections.overview", descriptionKey: "admin.sections.overviewDesc", icon: LayoutDashboard },
  { id: "users", labelKey: "admin.sections.users", descriptionKey: "admin.sections.usersDesc", icon: Users },
  { id: "billing", labelKey: "admin.sections.billing", descriptionKey: "admin.sections.billingDesc", icon: ReceiptText },
  { id: "activity", labelKey: "admin.sections.activity", descriptionKey: "admin.sections.activityDesc", icon: Activity },
  { id: "system", labelKey: "admin.sections.system", descriptionKey: "admin.sections.systemDesc", icon: Settings },
];

const roleOptions = [
  { value: "all", labelKey: "admin.filters.roles.all" },
  { value: "owner", labelKey: "admin.roles.owner" },
  { value: "admin", labelKey: "admin.roles.admin" },
  { value: "user", labelKey: "admin.roles.user" },
];

const statusOptions = [
  { value: "all", labelKey: "admin.filters.status.all" },
  { value: "active", labelKey: "admin.status.active" },
  { value: "suspended", labelKey: "admin.status.suspended" },
];

function roleLabelKey(role: string) {
  const r = role.toLowerCase();
  if (r === "owner") return "admin.roles.owner";
  if (r === "admin") return "admin.roles.admin";
  if (r === "user") return "admin.roles.user";
  return "admin.roles.unknown";
}

function statusLabelKey(status: string) {
  const s = status.toLowerCase();
  const keys: Record<string, string> = {
    active: "admin.status.active",
    suspended: "admin.status.suspended",
    paid: "admin.status.paid",
    pending: "admin.status.pending",
    failed: "admin.status.failed",
    expired: "admin.status.expired",
    success: "admin.status.success",
    review: "admin.status.review",
    matched: "admin.status.matched",
    mismatch: "admin.status.mismatch",
    unchecked: "admin.status.unchecked",
    needs_review: "admin.status.needsReview",
    review_needed: "admin.status.reviewNeeded",
    reviewed: "admin.status.reviewed",
    unreviewed: "admin.status.unreviewed",
  };
  return keys[s] || "admin.status.unknown";
}

function planLabel(plan: string, t: (key: string) => string) {
  const p = plan.toLowerCase();
  if (p === "free_trial") return t("admin.plans.freeTrial");
  if (p === "basic_monthly") return t("admin.plans.basicMonthly");
  if (p === "basic") return t("admin.plans.basic");
  if (p === "plus") return "Plus";
  if (p === "pro") return "Pro";
  if (p === "pro_plus") return "Pro+";
  return plan || t("admin.plans.none");
}

function subscriptionLabel(status: string, t: (key: string) => string) {
  const s = status.toLowerCase();
  if (s === "active") return t("admin.subscription.active");
  if (s === "expired") return t("admin.subscription.expired");
  if (s === "none" || s === "") return t("admin.subscription.none");
  return status;
}

function providerLabel(provider: string, t: (key: string) => string) {
  const p = provider.toLowerCase();
  if (p === "local") return t("admin.providers.local");
  if (p === "resend") return "Resend";
  if (p === "ses") return "Amazon SES";
  return provider || t("admin.common.notConfigured");
}

function activityTypeLabel(type: string, t: (key: string) => string) {
  const value = type.toLowerCase();
  if (value === "post") return t("admin.activityTypes.post");
  if (value === "reply") return t("admin.activityTypes.reply");
  if (value === "dm") return t("admin.activityTypes.dm");
  if (value === "comment") return t("admin.activityTypes.comment");
  return type || t("admin.activityTypes.unknown");
}

function formatDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusVariant(status: string): BadgeVariant {
  const s = status.toLowerCase();
  if (s === "active" || s === "paid" || s === "success" || s === "matched" || s === "reviewed") return "success";
  if (s === "pending" || s === "review" || s === "review_needed" || s === "needs_review") return "warning";
  if (s === "failed" || s === "expired" || s === "suspended" || s === "mismatch") return "danger";
  return "default";
}

function roleVariant(role: string): BadgeVariant {
  if (role === "owner") return "info";
  if (role === "admin") return "success";
  return "default";
}

function getErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.message || fallback;
  }
  return fallback;
}

function normalizedSection(value: string | null): AdminSection {
  return sections.some((item) => item.id === value) ? (value as AdminSection) : "overview";
}

export default function AdminPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { pushToast } = useToast();
  const { t } = useT();
  const activeSection = normalizedSection(searchParams.get("section"));
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [overview, setOverview] = useState<AdminOverviewApi | null>(null);
  const [users, setUsers] = useState<AdminUserListItemApi[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState("all");
  const [submittingUser, setSubmittingUser] = useState<number | null>(null);
  const [submittingOrder, setSubmittingOrder] = useState<string | null>(null);

  const userParams = useMemo(
    () => ({
      page: 1,
      page_size: 20,
      query: query.trim() || undefined,
      role: role === "all" ? undefined : role,
      status: status === "all" ? undefined : status,
    }),
    [query, role, status]
  );

  const fetchAdmin = useCallback(
    async (options?: { quiet?: boolean }) => {
      const quiet = Boolean(options?.quiet);
      if (!quiet) setLoadState("loading");
      setErrorMessage(null);
      try {
        const [overviewData, usersData] = await Promise.all([adminService.overview(), adminService.users(userParams)]);
        setOverview(overviewData);
        setUsers(usersData.items);
        setTotalUsers(usersData.pagination.total);
        setLoadState("ready");
        broadcastDataSynced(Date.now());
      } catch (error) {
        const statusCode = axios.isAxiosError(error) ? error.response?.status : 0;
        const msg = getErrorMessage(error, t("admin.errors.loadFailed"));
        setErrorMessage(msg);
        setLoadState(statusCode === 403 ? "forbidden" : "error");
        if (quiet) pushToast(msg);
      }
    },
    [pushToast, t, userParams]
  );

  useEffect(() => {
    void fetchAdmin();
  }, [fetchAdmin]);

  useEffect(() => {
    return subscribePageRefreshRequest(() => {
      void (async () => {
        try {
          await fetchAdmin({ quiet: true });
        } finally {
          broadcastPageRefreshComplete();
        }
      })();
    });
  }, [fetchAdmin]);

  const setSection = (section: AdminSection) => {
    router.replace(`/admin?section=${section}`);
  };

  const updateUser = async (userId: number, payload: { role?: string; status?: string }) => {
    setSubmittingUser(userId);
    try {
      const next = await adminService.updateUser(userId, payload);
      setUsers((items) => items.map((item) => (item.id === userId ? next : item)));
      void fetchAdmin({ quiet: true });
      pushToast(t("admin.toast.userUpdated"));
    } catch (error) {
      pushToast(getErrorMessage(error, t("admin.errors.userUpdateFailed")));
    } finally {
      setSubmittingUser(null);
    }
  };

  const updateOrder = async (orderId: string, action: BillingOpsAction) => {
    setSubmittingOrder(`${orderId}:${action}`);
    try {
      await billingService.orderOpsAction(orderId, {
        action,
        ops_note: action === "mark_reviewed" ? "Admin console marked reviewed." : "Admin console marked review needed.",
      });
      await fetchAdmin({ quiet: true });
      pushToast(t("admin.toast.orderUpdated"));
    } catch (error) {
      pushToast(getErrorMessage(error, t("admin.errors.orderUpdateFailed")));
    } finally {
      setSubmittingOrder(null);
    }
  };

  if (loadState === "loading") {
    return <AdminSkeleton />;
  }

  if (loadState === "forbidden") {
    return (
      <Card className="bg-[#0f1419]">
        <CardHeader title={t("admin.forbidden.title")} description={errorMessage || t("admin.forbidden.description")} />
      </Card>
    );
  }

  if (loadState === "error" || !overview) {
    return (
      <Card className="bg-[#0f1419]">
        <CardHeader title={t("admin.error.title")} description={errorMessage || t("common.retryHint")} />
        <Button type="button" onClick={() => void fetchAdmin()}>
          <RefreshCcw className="size-4" />
          {t("common.retry")}
        </Button>
      </Card>
    );
  }

  const activeMeta = sections.find((item) => item.id === activeSection) ?? sections[0];

  return (
    <div className="space-y-5">
      <AdminHero overview={overview} activeMeta={activeMeta} onRefresh={() => void fetchAdmin({ quiet: true })} />
      <SectionTabs activeSection={activeSection} onChange={setSection} />

      {activeSection === "overview" ? <OverviewSection overview={overview} onNavigate={setSection} /> : null}
      {activeSection === "users" ? (
        <UsersSection
          overview={overview}
          users={users}
          totalUsers={totalUsers}
          query={query}
          role={role}
          status={status}
          submittingUser={submittingUser}
          onQueryChange={setQuery}
          onRoleChange={setRole}
          onStatusChange={setStatus}
          onUpdateUser={updateUser}
        />
      ) : null}
      {activeSection === "billing" ? <BillingSection overview={overview} submittingOrder={submittingOrder} onUpdateOrder={updateOrder} /> : null}
      {activeSection === "activity" ? <ActivitySection overview={overview} /> : null}
      {activeSection === "system" ? <SystemSection overview={overview} /> : null}
    </div>
  );
}

function AdminSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-24 animate-pulse rounded-2xl border border-[#2f3336] bg-[#0f1419]" />
      <div className="grid gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-2xl border border-[#2f3336] bg-[#0f1419]" />
        ))}
      </div>
    </div>
  );
}

function AdminHero({
  overview,
  activeMeta,
  onRefresh,
}: {
  overview: AdminOverviewApi;
  activeMeta: (typeof sections)[number];
  onRefresh: () => void;
}) {
  const { t } = useT();
  const riskCount = overview.billing.review_needed + overview.billing.needs_review + overview.activity.failed + configIssueCount(overview);
  return (
    <section className="rounded-2xl border border-[#2f3336] bg-[#0f1419] p-5 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm text-[#1d9bf0]">
            <ShieldCheck className="size-4" />
            <span>{t("admin.kicker")}</span>
            <Badge variant={overview.operator.role === "owner" ? "info" : "success"}>{t(roleLabelKey(overview.operator.role))}</Badge>
          </div>
          <h1 className="mt-3 text-2xl font-semibold text-white md:text-3xl">{t(activeMeta.labelKey)}</h1>
          <p className="mt-2 max-w-3xl break-words text-sm leading-6 text-[#71767b]">
            {t("admin.header.operator", { email: overview.operator.email })} · {t(activeMeta.descriptionKey)}
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Badge variant={riskCount > 0 ? "warning" : "success"} className="justify-center">
            {riskCount > 0 ? t("admin.header.risks", { count: riskCount }) : t("admin.header.healthy")}
          </Badge>
          <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={onRefresh}>
            <RefreshCcw className="size-4" />
            {t("admin.actions.refresh")}
          </Button>
        </div>
      </div>
    </section>
  );
}

function SectionTabs({ activeSection, onChange }: { activeSection: AdminSection; onChange: (section: AdminSection) => void }) {
  const { t } = useT();
  return (
    <nav className="grid gap-2 md:grid-cols-5">
      {sections.map((section) => {
        const Icon = section.icon;
        const active = section.id === activeSection;
        return (
          <button
            key={section.id}
            type="button"
            className={`min-w-0 rounded-2xl border px-3 py-3 text-left transition-colors ${
              active ? "border-[#1d9bf0]/45 bg-[#1d9bf0]/10 text-white" : "border-[#2f3336] bg-[#0f1419] text-[#71767b] hover:bg-[#16181c] hover:text-white"
            }`}
            onClick={() => onChange(section.id)}
          >
            <div className="flex items-center gap-2 text-sm font-medium">
              <Icon className="size-4 shrink-0" />
              <span className="truncate">{t(section.labelKey)}</span>
            </div>
            <p className="mt-1 line-clamp-2 text-xs text-[#71767b]">{t(section.descriptionKey)}</p>
          </button>
        );
      })}
    </nav>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: number | string;
  icon: LucideIcon;
  tone?: "default" | "good" | "warn" | "danger";
}) {
  const toneClass =
    tone === "good"
      ? "border-[#00ba7c]/25 bg-[#00ba7c]/10"
      : tone === "warn"
        ? "border-[#ffd400]/25 bg-[#ffd400]/10"
        : tone === "danger"
          ? "border-[#f4212e]/25 bg-[#f4212e]/10"
          : "border-[#2f3336] bg-black";
  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[#71767b]">{label}</p>
        <Icon className="size-4 text-[#8ecdf8]" />
      </div>
      <p className="mt-3 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}

function OverviewSection({ overview, onNavigate }: { overview: AdminOverviewApi; onNavigate: (section: AdminSection) => void }) {
  const { t } = useT();
  const reviewCount = overview.billing.review_needed + overview.billing.needs_review;
  return (
    <div className="space-y-4">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Metric label={t("admin.metrics.totalUsers")} value={overview.users.total} icon={Users} />
        <Metric label={t("admin.metrics.reviewOrders")} value={reviewCount} icon={ReceiptText} tone={reviewCount > 0 ? "warn" : "good"} />
        <Metric label={t("admin.metrics.failed24h")} value={overview.activity.failed} icon={AlertTriangle} tone={overview.activity.failed > 0 ? "danger" : "good"} />
        <Metric label={t("admin.metrics.connectedAccounts")} value={overview.content.connected_accounts} icon={CheckCircle2} tone="good" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_1.1fr]">
        <Card className="bg-[#0f1419]">
          <CardHeader title={t("admin.overview.priority.title")} description={t("admin.overview.priority.description")} />
          <div className="grid gap-3 md:grid-cols-3">
            <ActionTile
              label={t("admin.overview.priority.orders")}
              value={reviewCount}
              tone={reviewCount > 0 ? "warn" : "good"}
              action={t("admin.actions.handleOrders")}
              onClick={() => onNavigate("billing")}
            />
            <ActionTile
              label={t("admin.overview.priority.failed")}
              value={overview.activity.failed}
              tone={overview.activity.failed > 0 ? "danger" : "good"}
              action={t("admin.actions.viewActivity")}
              onClick={() => onNavigate("activity")}
            />
            <ActionTile
              label={t("admin.overview.priority.config")}
              value={configIssueCount(overview)}
              tone={configIssueCount(overview) > 0 ? "warn" : "good"}
              action={t("admin.actions.checkConfig")}
              onClick={() => onNavigate("system")}
            />
          </div>
        </Card>

        <Card className="bg-[#0f1419]">
          <CardHeader title={t("admin.overview.business.title")} description={t("admin.overview.business.description")} />
          <div className="grid grid-cols-2 gap-3">
            <Metric label={t("admin.metrics.activeUsers")} value={overview.users.active} icon={Users} tone="good" />
            <Metric label={t("admin.metrics.suspendedUsers")} value={overview.users.suspended} icon={Users} tone={overview.users.suspended > 0 ? "warn" : "default"} />
            <Metric label={t("admin.metrics.publishedPosts")} value={overview.content.published_posts} icon={Activity} />
            <Metric label={t("admin.metrics.enabledAutomations")} value={overview.content.enabled_automations} icon={Settings} />
          </div>
        </Card>
      </section>
    </div>
  );
}

function UsersSection({
  overview,
  users,
  totalUsers,
  query,
  role,
  status,
  submittingUser,
  onQueryChange,
  onRoleChange,
  onStatusChange,
  onUpdateUser,
}: {
  overview: AdminOverviewApi;
  users: AdminUserListItemApi[];
  totalUsers: number;
  query: string;
  role: string;
  status: string;
  submittingUser: number | null;
  onQueryChange: (value: string) => void;
  onRoleChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onUpdateUser: (userId: number, payload: { role?: string; status?: string }) => Promise<void>;
}) {
  const { t } = useT();
  const canChangeRole = overview.operator.role === "owner";
  return (
    <div className="space-y-4">
      <section className="grid gap-3 md:grid-cols-4">
        <Metric label={t("admin.metrics.totalUsers")} value={overview.users.total} icon={Users} />
        <Metric label={t("admin.metrics.activeUsers")} value={overview.users.active} icon={Users} tone="good" />
        <Metric label={t("admin.metrics.admins")} value={overview.users.admins + overview.users.owners} icon={ShieldCheck} />
        <Metric label={t("admin.metrics.activeSubscriptions")} value={overview.users.active_subscriptions} icon={CheckCircle2} tone="good" />
      </section>
      <Card className="bg-[#0f1419]">
        <CardHeader
          title={t("admin.users.title")}
          description={canChangeRole ? t("admin.users.descriptionOwner") : t("admin.users.descriptionAdmin")}
          right={<Badge variant="info">{t("admin.users.count", { shown: users.length, total: totalUsers })}</Badge>}
        />
        <div className="mb-4 grid gap-2 md:grid-cols-[1fr_160px_160px]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-[#71767b]" />
            <Input className="pl-9" placeholder={t("admin.users.searchPlaceholder")} value={query} onChange={(event) => onQueryChange(event.target.value)} />
          </label>
          <select className="form-input" value={role} onChange={(event) => onRoleChange(event.target.value)}>
            {roleOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.labelKey)}
              </option>
            ))}
          </select>
          <select className="form-input" value={status} onChange={(event) => onStatusChange(event.target.value)}>
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.labelKey)}
              </option>
            ))}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-[#2f3336] text-xs uppercase text-[#71767b]">
              <tr>
                <th className="px-3 py-2 font-medium">{t("admin.users.table.user")}</th>
                <th className="px-3 py-2 font-medium">{t("admin.users.table.role")}</th>
                <th className="px-3 py-2 font-medium">{t("admin.users.table.status")}</th>
                <th className="px-3 py-2 font-medium">{t("admin.users.table.subscription")}</th>
                <th className="px-3 py-2 font-medium">{t("admin.users.table.createdAt")}</th>
                <th className="px-3 py-2 font-medium">{t("admin.users.table.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2f3336]">
              {users.map((user) => {
                const isSelf = user.id === overview.operator.id;
                return (
                  <tr key={user.id} className="text-[#d5d9dc]">
                    <td className="px-3 py-3">
                      <p className="font-medium text-white">{user.name || t("admin.users.userFallback", { id: user.id })}</p>
                      <p className="text-xs text-[#71767b]">{user.email}</p>
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant={roleVariant(user.role)}>{t(roleLabelKey(user.role))}</Badge>
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant={statusVariant(user.status)}>{t(statusLabelKey(user.status))}</Badge>
                    </td>
                    <td className="px-3 py-3">
                      <p>{planLabel(user.subscription_plan_code, t)}</p>
                      <p className="text-xs text-[#71767b]">{subscriptionLabel(user.subscription_status, t)}</p>
                    </td>
                    <td className="px-3 py-3">{formatDate(user.created_at)}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {canChangeRole ? (
                          <select
                            className="form-input h-8 w-28 py-1 text-xs"
                            value={user.role}
                            disabled={submittingUser === user.id}
                            onChange={(event) => void onUpdateUser(user.id, { role: event.target.value })}
                          >
                            <option value="user">{t("admin.roles.user")}</option>
                            <option value="admin">{t("admin.roles.admin")}</option>
                            <option value="owner">{t("admin.roles.owner")}</option>
                          </select>
                        ) : (
                          <span className="text-xs text-[#71767b]">{t("admin.users.ownerOnlyRole")}</span>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          variant={user.status === "active" ? "outline" : "secondary"}
                          disabled={submittingUser === user.id || isSelf}
                          onClick={() => void onUpdateUser(user.id, { status: user.status === "active" ? "suspended" : "active" })}
                        >
                          <UserCog className="size-3.5" />
                          {isSelf ? t("admin.users.currentAccount") : user.status === "active" ? t("admin.actions.suspend") : t("admin.actions.restore")}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 ? (
                <tr>
                  <td className="px-3 py-8 text-center text-[#71767b]" colSpan={6}>
                    {t("admin.users.empty")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function BillingSection({
  overview,
  submittingOrder,
  onUpdateOrder,
}: {
  overview: AdminOverviewApi;
  submittingOrder: string | null;
  onUpdateOrder: (orderId: string, action: BillingOpsAction) => Promise<void>;
}) {
  const { t } = useT();
  const reviewCount = overview.billing.review_needed + overview.billing.needs_review;
  return (
    <div className="space-y-4">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Metric label={t("admin.billing.total")} value={overview.billing.total} icon={ReceiptText} />
        <Metric label={t("admin.billing.pending")} value={overview.billing.pending} icon={ReceiptText} tone="warn" />
        <Metric label={t("admin.billing.paid")} value={overview.billing.paid} icon={CheckCircle2} tone="good" />
        <Metric label={t("admin.billing.review")} value={reviewCount} icon={AlertTriangle} tone={reviewCount > 0 ? "warn" : "good"} />
        <Metric label={t("admin.billing.mismatch")} value={overview.billing.mismatch} icon={AlertTriangle} tone={overview.billing.mismatch > 0 ? "danger" : "default"} />
      </section>
      <Card className="bg-[#0f1419]">
        <CardHeader title={t("admin.billing.recentTitle")} description={t("admin.billing.recentDesc")} />
        <div className="space-y-2">
          {overview.recent_orders.map((order) => (
            <div key={order.order_id} className="grid gap-3 rounded-2xl border border-[#2f3336] bg-black p-4 text-sm xl:grid-cols-[1fr_auto] xl:items-center">
              <div className="min-w-0">
                <p className="break-words font-medium text-white">
                  {t("admin.billing.orderLine", { orderId: order.order_id, userId: order.user_id })}
                </p>
                <p className="mt-1 break-words text-[#71767b]">
                  {planLabel(order.plan_code, t)} · {order.amount} {order.currency} · {order.network} · {formatDate(order.created_at)}
                </p>
                {order.tx_hash ? <p className="mt-1 break-all font-mono text-xs text-[#71767b]">{order.tx_hash}</p> : null}
              </div>
              <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                <Badge variant={statusVariant(order.status)}>{t(statusLabelKey(order.status))}</Badge>
                <Badge variant={statusVariant(order.reconciliation_status)}>{t(statusLabelKey(order.reconciliation_status))}</Badge>
                <Badge variant={statusVariant(order.review_status)}>{t(statusLabelKey(order.review_status))}</Badge>
                <Button
                  type="button"
                  size="sm"
                  className="w-full sm:w-auto"
                  variant="outline"
                  disabled={submittingOrder === `${order.order_id}:mark_review_needed`}
                  onClick={() => void onUpdateOrder(order.order_id, "mark_review_needed")}
                >
                  {t("admin.actions.markReviewNeeded")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="w-full sm:w-auto"
                  variant="outline"
                  disabled={submittingOrder === `${order.order_id}:mark_reviewed`}
                  onClick={() => void onUpdateOrder(order.order_id, "mark_reviewed")}
                >
                  {t("admin.actions.markReviewed")}
                </Button>
              </div>
            </div>
          ))}
          {overview.recent_orders.length === 0 ? <p className="py-8 text-center text-sm text-[#71767b]">{t("admin.billing.empty")}</p> : null}
        </div>
      </Card>
    </div>
  );
}

function ActivitySection({ overview }: { overview: AdminOverviewApi }) {
  const { t } = useT();
  return (
    <div className="space-y-4">
      <section className="grid gap-3 md:grid-cols-4">
        <Metric label={t("admin.activity.last24h")} value={overview.activity.last_24h} icon={Activity} />
        <Metric label={t("admin.activity.success")} value={overview.activity.success} icon={CheckCircle2} tone="good" />
        <Metric label={t("admin.activity.failed")} value={overview.activity.failed} icon={AlertTriangle} tone={overview.activity.failed > 0 ? "danger" : "default"} />
        <Metric label={t("admin.activity.review")} value={overview.activity.review} icon={AlertTriangle} tone="warn" />
      </section>
      <Card className="bg-[#0f1419]">
        <CardHeader title={t("admin.activity.recentTitle")} description={t("admin.activity.recentDesc")} />
        <div className="space-y-2">
          {overview.recent_events.map((event) => (
            <div key={event.id} className="rounded-2xl border border-[#2f3336] bg-black p-4 text-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="font-medium text-white">
                  {activityTypeLabel(event.type, t)} · {t("admin.common.userId", { id: event.user_id })}
                </p>
                <Badge variant={statusVariant(event.status)}>{t(statusLabelKey(event.status))}</Badge>
              </div>
              <p className="mt-2 break-words text-[#71767b]">
                {event.account_handle || t("admin.activity.noAccount")} · {formatDate(event.executed_at)}
              </p>
              {event.error_message ? <p className="mt-3 line-clamp-3 break-words rounded-xl border border-[#f4212e]/20 bg-[#f4212e]/10 p-3 text-xs text-[#ff8a91]">{event.error_message}</p> : null}
            </div>
          ))}
          {overview.recent_events.length === 0 ? <p className="py-8 text-center text-sm text-[#71767b]">{t("admin.activity.empty")}</p> : null}
        </div>
      </Card>
    </div>
  );
}

function SystemSection({ overview }: { overview: AdminOverviewApi }) {
  const { t } = useT();
  return (
    <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
      <Card className="bg-[#0f1419]">
        <CardHeader title={t("admin.system.configTitle")} description={t("admin.system.configDesc")} />
        <div className="space-y-3 text-sm">
          <ConfigRow label={t("admin.system.emailProvider")} value={providerLabel(overview.config.email_provider, t)} ok={overview.config.email_provider !== ""} />
          <ConfigRow label={t("admin.system.resend")} value={overview.config.resend_configured ? t("admin.common.configured") : t("admin.common.notConfigured")} ok={overview.config.resend_configured} />
          <ConfigRow label={t("admin.system.xOAuth")} value={overview.config.x_oauth_configured ? t("admin.common.configured") : t("admin.common.notConfigured")} ok={overview.config.x_oauth_configured} />
          <ConfigRow label={t("admin.system.billingMethods")} value={t("admin.system.billingMethodCount", { count: overview.config.billing_method_count })} ok={overview.config.billing_method_count > 0} />
          <ConfigRow label={t("admin.system.frontendUrl")} value={overview.config.frontend_base_url || t("admin.common.notConfigured")} ok={overview.config.frontend_base_url !== ""} />
        </div>
      </Card>
      <Card className="bg-[#0f1419]">
        <CardHeader title={t("admin.system.contentTitle")} description={t("admin.system.contentDesc")} />
        <div className="grid gap-3 md:grid-cols-3">
          <Metric label={t("admin.metrics.connectedAccounts")} value={overview.content.connected_accounts} icon={Users} />
          <Metric label={t("admin.metrics.allPosts")} value={overview.content.posts} icon={Activity} />
          <Metric label={t("admin.metrics.publishedPosts")} value={overview.content.published_posts} icon={CheckCircle2} tone="good" />
          <Metric label={t("admin.metrics.scheduledPosts")} value={overview.content.scheduled_posts} icon={Activity} />
          <Metric label={t("admin.metrics.failedPosts")} value={overview.content.failed_posts} icon={AlertTriangle} tone={overview.content.failed_posts > 0 ? "danger" : "default"} />
          <Metric label={t("admin.metrics.enabledAutomations")} value={overview.content.enabled_automations} icon={Settings} />
        </div>
      </Card>
    </div>
  );
}

function ActionTile({
  label,
  value,
  action,
  tone,
  onClick,
}: {
  label: string;
  value: number;
  action: string;
  tone: "good" | "warn" | "danger";
  onClick: () => void;
}) {
  const toneClass = tone === "good" ? "border-[#00ba7c]/25 bg-[#00ba7c]/10" : tone === "danger" ? "border-[#f4212e]/25 bg-[#f4212e]/10" : "border-[#ffd400]/25 bg-[#ffd400]/10";
  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <p className="text-sm text-[#71767b]">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      <Button type="button" className="mt-4 w-full" size="sm" variant="outline" onClick={onClick}>
        {action}
      </Button>
    </div>
  );
}

function ConfigRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#2f3336] bg-black px-3 py-2">
      <span className="text-[#71767b]">{label}</span>
      <span className="flex min-w-0 items-center gap-2 text-right text-white">
        {ok ? <CheckCircle2 className="size-4 shrink-0 text-[#00ba7c]" /> : <AlertTriangle className="size-4 shrink-0 text-[#ffd400]" />}
        <span className="break-words">{value}</span>
      </span>
    </div>
  );
}

function configIssueCount(overview: AdminOverviewApi) {
  return [
    overview.config.email_provider !== "",
    overview.config.resend_configured,
    overview.config.x_oauth_configured,
    overview.config.billing_method_count > 0,
    overview.config.frontend_base_url !== "",
  ].filter((ok) => !ok).length;
}
