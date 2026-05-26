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
  Coins,
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
import { adminService, type AdminGrossMarginAlertConfigApi, type AdminGrossMarginAlertEventApi, type AdminGrossMarginSummaryApi, type AdminOverviewApi, type AdminPointActivityApi, type AdminPointCostSummaryApi, type AdminPointRedemptionCodeApi, type AdminPointRiskConfigApi, type AdminPointUserApi, type AdminReferralSummaryApi, type AdminUserListItemApi } from "@/services/admin.service";
import type { BillingOpsAction } from "@/types/billing";
import { useT } from "@/i18n/use-t";

type LoadState = "loading" | "ready" | "error" | "forbidden";
type AdminSection = "overview" | "users" | "billing" | "points" | "activity" | "system";

const sections: Array<{ id: AdminSection; labelKey: string; descriptionKey: string; icon: LucideIcon }> = [
  { id: "overview", labelKey: "admin.sections.overview", descriptionKey: "admin.sections.overviewDesc", icon: LayoutDashboard },
  { id: "users", labelKey: "admin.sections.users", descriptionKey: "admin.sections.usersDesc", icon: Users },
  { id: "billing", labelKey: "admin.sections.billing", descriptionKey: "admin.sections.billingDesc", icon: ReceiptText },
  { id: "points", labelKey: "admin.sections.points", descriptionKey: "admin.sections.pointsDesc", icon: Coins },
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

function formatBps(value: number) {
  return `${(value / 100).toFixed(1)}%`;
}

function statusVariant(status: string): BadgeVariant {
  const s = status.toLowerCase();
  if (s === "active" || s === "paid" || s === "success" || s === "matched" || s === "reviewed" || s === "confirmed") {
    return "success";
  }
  if (s === "pending" || s === "review" || s === "review_needed" || s === "needs_review" || s === "skipped") {
    return "warning";
  }
  if (s === "failed" || s === "expired" || s === "suspended" || s === "mismatch") return "danger";
  if (s === "scanned") return "info";
  return "default";
}

const autoScanStatuses = new Set(["pending", "scanned", "confirmed", "skipped", "failed"]);
const autoScanSkipReasons = new Set([
  "missing_payment_metadata",
  "ambiguous_payment_amount",
  "no_matching_transfer",
  "transfer_outside_order_window",
  "tx_already_used",
  "order_expired",
  "invalid_tx_hash_from_chain",
]);
const autoScanStatusOptions = ["all", "pending", "scanned", "confirmed", "skipped", "failed"];
const autoScanSkipReasonOptions = [
  "all",
  "missing_payment_metadata",
  "ambiguous_payment_amount",
  "no_matching_transfer",
  "transfer_outside_order_window",
  "tx_already_used",
  "order_expired",
  "invalid_tx_hash_from_chain",
];
const grossMarginAlertReasonOptions = [
  "all",
  "gross_margin_below_50_percent",
  "openai_cost_share_at_or_above_20_percent",
  "x_cost_share_at_or_above_20_percent",
  "point_discount_share_at_or_above_20_percent",
];

function normalizedAutoScanStatus(status?: string) {
  const value = status || "pending";
  return autoScanStatuses.has(value) ? value : "pending";
}

function autoScanSkipReasonLabel(reason: string | undefined, t: (key: string) => string) {
  if (!reason) return t("billing.history.autoScan.noReason");
  if (autoScanSkipReasons.has(reason)) return t(`billing.history.autoScan.reason.${reason}`);
  return reason;
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
  const [pointActivities, setPointActivities] = useState<AdminPointActivityApi[]>([]);
  const [pointUsers, setPointUsers] = useState<AdminPointUserApi[]>([]);
  const [pointRiskConfig, setPointRiskConfig] = useState<AdminPointRiskConfigApi | null>(null);
  const [redemptionCodes, setRedemptionCodes] = useState<AdminPointRedemptionCodeApi[]>([]);
  const [referralSummary, setReferralSummary] = useState<AdminReferralSummaryApi | null>(null);
  const [pointCostSummary, setPointCostSummary] = useState<AdminPointCostSummaryApi | null>(null);
  const [pointQuery, setPointQuery] = useState("");
  const [submittingPointKey, setSubmittingPointKey] = useState("");

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
        const [overviewData, usersData, activitiesData, pointUsersData, pointRiskConfigData, redemptionData, referralData, costData] = await Promise.all([
          adminService.overview(),
          adminService.users(userParams),
          adminService.pointActivities(),
          adminService.pointUsers({ page: 1, page_size: 20, query: pointQuery.trim() || undefined }),
          adminService.pointRiskConfig(),
          adminService.pointRedemptionCodes(),
          adminService.referralSummary(),
          adminService.pointCostSummary(),
        ]);
        setOverview(overviewData);
        setUsers(usersData.items);
        setTotalUsers(usersData.pagination.total);
        setPointActivities(activitiesData);
        setPointUsers(pointUsersData.items);
        setPointRiskConfig(pointRiskConfigData);
        setRedemptionCodes(redemptionData);
        setReferralSummary(referralData);
        setPointCostSummary(costData);
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
    [pointQuery, pushToast, t, userParams]
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
      await adminService.updateBillingOrder(orderId, {
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

  const updatePointActivity = async (activity: AdminPointActivityApi, patch: Partial<AdminPointActivityApi>) => {
    setSubmittingPointKey(`activity:${activity.id}`);
    try {
      const next = await adminService.updatePointActivity(activity.id, patch);
      setPointActivities((items) => items.map((item) => (item.id === next.id ? next : item)));
      pushToast(t("admin.toast.pointsUpdated"));
    } catch (error) {
      pushToast(getErrorMessage(error, t("admin.errors.pointsUpdateFailed")));
    } finally {
      setSubmittingPointKey("");
    }
  };

  const adjustPoints = async (userId: number, points: number, reason: string) => {
    setSubmittingPointKey(`user:${userId}`);
    try {
      const next = await adminService.adjustUserPoints(userId, { points, reason });
      setPointUsers((items) => items.map((item) => (item.user_id === userId ? next : item)));
      pushToast(t("admin.toast.pointsUpdated"));
    } catch (error) {
      pushToast(getErrorMessage(error, t("admin.errors.pointsUpdateFailed")));
    } finally {
      setSubmittingPointKey("");
    }
  };

  const updatePointRiskConfig = async (patch: Partial<AdminPointRiskConfigApi>) => {
    setSubmittingPointKey("risk");
    try {
      const next = await adminService.updatePointRiskConfig(patch);
      setPointRiskConfig(next);
      pushToast(t("admin.toast.pointsUpdated"));
    } catch (error) {
      pushToast(getErrorMessage(error, t("admin.errors.pointsUpdateFailed")));
    } finally {
      setSubmittingPointKey("");
    }
  };

  const createRedemptionCode = async (payload: { code: string; title: string; points: number; max_uses: number }) => {
    setSubmittingPointKey("redemption");
    try {
      const next = await adminService.createPointRedemptionCode({ ...payload, per_user_uses: 1, enabled: true });
      setRedemptionCodes((items) => [next, ...items]);
      pushToast(t("admin.toast.pointsUpdated"));
    } catch (error) {
      pushToast(getErrorMessage(error, t("admin.errors.pointsUpdateFailed")));
    } finally {
      setSubmittingPointKey("");
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
      {activeSection === "points" ? (
        <PointsAdminSection
          activities={pointActivities}
          users={pointUsers}
          riskConfig={pointRiskConfig}
          redemptionCodes={redemptionCodes}
          referralSummary={referralSummary}
          pointCostSummary={pointCostSummary}
          query={pointQuery}
          submittingKey={submittingPointKey}
          onQueryChange={setPointQuery}
          onRefresh={() => void fetchAdmin({ quiet: true })}
          onUpdateActivity={updatePointActivity}
          onAdjustPoints={adjustPoints}
          onUpdateRiskConfig={updatePointRiskConfig}
          onCreateRedemptionCode={createRedemptionCode}
        />
      ) : null}
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
    <nav className="grid gap-2 md:grid-cols-6">
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
  const [scanStatusFilter, setScanStatusFilter] = useState("all");
  const [skipReasonFilter, setSkipReasonFilter] = useState("all");
  const [orders, setOrders] = useState(overview.recent_orders);
  const [grossMargin, setGrossMargin] = useState<AdminGrossMarginSummaryApi | null>(null);
  const [grossMarginAlertConfig, setGrossMarginAlertConfig] = useState<AdminGrossMarginAlertConfigApi | null>(null);
  const [grossMarginAlerts, setGrossMarginAlerts] = useState<AdminGrossMarginAlertEventApi[]>([]);
  const [savingGrossMarginConfig, setSavingGrossMarginConfig] = useState("");
  const [acknowledgingAlert, setAcknowledgingAlert] = useState<number | null>(null);
  const [alertNotes, setAlertNotes] = useState<Record<number, string>>({});
  const [alertStatusFilter, setAlertStatusFilter] = useState("all");
  const [alertReasonFilter, setAlertReasonFilter] = useState("all");
  const [alertDateFrom, setAlertDateFrom] = useState("");
  const [alertDateTo, setAlertDateTo] = useState("");
  const [expandedAlertId, setExpandedAlertId] = useState<number | null>(null);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState("");
  const reviewCount = overview.billing.review_needed + overview.billing.needs_review;

  useEffect(() => {
    let cancelled = false;
    const loadOrders = async () => {
      setOrdersLoading(true);
      setOrdersError("");
      try {
        const data = await adminService.billingOrders({
          limit: 100,
          auto_scan_status: scanStatusFilter === "all" ? undefined : scanStatusFilter,
          auto_scan_skip_reason: skipReasonFilter === "all" ? undefined : skipReasonFilter,
        });
        if (!cancelled) setOrders(data.items);
      } catch {
        if (!cancelled) {
          setOrders(overview.recent_orders);
          setOrdersError(t("admin.billing.filters.loadFailed"));
        }
      } finally {
        if (!cancelled) setOrdersLoading(false);
      }
    };
    void loadOrders();
    return () => {
      cancelled = true;
    };
  }, [overview.recent_orders, scanStatusFilter, skipReasonFilter, t]);

  useEffect(() => {
    let cancelled = false;
    const loadGrossMargin = async () => {
      try {
        const [data, config, alerts] = await Promise.all([
          adminService.grossMarginSummary(),
          adminService.grossMarginAlertConfig(),
          adminService.grossMarginAlertEvents({
            status: alertStatusFilter === "all" ? undefined : alertStatusFilter,
            reason: alertReasonFilter === "all" ? undefined : alertReasonFilter,
            date_from: alertDateFrom || undefined,
            date_to: alertDateTo || undefined,
            limit: 100,
          }),
        ]);
        if (!cancelled) {
          setGrossMargin(data);
          setGrossMarginAlertConfig(config);
          setGrossMarginAlerts(alerts.items);
        }
      } catch {
        if (!cancelled) {
          setGrossMargin(null);
          setGrossMarginAlertConfig(null);
          setGrossMarginAlerts([]);
        }
      }
    };
    void loadGrossMargin();
    return () => {
      cancelled = true;
    };
  }, [alertDateFrom, alertDateTo, alertReasonFilter, alertStatusFilter]);

  const updateGrossMarginAlertConfig = async (patch: Partial<AdminGrossMarginAlertConfigApi>) => {
    const key = Object.keys(patch)[0] || "gross-margin-alert";
    setSavingGrossMarginConfig(key);
    try {
      const next = await adminService.updateGrossMarginAlertConfig(patch);
      setGrossMarginAlertConfig(next);
      const data = await adminService.grossMarginSummary();
      setGrossMargin(data);
    } finally {
      setSavingGrossMarginConfig("");
    }
  };

  const acknowledgeGrossMarginAlert = async (alertId: number) => {
    setAcknowledgingAlert(alertId);
    try {
      const next = await adminService.acknowledgeGrossMarginAlert(alertId, { note: alertNotes[alertId] || "" });
      setGrossMarginAlerts((items) => items.map((item) => (item.id === alertId ? next : item)));
    } finally {
      setAcknowledgingAlert(null);
    }
  };

  return (
    <div className="space-y-4">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Metric label={t("admin.billing.total")} value={overview.billing.total} icon={ReceiptText} />
        <Metric label={t("admin.billing.pending")} value={overview.billing.pending} icon={ReceiptText} tone="warn" />
        <Metric label={t("admin.billing.paid")} value={overview.billing.paid} icon={CheckCircle2} tone="good" />
        <Metric label={t("admin.billing.review")} value={reviewCount} icon={AlertTriangle} tone={reviewCount > 0 ? "warn" : "good"} />
        <Metric label={t("admin.billing.mismatch")} value={overview.billing.mismatch} icon={AlertTriangle} tone={overview.billing.mismatch > 0 ? "danger" : "default"} />
      </section>
      {grossMargin ? (
        <Card className="bg-[#0f1419]">
          <CardHeader title={t("admin.billing.margin.title")} description={t("admin.billing.margin.description", { target: formatBps(grossMargin.target_bps) })} />
          <div className="grid gap-3 md:grid-cols-4">
            <Metric label={t("admin.billing.margin.revenue")} value={`${grossMargin.revenue_amount} USDT`} icon={ReceiptText} tone="good" />
            <Metric label={t("admin.billing.margin.cost")} value={`${grossMargin.total_cost} USDT`} icon={AlertTriangle} tone={grossMargin.status === "below_target" ? "danger" : "warn"} />
            <Metric label={t("admin.billing.margin.profit")} value={`${grossMargin.gross_profit} USDT`} icon={Coins} tone={grossMargin.gross_profit_cents >= 0 ? "good" : "danger"} />
            <Metric label={t("admin.billing.margin.rate")} value={formatBps(grossMargin.gross_margin_bps)} icon={ShieldCheck} tone={grossMargin.status === "healthy" ? "good" : "danger"} />
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
              <p className="text-sm font-semibold text-white">{t("admin.billing.margin.costBreakdown")}</p>
              <div className="mt-3 space-y-2">
                {grossMargin.costs.map((item) => (
                  <div key={item.key} className="flex flex-wrap items-center justify-between gap-3 text-sm">
                    <span className="text-[#71767b]">{t(`admin.billing.margin.cost.${item.key}`)}</span>
                    <span className="font-semibold text-white">{item.amount} USDT · {formatBps(item.share_bps)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
              <p className="text-sm font-semibold text-white">{t("admin.billing.margin.revenueByPlan")}</p>
              <div className="mt-3 space-y-2">
                {grossMargin.revenue_by_plan.length === 0 ? (
                  <p className="text-sm text-[#71767b]">{t("admin.billing.margin.noRevenue")}</p>
                ) : (
                  grossMargin.revenue_by_plan.map((item) => (
                    <div key={item.plan_code} className="flex flex-wrap items-center justify-between gap-3 text-sm">
                      <span className="text-[#71767b]">{planLabel(item.plan_code, t)} · {item.orders}</span>
                      <span className="font-semibold text-white">{item.amount} USDT</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
          {grossMarginAlertConfig ? (
            <div className="mt-4 rounded-2xl border border-[#2f3336] bg-black p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">{t("admin.billing.margin.alertConfig")}</p>
                  <p className="mt-1 text-xs text-[#71767b]">{t("admin.billing.margin.alertConfigDesc")}</p>
                </div>
                <Button
                  type="button"
                  variant={grossMarginAlertConfig.enabled ? "default" : "outline"}
                  disabled={savingGrossMarginConfig === "enabled"}
                  onClick={() => void updateGrossMarginAlertConfig({ enabled: !grossMarginAlertConfig.enabled })}
                >
                  {grossMarginAlertConfig.enabled ? t("admin.points.enabled") : t("admin.points.disabled")}
                </Button>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <RiskInput label={t("admin.billing.margin.targetBps")} value={grossMarginAlertConfig.target_margin_bps} disabled={savingGrossMarginConfig === "target_margin_bps"} onSave={(value) => updateGrossMarginAlertConfig({ target_margin_bps: value })} />
                <RiskInput label={t("admin.billing.margin.openaiBps")} value={grossMarginAlertConfig.openai_cost_share_threshold_bps} disabled={savingGrossMarginConfig === "openai_cost_share_threshold_bps"} onSave={(value) => updateGrossMarginAlertConfig({ openai_cost_share_threshold_bps: value })} />
                <RiskInput label={t("admin.billing.margin.xBps")} value={grossMarginAlertConfig.x_cost_share_threshold_bps} disabled={savingGrossMarginConfig === "x_cost_share_threshold_bps"} onSave={(value) => updateGrossMarginAlertConfig({ x_cost_share_threshold_bps: value })} />
                <RiskInput label={t("admin.billing.margin.pointBps")} value={grossMarginAlertConfig.point_cost_share_threshold_bps} disabled={savingGrossMarginConfig === "point_cost_share_threshold_bps"} onSave={(value) => updateGrossMarginAlertConfig({ point_cost_share_threshold_bps: value })} />
                <RiskInput label={t("admin.billing.margin.checkHours")} value={grossMarginAlertConfig.check_interval_hours} disabled={savingGrossMarginConfig === "check_interval_hours"} onSave={(value) => updateGrossMarginAlertConfig({ check_interval_hours: value })} />
              </div>
            </div>
          ) : null}
          <div className="mt-4 rounded-2xl border border-[#2f3336] bg-black p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-white">{t("admin.billing.margin.alertHistory")}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setAlertStatusFilter("all");
                  setAlertReasonFilter("all");
                  setAlertDateFrom("");
                  setAlertDateTo("");
                }}
              >
                {t("admin.billing.filters.reset")}
              </Button>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-4">
              <select className="form-input h-10 py-0" value={alertStatusFilter} onChange={(event) => setAlertStatusFilter(event.target.value)}>
                <option value="all">{t("admin.billing.margin.alertStatus.all")}</option>
                <option value="open">{t("admin.billing.margin.alertStatus.open")}</option>
                <option value="acknowledged">{t("admin.billing.margin.alertStatus.acknowledged")}</option>
              </select>
              <select className="form-input h-10 py-0" value={alertReasonFilter} onChange={(event) => setAlertReasonFilter(event.target.value)}>
                {grossMarginAlertReasonOptions.map((reason) => (
                  <option key={reason} value={reason}>
                    {reason === "all" ? t("admin.billing.margin.reason.all") : t(`admin.billing.margin.reason.${reason}`)}
                  </option>
                ))}
              </select>
              <Input type="date" value={alertDateFrom} onChange={(event) => setAlertDateFrom(event.target.value)} />
              <Input type="date" value={alertDateTo} onChange={(event) => setAlertDateTo(event.target.value)} />
            </div>
            <div className="mt-3 space-y-3">
              {grossMarginAlerts.length === 0 ? (
                <p className="text-sm text-[#71767b]">{t("admin.billing.margin.noAlerts")}</p>
              ) : (
                grossMarginAlerts.slice(0, 6).map((item) => (
                  <div key={item.id} className="rounded-2xl border border-[#2f3336] bg-[#0f1419] p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={item.status === "acknowledged" ? "success" : "warning"}>{t(`admin.billing.margin.alertStatus.${item.status}`)}</Badge>
                          <Badge variant={item.lark_status === "sent" ? "success" : item.lark_status === "failed" ? "danger" : "default"}>{t(`admin.billing.margin.larkStatus.${item.lark_status}`)}</Badge>
                        </div>
                        <p className="mt-2 text-sm font-semibold text-white">
                          {formatBps(item.gross_margin_bps)} · {item.gross_profit} USDT
                        </p>
                        <p className="mt-1 text-xs text-[#71767b]">{formatDate(item.created_at)}</p>
                      </div>
                      <div className="text-right text-xs text-[#71767b]">
                        <p>{t("admin.billing.margin.revenue")}: {item.revenue_amount} USDT</p>
                        <p>{t("admin.billing.margin.cost")}: {item.total_cost} USDT</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.reasons.map((reason) => (
                        <span key={reason} className="rounded-full border border-[#ffd400]/25 bg-[#ffd400]/10 px-2.5 py-1 text-xs text-[#f6d96b]">
                          {t(`admin.billing.margin.reason.${reason}`)}
                        </span>
                      ))}
                    </div>
                    {item.status === "acknowledged" ? (
                      <p className="mt-3 text-xs text-[#71767b]">{item.acknowledge_note || t("admin.billing.margin.acknowledged")}</p>
                    ) : (
                      <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
                        <Input placeholder={t("admin.billing.margin.ackNote")} value={alertNotes[item.id] || ""} onChange={(event) => setAlertNotes((prev) => ({ ...prev, [item.id]: event.target.value }))} />
                        <Button type="button" disabled={acknowledgingAlert === item.id} onClick={() => void acknowledgeGrossMarginAlert(item.id)}>
                          {t("admin.billing.margin.ack")}
                        </Button>
                      </div>
                    )}
                    <button type="button" className="mt-3 text-xs font-semibold text-[#1d9bf0]" onClick={() => setExpandedAlertId(expandedAlertId === item.id ? null : item.id)}>
                      {expandedAlertId === item.id ? t("admin.billing.margin.hideDetail") : t("admin.billing.margin.viewDetail")}
                    </button>
                    {expandedAlertId === item.id ? (
                      <div className="mt-3 grid gap-3 rounded-2xl border border-[#2f3336] bg-black p-3 text-xs text-[#71767b] md:grid-cols-2">
                        <div>
                          <p>{t("admin.billing.margin.openaiCost")}: {item.openai_cost} USDT</p>
                          <p>{t("admin.billing.margin.xCost")}: {item.x_cost} USDT</p>
                          <p>{t("admin.billing.margin.pointCost")}: {item.point_discount_cost} USDT</p>
                          <p>{t("admin.billing.margin.target")}: {formatBps(item.target_margin_bps)}</p>
                        </div>
                        <div className="min-w-0">
                          <p>{t("admin.billing.margin.period")}: {formatDate(item.period_start)} - {formatDate(item.period_end)}</p>
                          <p>{t("admin.billing.margin.ackBy")}: {item.acknowledged_by || "-"}</p>
                          <p className="break-all">{t("admin.billing.margin.larkError")}: {item.lark_error || "-"}</p>
                          <p className="break-all">{t("admin.billing.margin.configSnapshot")}: {item.config_snapshot || "-"}</p>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </Card>
      ) : null}
      <Card className="bg-[#0f1419]">
        <CardHeader title={t("admin.billing.recentTitle")} description={t("admin.billing.recentDesc")} />
        <div className="mb-4 grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <label className="space-y-1 text-xs text-[#71767b]">
            <span>{t("admin.billing.filters.autoScanStatus")}</span>
            <select className="form-input h-10 py-0" value={scanStatusFilter} onChange={(event) => setScanStatusFilter(event.target.value)}>
              {autoScanStatusOptions.map((status) => (
                <option key={status} value={status}>
                  {status === "all" ? t("admin.billing.filters.allAutoScanStatuses") : t(`billing.history.autoScan.status.${status}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs text-[#71767b]">
            <span>{t("admin.billing.filters.autoScanSkipReason")}</span>
            <select className="form-input h-10 py-0" value={skipReasonFilter} onChange={(event) => setSkipReasonFilter(event.target.value)}>
              {autoScanSkipReasonOptions.map((reason) => (
                <option key={reason} value={reason}>
                  {reason === "all" ? t("admin.billing.filters.allSkipReasons") : autoScanSkipReasonLabel(reason, t)}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            variant="outline"
            className="w-full md:w-auto"
            onClick={() => {
              setScanStatusFilter("all");
              setSkipReasonFilter("all");
            }}
          >
            {t("admin.billing.filters.reset")}
          </Button>
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-[#71767b]">
          <span>{ordersLoading ? t("admin.billing.filters.loading") : t("admin.billing.filters.loaded", { count: orders.length })}</span>
          {ordersError ? <span className="text-[#f6d96b]">{ordersError}</span> : null}
        </div>
        <div className="space-y-2">
          {orders.map((order) => (
            <div key={order.order_id} className="grid gap-3 rounded-2xl border border-[#2f3336] bg-black p-4 text-sm xl:grid-cols-[1fr_auto] xl:items-center">
              <div className="min-w-0">
                <p className="break-words font-medium text-white">
                  {t("admin.billing.orderLine", { orderId: order.order_id, userId: order.user_id })}
                </p>
                <p className="mt-1 break-words text-[#71767b]">
                  {planLabel(order.plan_code, t)} · {order.payable_amount || order.amount} {order.currency} · {order.network} · {formatDate(order.created_at)}
                </p>
                {hasOrderUpgradeCredit(order) ? <AdminProrationBreakdown order={order} /> : null}
                {order.tx_hash ? <p className="mt-1 break-all font-mono text-xs text-[#71767b]">{order.tx_hash}</p> : null}
                <AdminAutoScanInfo order={order} />
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
          {orders.length === 0 ? <p className="py-8 text-center text-sm text-[#71767b]">{t("admin.billing.empty")}</p> : null}
        </div>
      </Card>
    </div>
  );
}

function hasOrderUpgradeCredit(order: AdminOverviewApi["recent_orders"][number]) {
  return order.order_type === "upgrade" && Number.parseFloat(order.credit_amount || "0") > 0;
}

function AdminProrationBreakdown({ order }: { order: AdminOverviewApi["recent_orders"][number] }) {
  const { t } = useT();
  return (
    <div className="mt-3 grid gap-2 rounded-2xl border border-[#00ba7c]/20 bg-[#00ba7c]/5 p-3 text-xs sm:grid-cols-3">
      <AdminAmountLine label={t("billing.history.proration.original")} value={`${order.original_amount} ${order.currency}`} />
      <AdminAmountLine
        label={t("billing.history.proration.credit")}
        value={`-${order.credit_amount} ${order.currency}`}
        valueClassName="text-[#7ee0b5]"
      />
      <AdminAmountLine
        label={t("billing.history.proration.payable")}
        value={`${order.payable_amount || order.amount} ${order.currency}`}
        valueClassName="text-white"
      />
    </div>
  );
}

function AdminAutoScanInfo({ order }: { order: AdminOverviewApi["recent_orders"][number] }) {
  const { t } = useT();
  const status = normalizedAutoScanStatus(order.auto_scan_status);
  return (
    <div className="mt-3 grid gap-2 rounded-2xl border border-[#1d9bf0]/15 bg-[#1d9bf0]/5 p-3 text-xs sm:grid-cols-3">
      <AdminAmountLine
        label={t("billing.history.autoScan.title")}
        value={t(`billing.history.autoScan.status.${status}`)}
        valueClassName="text-[#cfd9de]"
      />
      <AdminAmountLine
        label={t("billing.history.autoScan.lastScannedAt")}
        value={order.auto_scanned_at ? formatDate(order.auto_scanned_at) : t("billing.history.autoScan.notScanned")}
        valueClassName="text-[#cfd9de]"
      />
      <AdminAmountLine
        label={t("billing.history.autoScan.skipReason")}
        value={autoScanSkipReasonLabel(order.auto_scan_skip_reason, t)}
        valueClassName="whitespace-normal break-words text-[#cfd9de]"
      />
    </div>
  );
}

function AdminAmountLine({ label, value, valueClassName = "text-[#e7e9ea]" }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[#71767b]">{label}</div>
      <div className={`mt-1 whitespace-nowrap font-semibold ${valueClassName}`}>{value}</div>
    </div>
  );
}

function PointsAdminSection({
  activities,
  users,
  riskConfig,
  redemptionCodes,
  referralSummary,
  pointCostSummary,
  query,
  submittingKey,
  onQueryChange,
  onRefresh,
  onUpdateActivity,
  onAdjustPoints,
  onUpdateRiskConfig,
  onCreateRedemptionCode,
}: {
  activities: AdminPointActivityApi[];
  users: AdminPointUserApi[];
  riskConfig: AdminPointRiskConfigApi | null;
  redemptionCodes: AdminPointRedemptionCodeApi[];
  referralSummary: AdminReferralSummaryApi | null;
  pointCostSummary: AdminPointCostSummaryApi | null;
  query: string;
  submittingKey: string;
  onQueryChange: (value: string) => void;
  onRefresh: () => void;
  onUpdateActivity: (activity: AdminPointActivityApi, patch: Partial<AdminPointActivityApi>) => void;
  onAdjustPoints: (userId: number, points: number, reason: string) => void;
  onUpdateRiskConfig: (patch: Partial<AdminPointRiskConfigApi>) => void;
  onCreateRedemptionCode: (payload: { code: string; title: string; points: number; max_uses: number }) => void;
}) {
  const { t } = useT();
  const [adjustValues, setAdjustValues] = useState<Record<number, { points: string; reason: string }>>({});
  const [codeForm, setCodeForm] = useState({ code: "", title: "", points: "10", maxUses: "100" });
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <Metric label={t("admin.points.metrics.activities")} value={activities.length} icon={GiftIcon} />
        <Metric label={t("admin.points.metrics.users")} value={users.length} icon={Users} tone="good" />
        <Metric label={t("admin.points.metrics.balance")} value={users.reduce((sum, user) => sum + user.balance, 0)} icon={Coins} />
      </div>

      {pointCostSummary ? (
        <Card className="bg-[#0f1419]">
          <CardHeader title={t("admin.points.cost.title")} description={t("admin.points.cost.description", { points: pointCostSummary.points_per_usdt })} />
          <div className="grid gap-3 md:grid-cols-4">
            <Metric label={t("admin.points.cost.earned")} value={`${pointCostSummary.earned_points} / ${pointCostSummary.earned_usdt} USDT`} icon={Coins} />
            <Metric label={t("admin.points.cost.discounted")} value={`${pointCostSummary.discounted_points} / ${pointCostSummary.discounted_usdt} USDT`} icon={ReceiptText} tone="warn" />
            <Metric label={t("admin.points.cost.expired")} value={`${pointCostSummary.expired_points} / ${pointCostSummary.expired_usdt} USDT`} icon={AlertTriangle} />
            <Metric label={t("admin.points.cost.outstanding")} value={`${pointCostSummary.outstanding_points} / ${pointCostSummary.outstanding_usdt} USDT`} icon={ShieldCheck} tone="good" />
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
            {pointCostSummary.monthly_earned_by_source.map((item) => (
              <div key={item.source} className="rounded-2xl border border-[#2f3336] bg-black p-3">
                <p className="text-xs text-[#71767b]">{t(`admin.points.cost.source.${item.source}`)}</p>
                <p className="mt-2 font-semibold text-white">{item.points}</p>
                <p className="mt-1 text-xs text-[#71767b]">{item.usdt_amount} USDT</p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {riskConfig ? (
        <Card className="bg-[#0f1419]">
          <CardHeader title={t("admin.points.risk.title")} description={t("admin.points.risk.description")} />
          <div className="grid gap-3 lg:grid-cols-[160px_1fr_1fr_1fr_1fr]">
            <button
              type="button"
              className={`rounded-2xl border p-4 text-left ${riskConfig.enabled ? "border-[#00ba7c]/25 bg-[#00ba7c]/10" : "border-[#2f3336] bg-black"}`}
              disabled={submittingKey === "risk"}
              onClick={() => onUpdateRiskConfig({ enabled: !riskConfig.enabled })}
            >
              <p className="text-xs text-[#71767b]">{t("admin.points.risk.enabled")}</p>
              <p className="mt-2 font-semibold text-white">{riskConfig.enabled ? t("admin.points.enabled") : t("admin.points.disabled")}</p>
            </button>
            <RiskInput
              label={t("admin.points.risk.dailyEarn")}
              value={riskConfig.daily_earn_limit}
              disabled={submittingKey === "risk"}
              onSave={(value) => onUpdateRiskConfig({ daily_earn_limit: value })}
            />
            <RiskInput
              label={t("admin.points.risk.monthlyDiscount")}
              value={riskConfig.monthly_discount_limit}
              disabled={submittingKey === "risk"}
              onSave={(value) => onUpdateRiskConfig({ monthly_discount_limit: value })}
            />
            <RiskInput
              label={t("admin.points.risk.largeAdjust")}
              value={riskConfig.large_adjustment_alert_threshold}
              disabled={submittingKey === "risk"}
              onSave={(value) => onUpdateRiskConfig({ large_adjustment_alert_threshold: value })}
            />
            <RiskInput
              label={t("admin.points.risk.expiryDays")}
              value={riskConfig.point_expiry_days}
              disabled={submittingKey === "risk"}
              onSave={(value) => onUpdateRiskConfig({ point_expiry_days: value })}
            />
          </div>
        </Card>
      ) : null}

      {referralSummary ? (
        <Card className="bg-[#0f1419]">
          <CardHeader title={t("admin.points.referral.title")} description={t("admin.points.referral.description")} />
          <div className="grid gap-3 md:grid-cols-5">
            <Metric label={t("admin.points.referral.inviteCodes")} value={referralSummary.invite_codes} icon={Users} />
            <Metric label={t("admin.points.referral.signups")} value={referralSummary.referral_signups} icon={Users} tone="good" />
            <Metric label={t("admin.points.referral.purchases")} value={referralSummary.first_purchase_rewards} icon={CheckCircle2} tone="good" />
            <Metric label={t("admin.points.referral.signupPoints")} value={referralSummary.signup_reward_points} icon={Coins} />
            <Metric label={t("admin.points.referral.purchasePoints")} value={referralSummary.purchase_reward_points} icon={Coins} />
          </div>
        </Card>
      ) : null}

      <Card className="bg-[#0f1419]">
        <CardHeader title={t("admin.points.redemption.title")} description={t("admin.points.redemption.description")} />
        <div className="grid gap-2 lg:grid-cols-[1fr_1fr_120px_120px_auto]">
          <Input placeholder={t("admin.points.redemption.code")} value={codeForm.code} onChange={(event) => setCodeForm((v) => ({ ...v, code: event.target.value.toUpperCase() }))} />
          <Input placeholder={t("admin.points.redemption.name")} value={codeForm.title} onChange={(event) => setCodeForm((v) => ({ ...v, title: event.target.value }))} />
          <Input type="number" min={1} placeholder={t("admin.points.points")} value={codeForm.points} onChange={(event) => setCodeForm((v) => ({ ...v, points: event.target.value }))} />
          <Input type="number" min={0} placeholder={t("admin.points.redemption.maxUses")} value={codeForm.maxUses} onChange={(event) => setCodeForm((v) => ({ ...v, maxUses: event.target.value }))} />
          <Button
            type="button"
            disabled={submittingKey === "redemption" || !codeForm.code.trim() || !codeForm.title.trim()}
            onClick={() => onCreateRedemptionCode({ code: codeForm.code, title: codeForm.title, points: Number(codeForm.points) || 1, max_uses: Number(codeForm.maxUses) || 0 })}
          >
            {t("admin.points.redemption.create")}
          </Button>
        </div>
        <div className="mt-4 grid gap-2">
          {redemptionCodes.slice(0, 8).map((code) => (
            <div key={code.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#2f3336] bg-black p-3 text-sm">
              <div>
                <p className="font-mono font-semibold text-white">{code.code}</p>
                <p className="text-xs text-[#71767b]">{code.title}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-[#71767b]">
                <Badge variant={code.enabled ? "success" : "default"}>{code.enabled ? t("admin.points.enabled") : t("admin.points.disabled")}</Badge>
                <span>+{code.points}</span>
                <span>{code.used_count}/{code.max_uses || "∞"}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="bg-[#0f1419]">
        <CardHeader title={t("admin.points.activities.title")} description={t("admin.points.activities.description")} />
        <div className="grid gap-3 lg:grid-cols-3">
          {activities.map((activity) => (
            <div key={activity.id} className="rounded-2xl border border-[#2f3336] bg-black p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-white">{activity.title}</p>
                  <p className="mt-1 text-xs text-[#71767b]">{activity.code}</p>
                </div>
                <Badge variant={activity.enabled ? "success" : "default"}>{activity.enabled ? t("admin.points.enabled") : t("admin.points.disabled")}</Badge>
              </div>
              <p className="mt-3 min-h-10 text-sm leading-relaxed text-[#71767b]">{activity.description}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <label className="text-xs text-[#71767b]">
                  {t("admin.points.points")}
                  <Input
                    className="mt-1"
                    type="number"
                    min={1}
                    value={activity.points}
                    disabled={submittingKey === `activity:${activity.id}`}
                    onChange={(event) => onUpdateActivity(activity, { points: Number(event.target.value) || 1 })}
                  />
                </label>
                <label className="text-xs text-[#71767b]">
                  {t("admin.points.period")}
                  <select
                    className="form-input mt-1 h-10 w-full"
                    value={activity.claim_period}
                    disabled={submittingKey === `activity:${activity.id}`}
                    onChange={(event) => onUpdateActivity(activity, { claim_period: event.target.value })}
                  >
                    <option value="once">once</option>
                    <option value="daily">daily</option>
                    <option value="monthly">monthly</option>
                  </select>
                </label>
              </div>
              <Button
                type="button"
                className="mt-3 w-full"
                variant={activity.enabled ? "outline" : "default"}
                disabled={submittingKey === `activity:${activity.id}`}
                onClick={() => onUpdateActivity(activity, { enabled: !activity.enabled })}
              >
                {activity.enabled ? t("admin.points.disable") : t("admin.points.enable")}
              </Button>
            </div>
          ))}
        </div>
      </Card>

      <Card className="bg-[#0f1419]">
        <CardHeader
          title={t("admin.points.users.title")}
          description={t("admin.points.users.description")}
          right={
            <Button type="button" size="sm" variant="outline" onClick={onRefresh}>
              <RefreshCcw className="size-4" />
              {t("admin.actions.refresh")}
            </Button>
          }
        />
        <div className="mb-3 max-w-md">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#71767b]" />
            <Input className="pl-9" placeholder={t("admin.points.users.search")} value={query} onChange={(event) => onQueryChange(event.target.value)} />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-[#71767b]">
              <tr>
                <th className="px-3 py-2 font-medium">{t("admin.users.table.user")}</th>
                <th className="px-3 py-2 font-medium">{t("points.metrics.balance")}</th>
                <th className="px-3 py-2 font-medium">{t("points.metrics.frozen")}</th>
                <th className="px-3 py-2 font-medium">{t("admin.points.adjust")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2f3336]">
              {users.map((user) => {
                const form = adjustValues[user.user_id] || { points: "", reason: "" };
                return (
                  <tr key={user.user_id}>
                    <td className="px-3 py-3">
                      <p className="font-medium text-white">{user.name || user.email || `#${user.user_id}`}</p>
                      <p className="text-xs text-[#71767b]">{user.email || `ID ${user.user_id}`}</p>
                    </td>
                    <td className="px-3 py-3 text-white">{user.balance}</td>
                    <td className="px-3 py-3 text-white">{user.frozen}</td>
                    <td className="px-3 py-3">
                      <div className="grid min-w-[360px] gap-2 md:grid-cols-[96px_1fr_auto]">
                        <Input
                          type="number"
                          placeholder="+/-"
                          value={form.points}
                          onChange={(event) => setAdjustValues((prev) => ({ ...prev, [user.user_id]: { ...form, points: event.target.value } }))}
                        />
                        <Input
                          placeholder={t("admin.points.reason")}
                          value={form.reason}
                          onChange={(event) => setAdjustValues((prev) => ({ ...prev, [user.user_id]: { ...form, reason: event.target.value } }))}
                        />
                        <Button
                          type="button"
                          disabled={submittingKey === `user:${user.user_id}` || !form.points || !form.reason.trim()}
                          onClick={() => onAdjustPoints(user.user_id, Number(form.points), form.reason)}
                        >
                          {t("admin.points.apply")}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function RiskInput({ label, value, disabled, onSave }: { label: string; value: number; disabled?: boolean; onSave: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <label className="rounded-2xl border border-[#2f3336] bg-black p-4 text-xs text-[#71767b]">
      {label}
      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
        <Input type="number" min={0} value={draft} disabled={disabled} onChange={(event) => setDraft(event.target.value)} />
        <Button type="button" disabled={disabled || Number(draft) === value || Number(draft) < 0} onClick={() => onSave(Number(draft) || 0)}>
          OK
        </Button>
      </div>
    </label>
  );
}

const GiftIcon = Coins;

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
