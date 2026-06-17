"use client";

import type { ReactNode } from "react";
import { Bot, RefreshCw, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { useT } from "@/i18n/use-t";
import type { AccountListItem } from "@/services/account.service";
import type { ExposureRadarRegion } from "@/services/exposure-radar.service";
import type { OAFBot } from "@/types/oaf-bot";
import { formatCompact } from "@/components/exposure-radar/radar-utils";
import type { LoadState } from "@/components/exposure-radar/types";

type RadarFiltersProps = {
  region: ExposureRadarRegion;
  hours: number;
  maxFans: number;
  minHotCount: number;
  loadState: LoadState;
  hourOptions: number[];
  fanOptions: number[];
  hotCountOptions: number[];
  accounts: AccountListItem[];
  bots: OAFBot[];
  selectedAccountID: number;
  selectedBotID: number;
  sourceHealth?: ReactNode;
  diagnostics?: ReactNode;
  onRefresh: () => void;
  onRegionChange: (region: ExposureRadarRegion) => void;
  onHoursChange: (hours: number) => void;
  onMaxFansChange: (maxFans: number) => void;
  onMinHotCountChange: (minHotCount: number) => void;
  onAccountChange: (accountID: number) => void;
  onBotChange: (botID: number) => void;
};

export function RadarFilters({
  region,
  hours,
  maxFans,
  minHotCount,
  loadState,
  hourOptions,
  fanOptions,
  hotCountOptions,
  accounts,
  bots,
  selectedAccountID,
  selectedBotID,
  sourceHealth,
  diagnostics,
  onRefresh,
  onRegionChange,
  onHoursChange,
  onMaxFansChange,
  onMinHotCountChange,
  onAccountChange,
  onBotChange,
}: RadarFiltersProps) {
  const { t } = useT();
  return (
    <div id="radar-setup" className="scroll-mt-24">
      <Card className="bg-[#0f1419]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <CardHeader title={t("exposureRadar.filters.title")} description={t("exposureRadar.filters.description")} className="mb-0" />
          <Button type="button" variant="outline" onClick={onRefresh} disabled={loadState === "loading"}>
            <RefreshCw className={`size-4 ${loadState === "loading" ? "animate-spin" : ""}`} />
            {t("common.refresh")}
          </Button>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-4">
          <SegmentedControl
            label={t("exposureRadar.filters.region")}
            options={[
              { value: "zh", label: t("exposureRadar.region.zh") },
              { value: "en", label: t("exposureRadar.region.en") },
            ]}
            value={region}
            onChange={(value) => onRegionChange(value as ExposureRadarRegion)}
          />
          <NumberButtons label={t("exposureRadar.filters.hours")} values={hourOptions} value={hours} suffix="h" onChange={onHoursChange} />
          <NumberButtons label={t("exposureRadar.filters.maxFans")} values={fanOptions} value={maxFans} formatter={formatCompact} onChange={onMaxFansChange} />
          <NumberButtons label={t("exposureRadar.filters.hotCount")} values={hotCountOptions} value={minHotCount} formatter={(value) => (value === 0 ? t("common.all") : `>=${value}`)} onChange={onMinHotCountChange} disabled={region === "en"} />
        </div>
        {sourceHealth}
        {diagnostics}
        <div className="mt-4 border-t border-[#2f3336] pt-4">
          <CardHeader title={t("exposureRadar.draft.title")} description={t("exposureRadar.draft.description")} className="mb-3" />
          <div className="grid gap-3 md:grid-cols-2 md:items-end">
            <SelectField
              icon={<Users className="size-4" />}
              label={t("exposureRadar.draft.account")}
              value={selectedAccountID}
              onChange={onAccountChange}
              emptyLabel={t("exposureRadar.draft.noAccounts")}
              options={accounts.map((account) => ({ value: account.id, label: `@${account.username}` }))}
            />
            <SelectField
              icon={<Bot className="size-4" />}
              label={t("exposureRadar.draft.bot")}
              value={selectedBotID}
              onChange={onBotChange}
              emptyLabel={t("exposureRadar.draft.noBots")}
              options={bots.map((bot) => ({ value: bot.id, label: bot.name || t("oafBots.botNumber", { id: bot.id }) }))}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}

function SegmentedControl({ label, options, value, onChange }: { label: string; options: Array<{ value: string; label: string }>; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <p className="text-xs font-semibold text-[#8b98a5]">{label}</p>
      <div className="mt-2 grid grid-cols-2 gap-2 rounded-2xl border border-[#2f3336] bg-black p-1">
        {options.map((option) => (
          <button key={option.value} type="button" onClick={() => onChange(option.value)} className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${value === option.value ? "bg-[#1d9bf0] text-white" : "text-[#8b98a5] hover:bg-[#16181c] hover:text-[#e7e9ea]"}`}>
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function NumberButtons({ label, values, value, suffix, formatter, onChange, disabled }: { label: string; values: number[]; value: number; suffix?: string; formatter?: (value: number) => string; onChange: (value: number) => void; disabled?: boolean }) {
  return (
    <div className={disabled ? "opacity-45" : ""}>
      <p className="text-xs font-semibold text-[#8b98a5]">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {values.map((option) => (
          <button key={option} type="button" disabled={disabled} onClick={() => onChange(option)} className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${value === option ? "border-[#1d9bf0] bg-[#1d9bf0]/15 text-[#8ecdf8]" : "border-[#2f3336] bg-black text-[#8b98a5] hover:border-[#1d9bf0]/45"}`}>
            {formatter ? formatter(option) : `${option}${suffix || ""}`}
          </button>
        ))}
      </div>
    </div>
  );
}

function SelectField({ icon, label, value, options, emptyLabel, onChange }: { icon: ReactNode; label: string; value: number; options: Array<{ value: number; label: string }>; emptyLabel: string; onChange: (value: number) => void }) {
  return (
    <label>
      <span className="flex items-center gap-2 text-xs font-semibold text-[#8b98a5]">{icon}{label}</span>
      <select value={value || 0} onChange={(event) => onChange(Number(event.target.value))} className="mt-2 h-11 w-full rounded-xl border border-[#2f3336] bg-black px-3 text-sm font-semibold text-[#e7e9ea] outline-none transition focus:border-[#1d9bf0]">
        <option value={0}>{emptyLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}
