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
  postCreated: boolean;
  activityObserved: boolean;
  onConnectAccount?: () => void;
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
  postCreated,
  activityObserved,
  onConnectAccount,
}: UserOnboardingCardProps) {
  const { t } = useT();
  const steps: Step[] = [
    {
      done: accountConnected,
      titleKey: "onboarding.step.account.title",
      descriptionKey: "onboarding.step.account.description",
      ctaKey: "onboarding.step.account.cta",
      href: onConnectAccount ? undefined : "/accounts",
      onClick: onConnectAccount,
    },
    {
      done: automationEnabled,
      titleKey: "onboarding.step.automation.title",
      descriptionKey: "onboarding.step.automation.description",
      ctaKey: "onboarding.step.automation.cta",
      href: "/agents",
    },
    {
      done: postCreated,
      titleKey: "onboarding.step.post.title",
      descriptionKey: "onboarding.step.post.description",
      ctaKey: "onboarding.step.post.cta",
      href: "/posts/create",
    },
    {
      done: activityObserved,
      titleKey: "onboarding.step.activity.title",
      descriptionKey: "onboarding.step.activity.description",
      ctaKey: "onboarding.step.activity.cta",
      href: "/activity",
    },
  ];
  const completed = steps.filter((step) => step.done).length;
  const nextStep = steps.find((step) => !step.done);

  if (!nextStep) return null;

  return (
    <Card className="border-cyan-300/18 bg-cyan-400/[0.04]">
      <CardHeader
        title={t("onboarding.title")}
        description={t("onboarding.description", { completed, total: steps.length })}
      />
      <div className="grid gap-3 lg:grid-cols-4">
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
                    ? "border-cyan-200/30 bg-cyan-300/10"
                    : "border-white/8 bg-white/[0.03]"
              )}
            >
              <div className="flex items-start gap-2">
                <StepIcon className={cn("mt-0.5 size-4 shrink-0", step.done ? "text-emerald-200" : "text-white/45")} />
                <div className="min-w-0">
                  <p className="text-xs text-white/40">{t("onboarding.stepNumber", { number: index + 1 })}</p>
                  <p className="mt-1 text-sm font-semibold text-white">{t(step.titleKey)}</p>
                  <p className="mt-1 text-xs leading-5 text-white/55">{t(step.descriptionKey)}</p>
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
