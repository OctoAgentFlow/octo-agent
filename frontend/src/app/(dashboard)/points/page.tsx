"use client";

import { useCallback, useEffect, useState } from "react";
import { Coins, Copy, Gift, History, Lock } from "lucide-react";

import { SectionCard } from "@/components/dashboard/section-card";
import { useToast } from "@/components/providers/toast-provider";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { useT } from "@/i18n/use-t";
import { broadcastDataSynced, broadcastPageRefreshComplete, subscribePageRefreshRequest } from "@/lib/app-page-refresh";
import { pointService, type PointCenterApi } from "@/services/point.service";
import { referralService, type ReferralInfoApi } from "@/services/referral.service";

export default function PointsPage() {
  const { t } = useT();
  const { pushToast } = useToast();
  const [data, setData] = useState<PointCenterApi | null>(null);
  const [referral, setReferral] = useState<ReferralInfoApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState("");
  const [redeemCode, setRedeemCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const [next, referralInfo] = await Promise.all([pointService.center(), referralService.info()]);
      setData(next);
      setReferral(referralInfo);
      broadcastDataSynced(Date.now());
    } catch {
      pushToast(t("points.toast.loadFailed"));
    } finally {
      setLoading(false);
      broadcastPageRefreshComplete();
    }
  }, [pushToast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => subscribePageRefreshRequest(() => void load(true)), [load]);

  const claim = async (code: string) => {
    setClaiming(code);
    try {
      const next = await pointService.claim(code);
      setData(next);
      pushToast(t("points.toast.claimed"));
    } catch (error) {
      pushToast(error instanceof Error ? error.message : t("points.toast.claimFailed"));
    } finally {
      setClaiming("");
    }
  };

  const copyInvite = async () => {
    if (!referral?.invite_link) return;
    try {
      await navigator.clipboard.writeText(referral.invite_link);
      pushToast(t("points.referral.copied"));
    } catch {
      pushToast(t("points.referral.copyFailed"));
    }
  };

  const redeem = async () => {
    if (!redeemCode.trim()) return;
    setRedeeming(true);
    try {
      const next = await pointService.redeem(redeemCode.trim());
      setData(next);
      setRedeemCode("");
      pushToast(t("points.redeem.success"));
    } catch (error) {
      pushToast(error instanceof Error ? error.message : t("points.redeem.failed"));
    } finally {
      setRedeeming(false);
    }
  };

  if (loading && !data) {
    return <Card><CardHeader title={t("points.loading.title")} description={t("points.loading.description")} /></Card>;
  }

  const account = data?.account;
  const positiveEvents = new Set(["earn", "release", "refund"]);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm text-[#1d9bf0]"><Coins className="size-4" /> {t("points.page.eyebrow")}</p>
          <h1 className="mt-2 text-2xl font-bold text-[#e7e9ea]">{t("points.page.title")}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#71767b]">{t("points.page.subtitle")}</p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <PointMetric label={t("points.metrics.balance")} value={account?.balance ?? 0} />
        <PointMetric label={t("points.metrics.frozen")} value={account?.frozen ?? 0} />
        <PointMetric label={t("points.metrics.earned")} value={account?.lifetime_earned ?? 0} />
        <PointMetric label={t("points.metrics.spent")} value={account?.lifetime_spent ?? 0} />
      </div>

      {referral ? (
        <SectionCard title={t("points.referral.title")} description={t("points.referral.description")}>
          <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
            <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
              <p className="text-xs text-[#71767b]">{t("points.referral.code")}</p>
              <p className="mt-2 font-mono text-2xl font-semibold text-white">{referral.code}</p>
              <p className="mt-2 break-all text-sm text-[#71767b]">{referral.invite_link}</p>
            </div>
            <div className="rounded-2xl border border-[#00ba7c]/20 bg-[#00ba7c]/10 p-4 text-sm text-white">
              <p>{t("points.referral.rewards", { signup: referral.signup_inviter_points, invitee: referral.signup_invitee_points, purchase: referral.first_purchase_points })}</p>
              <p className="mt-2 text-[#7ee0b5]">{t("points.referral.uses", { count: referral.use_count })}</p>
              <Button type="button" className="mt-4 w-full" onClick={copyInvite}>
                <Copy className="size-4" />
                {t("points.referral.copy")}
              </Button>
            </div>
          </div>
        </SectionCard>
      ) : null}

      <SectionCard title={t("points.redeem.title")} description={t("points.redeem.description")}>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <input className="form-input h-10 w-full font-mono uppercase" value={redeemCode} placeholder={t("points.redeem.placeholder")} onChange={(event) => setRedeemCode(event.target.value.toUpperCase())} />
          <Button type="button" disabled={redeeming || !redeemCode.trim()} onClick={redeem}>
            <Gift className="size-4" />
            {redeeming ? t("points.redeem.redeeming") : t("points.redeem.submit")}
          </Button>
        </div>
      </SectionCard>

      <SectionCard title={t("points.activities.title")} description={t("points.activities.description")}>
        <div className="grid gap-3 md:grid-cols-3">
          {(data?.activities || []).map((activity) => (
            <div key={activity.code} className="rounded-2xl border border-[#2f3336] bg-black p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-[#1d9bf0]">
                    <Gift className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-[#e7e9ea]">{activity.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-[#71767b]">{activity.description}</p>
                  </div>
                </div>
                <span className="shrink-0 rounded-full border border-[#00ba7c]/25 bg-[#00ba7c]/10 px-2.5 py-1 text-xs text-[#7ee0b5]">
                  +{activity.points}
                </span>
              </div>
              <Button
                type="button"
                className="mt-4 w-full"
                variant={activity.claimable ? "default" : "outline"}
                disabled={!activity.claimable || claiming === activity.code}
                onClick={() => void claim(activity.code)}
              >
                {activity.claimed ? <Lock className="size-4" /> : <Gift className="size-4" />}
                {activity.claimed ? t("points.activities.claimed") : claiming === activity.code ? t("points.activities.claiming") : t("points.activities.claim")}
              </Button>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title={t("points.ledger.title")} description={t("points.ledger.description")}>
        <div className="space-y-2">
          {(data?.ledger || []).length === 0 ? (
            <p className="rounded-2xl border border-[#2f3336] bg-black p-4 text-sm text-[#71767b]">{t("points.ledger.empty")}</p>
          ) : (
            data?.ledger.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#2f3336] bg-black p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <History className="size-4 shrink-0 text-[#71767b]" />
                  <div className="min-w-0">
                    <p className="font-medium text-[#e7e9ea]">{t(`points.event.${item.event_type}`)}</p>
                    <p className="mt-1 text-xs text-[#71767b]">{new Date(item.created_at).toLocaleString()}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={positiveEvents.has(item.event_type) ? "font-semibold text-[#7ee0b5]" : "font-semibold text-amber-100"}>
                    {positiveEvents.has(item.event_type) ? "+" : "-"}{item.points}
                  </p>
                  <p className="mt-1 text-xs text-[#71767b]">{t("points.ledger.after", { balance: item.balance_after, frozen: item.frozen_after })}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </SectionCard>
    </div>
  );
}

function PointMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
      <p className="text-xs text-[#71767b]">{label}</p>
      <p className="mt-2 text-2xl font-bold text-[#e7e9ea]">{value}</p>
    </div>
  );
}
