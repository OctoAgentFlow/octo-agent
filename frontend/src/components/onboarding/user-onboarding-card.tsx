"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";

type UserOnboardingCardProps = {
  accountConnected: boolean;
  automationEnabled: boolean;
  postCreated?: boolean;
  activityObserved?: boolean;
  oafBotCreated?: boolean;
  contentDraftConfigured?: boolean;
  executionQueueChecked?: boolean;
  onConnectAccount?: () => void;
  onConfigureAutomation?: () => void;
};

type Step = {
  done: boolean;
  titleKey: string;
  descriptionKey: string;
  ctaKey: string;
  href?: string;
  onClick?: () => void;
};

export function UserOnboardingCard({
  accountConnected,
  automationEnabled,
  postCreated = false,
  activityObserved = false,
  oafBotCreated,
  contentDraftConfigured,
  executionQueueChecked,
  onConnectAccount,
}: UserOnboardingCardProps) {
  const { t } = useT();
  const hasOAFBot = oafBotCreated ?? postCreated;
  const hasContentDraftConfigured = contentDraftConfigured ?? postCreated;
  const hasCheckedQueue = executionQueueChecked ?? activityObserved;
  const hasDailyDeskReady = automationEnabled || (accountConnected && hasOAFBot);
  const steps: Step[] = [
    {
      done: accountConnected,
      titleKey: "onboarding.step.account.title",
      descriptionKey: "onboarding.step.account.description",
      ctaKey: "onboarding.step.account.cta",
      href: "/accounts",
      onClick: accountConnected ? undefined : onConnectAccount,
    },
    {
      done: hasOAFBot,
      titleKey: "onboarding.step.oafBot.title",
      descriptionKey: "onboarding.step.oafBot.description",
      ctaKey: "onboarding.step.oafBot.cta",
      href: "/agents",
    },
    {
      done: hasDailyDeskReady,
      titleKey: "onboarding.step.dailyXQueue.title",
      descriptionKey: "onboarding.step.dailyXQueue.description",
      ctaKey: "onboarding.step.dailyXQueue.cta",
      href: "/start-today",
    },
    {
      done: hasContentDraftConfigured,
      titleKey: "onboarding.step.autoPost.title",
      descriptionKey: "onboarding.step.autoPost.description",
      ctaKey: "onboarding.step.autoPost.cta",
      href: "/content-library",
    },
    {
      done: hasCheckedQueue,
      titleKey: "onboarding.step.executionQueue.title",
      descriptionKey: "onboarding.step.executionQueue.description",
      ctaKey: "onboarding.step.executionQueue.cta",
      href: "/exposure-radar?tab=strategy#radar-results",
    },
  ];
  const completed = steps.filter((step) => step.done).length;
  const nextStep = steps.find((step) => !step.done);

  if (!nextStep) return null;

  return (
    <Card className="border-[#2f3336] bg-black">
      <CardHeader
        title={t("onboarding.title")}
        description={t("onboarding.description", { completed, total: steps.length })}
      />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {steps.map((step, index) => {
          const StepIcon = step.done ? CheckCircle2 : Circle;
          const active = step === nextStep;
          return (
            <article
              key={step.titleKey}
              className={cn(
                "rounded-lg border px-3 py-3",
                step.done
                  ? "border-emerald-300/25 bg-emerald-400/10"
                  : active
                    ? "border-[#1d9bf0]/35 bg-[#1d9bf0]/10"
                    : "border-[#2f3336] bg-[#0f1419]"
              )}
            >
              <div className="flex items-start gap-2">
                <StepIcon className={cn("mt-0.5 size-4 shrink-0", step.done ? "text-emerald-200" : active ? "text-[#1d9bf0]" : "text-[#71767b]")} />
                <div className="min-w-0">
                  <p className="text-xs text-[#71767b]">{t("onboarding.stepNumber", { number: index + 1 })}</p>
                  <p className="mt-1 text-sm font-semibold text-[#e7e9ea]">{t(step.titleKey)}</p>
                  <p className="mt-1 text-xs leading-5 text-[#71767b]">{t(step.descriptionKey)}</p>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <div className="mt-4 flex justify-end">
        {nextStep.onClick ? (
          <Button type="button" onClick={nextStep.onClick}>
            {t(nextStep.ctaKey)}
            <ArrowRight className="size-4" />
          </Button>
        ) : (
          <Link href={nextStep.href || "/dashboard"} className={cn(buttonVariants())}>
            {t(nextStep.ctaKey)}
            <ArrowRight className="size-4" />
          </Link>
        )}
      </div>
    </Card>
  );
}
