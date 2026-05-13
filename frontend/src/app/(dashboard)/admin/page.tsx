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

type LoadState = "loading" | "ready" | "error" | "forbidden";
type AdminSection = "overview" | "users" | "billing" | "activity" | "system";

const sections: Array<{ id: AdminSection; label: string; description: string; icon: LucideIcon }> = [
  { id: "overview", label: "运营总览", description: "核心指标和待处理事项", icon: LayoutDashboard },
  { id: "users", label: "用户管理", description: "用户、角色、状态和订阅", icon: Users },
  { id: "billing", label: "订单审核", description: "支付订单和人工复核", icon: ReceiptText },
  { id: "activity", label: "活动监控", description: "失败、待审核和执行记录", icon: Activity },
  { id: "system", label: "系统配置", description: "邮件、授权、支付和前端地址", icon: Settings },
];

const roleOptions = [
  { value: "all", label: "全部角色" },
  { value: "owner", label: "所有者" },
  { value: "admin", label: "管理员" },
  { value: "user", label: "普通用户" },
];

const statusOptions = [
  { value: "all", label: "全部状态" },
  { value: "active", label: "正常" },
  { value: "suspended", label: "已停用" },
];

function roleLabel(role: string) {
  const r = role.toLowerCase();
  if (r === "owner") return "所有者";
  if (r === "admin") return "管理员";
  if (r === "user") return "普通用户";
  return role || "未知角色";
}

function statusLabel(status: string) {
  const s = status.toLowerCase();
  const labels: Record<string, string> = {
    active: "正常",
    suspended: "已停用",
    paid: "已支付",
    pending: "待支付",
    failed: "失败",
    expired: "已过期",
    success: "成功",
    review: "待审核",
    matched: "已匹配",
    mismatch: "不匹配",
    unchecked: "未检查",
    needs_review: "需复核",
    review_needed: "待复核",
    reviewed: "已复核",
    unreviewed: "未复核",
  };
  return labels[s] || status || "未知状态";
}

function planLabel(plan: string) {
  const p = plan.toLowerCase();
  if (p === "free_trial") return "免费试用";
  if (p === "basic_monthly") return "基础月付";
  if (p === "basic") return "基础版";
  return plan || "无套餐";
}

function subscriptionLabel(status: string) {
  const s = status.toLowerCase();
  if (s === "active") return "订阅有效";
  if (s === "expired") return "订阅过期";
  if (s === "none" || s === "") return "未订阅";
  return status;
}

function providerLabel(provider: string) {
  const p = provider.toLowerCase();
  if (p === "local") return "本地模拟";
  if (p === "resend") return "Resend";
  if (p === "ses") return "Amazon SES";
  return provider || "未配置";
}

function activityTypeLabel(type: string) {
  const t = type.toLowerCase();
  if (t === "post") return "帖子";
  if (t === "reply") return "回复";
  if (t === "dm") return "私信";
  return type || "未知活动";
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
      ? "border-emerald-300/20 bg-emerald-400/8"
      : tone === "warn"
        ? "border-amber-300/20 bg-amber-400/8"
        : tone === "danger"
          ? "border-rose-300/20 bg-rose-400/8"
          : "border-white/10 bg-white/5";
  return (
    <div className={`rounded-lg border p-4 ${toneClass}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-white/60">{label}</p>
        <Icon className="size-4 text-white/55" />
      </div>
      <p className="mt-3 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { pushToast } = useToast();
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
        const msg = getErrorMessage(error, "后台数据加载失败。");
        setErrorMessage(msg);
        setLoadState(statusCode === 403 ? "forbidden" : "error");
        if (quiet) pushToast(msg);
      }
    },
    [pushToast, userParams]
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
      pushToast("用户已更新。");
    } catch (error) {
      pushToast(getErrorMessage(error, "用户更新失败。"));
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
      pushToast("订单审核状态已更新。");
    } catch (error) {
      pushToast(getErrorMessage(error, "订单审核状态更新失败。"));
    } finally {
      setSubmittingOrder(null);
    }
  };

  if (loadState === "loading") {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-white/10" />
        <div className="grid gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-lg border border-white/10 bg-white/5" />
          ))}
        </div>
      </div>
    );
  }

  if (loadState === "forbidden") {
    return (
      <Card>
        <CardHeader title="无后台权限" description={errorMessage || "当前账号不是所有者或管理员，无法访问后台管理。"} />
      </Card>
    );
  }

  if (loadState === "error" || !overview) {
    return (
      <Card>
        <CardHeader title="后台加载失败" description={errorMessage || "请稍后重试。"} />
        <Button type="button" onClick={() => void fetchAdmin()}>
          <RefreshCcw className="size-4" />
          重试
        </Button>
      </Card>
    );
  }

  const activeMeta = sections.find((item) => item.id === activeSection) ?? sections[0];

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-blue-200">
            <ShieldCheck className="size-4" />
            管理员控制台
          </div>
          <h1 className="mt-2 text-2xl font-semibold text-white">{activeMeta.label}</h1>
          <p className="mt-1 text-sm text-white/60">
            当前操作人：{overview.operator.email} · {activeMeta.description}
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void fetchAdmin({ quiet: true })}>
          <RefreshCcw className="size-4" />
          刷新
        </Button>
      </section>

      <nav className="grid gap-2 md:grid-cols-5">
        {sections.map((section) => {
          const Icon = section.icon;
          const active = section.id === activeSection;
          return (
            <button
              key={section.id}
              type="button"
              className={`rounded-lg border px-3 py-3 text-left transition-colors ${
                active ? "border-blue-300/35 bg-blue-400/12 text-white" : "border-white/10 bg-white/[0.035] text-white/65 hover:bg-white/8"
              }`}
              onClick={() => setSection(section.id)}
            >
              <div className="flex items-center gap-2 text-sm font-medium">
                <Icon className="size-4" />
                {section.label}
              </div>
              <p className="mt-1 text-xs text-white/45">{section.description}</p>
            </button>
          );
        })}
      </nav>

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
      {activeSection === "billing" ? (
        <BillingSection overview={overview} submittingOrder={submittingOrder} onUpdateOrder={updateOrder} />
      ) : null}
      {activeSection === "activity" ? <ActivitySection overview={overview} /> : null}
      {activeSection === "system" ? <SystemSection overview={overview} /> : null}
    </div>
  );
}

function OverviewSection({ overview, onNavigate }: { overview: AdminOverviewApi; onNavigate: (section: AdminSection) => void }) {
  return (
    <div className="space-y-4">
      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="用户总数" value={overview.users.total} icon={Users} />
        <Metric label="待审核订单" value={overview.billing.review_needed + overview.billing.needs_review} icon={ReceiptText} tone="warn" />
        <Metric label="24h 失败活动" value={overview.activity.failed} icon={AlertTriangle} tone={overview.activity.failed > 0 ? "danger" : "good"} />
        <Metric label="已连接 X 账号" value={overview.content.connected_accounts} icon={CheckCircle2} tone="good" />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="今日待处理" description="优先处理会影响用户使用和收入确认的事项。" />
          <div className="grid gap-3 md:grid-cols-3">
            <ActionTile
              label="订单待复核"
              value={overview.billing.review_needed + overview.billing.needs_review}
              tone="warn"
              action="处理订单"
              onClick={() => onNavigate("billing")}
            />
            <ActionTile
              label="失败活动"
              value={overview.activity.failed}
              tone={overview.activity.failed > 0 ? "danger" : "good"}
              action="查看活动"
              onClick={() => onNavigate("activity")}
            />
            <ActionTile
              label="配置缺口"
              value={configIssueCount(overview)}
              tone={configIssueCount(overview) > 0 ? "warn" : "good"}
              action="检查配置"
              onClick={() => onNavigate("system")}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="业务概览" description="用户、内容和自动化运行状态。" />
          <div className="grid grid-cols-2 gap-3">
            <Metric label="正常用户" value={overview.users.active} icon={Users} tone="good" />
            <Metric label="已停用用户" value={overview.users.suspended} icon={Users} tone={overview.users.suspended > 0 ? "warn" : "default"} />
            <Metric label="已发布内容" value={overview.content.published_posts} icon={Activity} />
            <Metric label="启用自动化" value={overview.content.enabled_automations} icon={Settings} />
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
  const canChangeRole = overview.operator.role === "owner";
  return (
    <Card>
      <CardHeader
        title="用户管理"
        description={canChangeRole ? "所有者可调整角色；所有者和管理员可停用或恢复用户。" : "管理员可停用或恢复用户；角色调整仅所有者可操作。"}
        right={<Badge variant="info">{users.length} / {totalUsers}</Badge>}
      />
      <div className="mb-4 grid gap-2 md:grid-cols-[1fr_160px_160px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-white/35" />
          <Input className="pl-9" placeholder="搜索邮箱或名称" value={query} onChange={(event) => onQueryChange(event.target.value)} />
        </div>
        <select className="form-input" value={role} onChange={(event) => onRoleChange(event.target.value)}>
          {roleOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select className="form-input" value={status} onChange={(event) => onStatusChange(event.target.value)}>
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="border-b border-white/10 text-xs uppercase text-white/45">
            <tr>
              <th className="px-3 py-2 font-medium">用户</th>
              <th className="px-3 py-2 font-medium">角色</th>
              <th className="px-3 py-2 font-medium">状态</th>
              <th className="px-3 py-2 font-medium">订阅</th>
              <th className="px-3 py-2 font-medium">创建时间</th>
              <th className="px-3 py-2 font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/8">
            {users.map((user) => {
              const isSelf = user.id === overview.operator.id;
              return (
                <tr key={user.id} className="text-white/78">
                  <td className="px-3 py-3">
                    <p className="font-medium text-white">{user.name || `用户 #${user.id}`}</p>
                    <p className="text-xs text-white/50">{user.email}</p>
                  </td>
                  <td className="px-3 py-3">
                    <Badge variant={roleVariant(user.role)}>{roleLabel(user.role)}</Badge>
                  </td>
                  <td className="px-3 py-3">
                    <Badge variant={statusVariant(user.status)}>{statusLabel(user.status)}</Badge>
                  </td>
                  <td className="px-3 py-3">
                    <p>{planLabel(user.subscription_plan_code)}</p>
                    <p className="text-xs text-white/45">{subscriptionLabel(user.subscription_status)}</p>
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
                          <option value="user">普通用户</option>
                          <option value="admin">管理员</option>
                          <option value="owner">所有者</option>
                        </select>
                      ) : (
                        <span className="text-xs text-white/45">仅所有者可调角色</span>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant={user.status === "active" ? "outline" : "secondary"}
                        disabled={submittingUser === user.id || isSelf}
                        onClick={() => void onUpdateUser(user.id, { status: user.status === "active" ? "suspended" : "active" })}
                      >
                        <UserCog className="size-3.5" />
                        {isSelf ? "当前账号" : user.status === "active" ? "停用" : "恢复"}
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {users.length === 0 ? (
              <tr>
                <td className="px-3 py-8 text-center text-white/50" colSpan={6}>
                  没有匹配的用户。
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </Card>
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
  return (
    <div className="space-y-4">
      <section className="grid gap-3 md:grid-cols-5">
        <Metric label="全部订单" value={overview.billing.total} icon={ReceiptText} />
        <Metric label="待支付" value={overview.billing.pending} icon={ReceiptText} tone="warn" />
        <Metric label="支付成功" value={overview.billing.paid} icon={CheckCircle2} tone="good" />
        <Metric label="需复核" value={overview.billing.review_needed + overview.billing.needs_review} icon={AlertTriangle} tone="warn" />
        <Metric label="不匹配" value={overview.billing.mismatch} icon={AlertTriangle} tone={overview.billing.mismatch > 0 ? "danger" : "default"} />
      </section>
      <Card>
        <CardHeader title="最近订单" description="管理员可直接将异常订单标为待复核或已复核。" />
        <div className="space-y-2">
          {overview.recent_orders.map((order) => (
            <div key={order.order_id} className="grid gap-3 rounded-lg border border-white/10 bg-white/5 p-3 text-sm xl:grid-cols-[1fr_auto] xl:items-center">
              <div>
                <p className="font-medium text-white">订单 #{order.order_id} · 用户 #{order.user_id}</p>
                <p className="mt-1 text-white/55">
                  {planLabel(order.plan_code)} · {order.amount} {order.currency} · {order.network} · {formatDate(order.created_at)}
                </p>
                {order.tx_hash ? <p className="mt-1 break-all font-mono text-xs text-white/40">{order.tx_hash}</p> : null}
              </div>
              <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                <Badge variant={statusVariant(order.status)}>{statusLabel(order.status)}</Badge>
                <Badge variant={statusVariant(order.reconciliation_status)}>{statusLabel(order.reconciliation_status)}</Badge>
                <Badge variant={statusVariant(order.review_status)}>{statusLabel(order.review_status)}</Badge>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={submittingOrder === `${order.order_id}:mark_review_needed`}
                  onClick={() => void onUpdateOrder(order.order_id, "mark_review_needed")}
                >
                  标为待复核
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={submittingOrder === `${order.order_id}:mark_reviewed`}
                  onClick={() => void onUpdateOrder(order.order_id, "mark_reviewed")}
                >
                  标为已复核
                </Button>
              </div>
            </div>
          ))}
          {overview.recent_orders.length === 0 ? <p className="py-6 text-center text-sm text-white/50">暂无订单。</p> : null}
        </div>
      </Card>
    </div>
  );
}

function ActivitySection({ overview }: { overview: AdminOverviewApi }) {
  return (
    <div className="space-y-4">
      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="24h 活动" value={overview.activity.last_24h} icon={Activity} />
        <Metric label="成功" value={overview.activity.success} icon={CheckCircle2} tone="good" />
        <Metric label="失败" value={overview.activity.failed} icon={AlertTriangle} tone={overview.activity.failed > 0 ? "danger" : "default"} />
        <Metric label="待审核" value={overview.activity.review} icon={AlertTriangle} tone="warn" />
      </section>
      <Card>
        <CardHeader title="最近活动" description="快速发现失败、待审核和自动化异常。" />
        <div className="space-y-2">
          {overview.recent_events.map((event) => (
            <div key={event.id} className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-white">
                  {activityTypeLabel(event.type)} · 用户 #{event.user_id}
                </p>
                <Badge variant={statusVariant(event.status)}>{statusLabel(event.status)}</Badge>
              </div>
              <p className="mt-1 text-white/55">
                {event.account_handle || "无账号"} · {formatDate(event.executed_at)}
              </p>
              {event.error_message ? <p className="mt-2 line-clamp-2 text-xs text-rose-200">{event.error_message}</p> : null}
            </div>
          ))}
          {overview.recent_events.length === 0 ? <p className="py-6 text-center text-sm text-white/50">暂无活动。</p> : null}
        </div>
      </Card>
    </div>
  );
}

function SystemSection({ overview }: { overview: AdminOverviewApi }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
      <Card>
        <CardHeader title="上线配置检查" description="只展示影响测试和上线链路的关键配置。" />
        <div className="space-y-3 text-sm">
          <ConfigRow label="邮件服务" value={providerLabel(overview.config.email_provider)} ok={overview.config.email_provider !== ""} />
          <ConfigRow label="Resend 密钥" value={overview.config.resend_configured ? "已配置" : "未配置"} ok={overview.config.resend_configured} />
          <ConfigRow label="X 授权" value={overview.config.x_oauth_configured ? "已配置" : "未配置"} ok={overview.config.x_oauth_configured} />
          <ConfigRow label="支付方式数量" value={`${overview.config.billing_method_count} 个`} ok={overview.config.billing_method_count > 0} />
          <ConfigRow label="前端地址" value={overview.config.frontend_base_url || "未配置"} ok={overview.config.frontend_base_url !== ""} />
        </div>
      </Card>
      <Card>
        <CardHeader title="内容与自动化" description="用于判断用户端核心功能是否有真实数据。" />
        <div className="grid gap-3 md:grid-cols-3">
          <Metric label="已连接 X 账号" value={overview.content.connected_accounts} icon={Users} />
          <Metric label="全部内容" value={overview.content.posts} icon={Activity} />
          <Metric label="已发布内容" value={overview.content.published_posts} icon={CheckCircle2} tone="good" />
          <Metric label="排队内容" value={overview.content.scheduled_posts} icon={Activity} />
          <Metric label="失败内容" value={overview.content.failed_posts} icon={AlertTriangle} tone={overview.content.failed_posts > 0 ? "danger" : "default"} />
          <Metric label="启用自动化" value={overview.content.enabled_automations} icon={Settings} />
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
  const toneClass = tone === "good" ? "border-emerald-300/20 bg-emerald-400/8" : tone === "danger" ? "border-rose-300/20 bg-rose-400/8" : "border-amber-300/20 bg-amber-400/8";
  return (
    <div className={`rounded-lg border p-4 ${toneClass}`}>
      <p className="text-sm text-white/60">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      <Button type="button" className="mt-4" size="sm" variant="outline" onClick={onClick}>
        {action}
      </Button>
    </div>
  );
}

function ConfigRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
      <span className="text-white/60">{label}</span>
      <span className="flex items-center gap-2 text-right text-white">
        {ok ? <CheckCircle2 className="size-4 text-emerald-300" /> : <AlertTriangle className="size-4 text-amber-300" />}
        {value}
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
