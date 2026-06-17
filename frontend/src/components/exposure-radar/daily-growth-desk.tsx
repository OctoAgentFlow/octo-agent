"use client";

import type { ReactNode } from "react";

type DailyGrowthDeskProps = {
  overview: ReactNode;
  activation: ReactNode;
  progress: ReactNode;
  handoff: ReactNode;
  command: ReactNode;
  firstDay: ReactNode;
  preflight: ReactNode;
  sessionFocus: ReactNode;
  goals: ReactNode;
  sampleBanner?: ReactNode;
  firstLoop: ReactNode;
  completion?: ReactNode;
  scratchpad: ReactNode;
  recap: ReactNode;
  carryover: ReactNode;
  guidedFirstSession?: boolean;
};

export function DailyGrowthDesk({
  overview,
  activation,
  progress,
  handoff,
  command,
  firstDay,
  preflight,
  sessionFocus,
  goals,
  sampleBanner,
  firstLoop,
  completion,
  scratchpad,
  recap,
  carryover,
  guidedFirstSession = false,
}: DailyGrowthDeskProps) {
  if (guidedFirstSession) {
    return (
      <div className="space-y-5">
        {overview}
        <section id="first-day-path">{firstDay}</section>
        {sampleBanner}
        {preflight}
        {firstLoop}
        {completion}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {overview}
      {activation}
      {progress}
      {handoff}
      {command}
      <section id="first-day-path">{firstDay}</section>
      {preflight}
      {sessionFocus}
      {goals}
      {sampleBanner}
      {firstLoop}
      {completion}
      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        {scratchpad}
        {recap}
      </div>
      {carryover}
    </div>
  );
}
