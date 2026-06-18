"use client";

import { useMemo, useState, type ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";

import { useT } from "@/i18n/use-t";
import type { AccountListItem } from "@/services/account.service";
import type { OAFBot } from "@/types/oaf-bot";

export type SelectOption = {
  value: string;
  label: string;
};

export type ChipOption = SelectOption;

export function WizardPanel({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-2xl border border-[#2f3336] bg-black p-4 md:p-5">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-[#e7e9ea]">{title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-[#71767b]">{description}</p>
      </div>
      {children}
    </div>
  );
}

export function FieldShell({
  label,
  helper,
  recommended,
  children,
}: {
  label: string;
  helper?: string;
  recommended?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block min-w-0 space-y-1.5 text-sm text-[#e7e9ea]/78">
      <span className="flex items-center gap-2">
        {label}
        {recommended ? (
          <span className="inline-flex size-5 items-center justify-center rounded-full border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-[#1d9bf0]">
            <CheckCircle2 className="size-3" />
          </span>
        ) : null}
      </span>
      {children}
      {helper ? <span className="block text-xs leading-relaxed text-[#71767b]">{helper}</span> : null}
    </label>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  helper,
  recommended,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  helper?: string;
  recommended?: boolean;
}) {
  return (
    <FieldShell label={label} helper={helper} recommended={recommended}>
      <input className="form-input" value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </FieldShell>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  placeholder,
  helper,
  recommended,
  minHeightClass = "min-h-32",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  helper?: string;
  recommended?: boolean;
  minHeightClass?: string;
}) {
  return (
    <FieldShell label={label} helper={helper} recommended={recommended}>
      <textarea className={`form-input ${minHeightClass} max-w-full resize-y leading-relaxed`} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </FieldShell>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  helper,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  helper?: string;
}) {
  const hasCurrentValue = value && !options.some((option) => option.value === value);
  return (
    <FieldShell label={label} helper={helper}>
      <select className="form-input" value={value} onChange={(event) => onChange(event.target.value)}>
        {hasCurrentValue ? <option value={value}>{value}</option> : null}
        {options.map((option) => (
          <option key={option.value || "empty"} value={option.value}>{option.label}</option>
        ))}
      </select>
    </FieldShell>
  );
}

export function AccountSelect({
  label,
  helper,
  accounts,
  value,
  boundByOtherBot,
  onChange,
  noneLabel,
  connectedLabel,
  boundLabel,
}: {
  label: string;
  helper?: string;
  accounts: AccountListItem[];
  value: number;
  boundByOtherBot: Map<number, OAFBot>;
  onChange: (value: number) => void;
  noneLabel: string;
  connectedLabel: string;
  boundLabel: string;
}) {
  return (
    <FieldShell label={label} helper={helper} recommended>
      <select className="form-input" value={value || 0} onChange={(event) => onChange(Number(event.target.value))}>
        <option value={0}>{noneLabel}</option>
        {accounts.map((account) => {
          const boundBot = boundByOtherBot.get(account.id);
          return (
            <option key={account.id} value={account.id} disabled={Boolean(boundBot)}>
              @{account.username} · {boundBot ? `${boundLabel}: ${boundBot.name}` : connectedLabel}
            </option>
          );
        })}
      </select>
    </FieldShell>
  );
}

export function SingleChipField({
  label,
  value,
  onChange,
  options,
  placeholder,
  helper,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ChipOption[];
  placeholder?: string;
  helper?: string;
}) {
  const selectedLabel = getChipLabel(value, options);
  const hasRecommendedValue = Boolean(value && selectedLabel !== value);
  return (
    <div className="space-y-2">
      <FieldShell label={label} helper={helper}>
        <div className="rounded-2xl border border-[#2f3336] bg-black p-3">
          {hasRecommendedValue ? (
            <button
              type="button"
              onClick={() => onChange("")}
              className="mb-3 rounded-full border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 px-3 py-1 text-xs text-[#8ecdf8] hover:bg-[#1d9bf0]/18"
            >
              {selectedLabel} x
            </button>
          ) : null}
          <input
            className="w-full bg-transparent text-sm text-[#e7e9ea] outline-none placeholder:text-[#71767b]"
            value={hasRecommendedValue ? "" : value}
            placeholder={placeholder}
            onChange={(event) => onChange(event.target.value)}
          />
        </div>
      </FieldShell>
      <ChipOptions options={options} onPick={onChange} selected={value ? [value] : []} />
    </div>
  );
}

export function ChipTextArea({
  label,
  value,
  onChange,
  options,
  placeholder,
  helper,
  recommended,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ChipOption[];
  placeholder?: string;
  helper?: string;
  recommended?: boolean;
}) {
  return (
    <div className="space-y-2">
      <TextArea label={label} value={value} onChange={onChange} placeholder={placeholder} helper={helper} recommended={recommended} />
      <ChipOptions options={options} onPick={onChange} selected={value ? [value] : []} />
    </div>
  );
}

export function TagPicker({
  label,
  values,
  options,
  onChange,
  helper,
  placeholder,
  recommended,
  maxValues,
  initialOptionCount,
  limitText,
}: {
  label: string;
  values: string[];
  options: ChipOption[];
  onChange: (values: string[]) => void;
  helper?: string;
  placeholder?: string;
  recommended?: boolean;
  maxValues?: number;
  initialOptionCount?: number;
  limitText?: string;
}) {
  const { t } = useT();
  const [input, setInput] = useState("");
  const maxReached = Boolean(maxValues && values.length >= maxValues);
  const addValue = (value: string) => {
    const next = value.trim();
    if (!next || values.includes(next)) return;
    if (maxValues && values.length >= maxValues) return;
    onChange([...values, next]);
    setInput("");
  };
  const removeValue = (value: string) => {
    onChange(values.filter((item) => item !== value));
  };
  return (
    <div className="space-y-2">
      <FieldShell label={label} helper={helper} recommended={recommended}>
        <div className="rounded-2xl border border-[#2f3336] bg-black p-3">
          <div className="flex flex-wrap gap-2">
            {values.length === 0 ? <span className="min-w-0 text-sm leading-relaxed text-[#71767b] [overflow-wrap:anywhere]">{placeholder}</span> : null}
            {values.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => removeValue(value)}
                className="max-w-full rounded-full border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 px-3 py-1 text-left text-xs text-[#8ecdf8] hover:bg-[#1d9bf0]/18 [overflow-wrap:anywhere]"
              >
                {getChipLabel(value, options)} x
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              className="min-w-0 flex-1 bg-transparent text-sm text-[#e7e9ea] outline-none placeholder:text-[#71767b]"
              value={input}
              placeholder={placeholder}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addValue(input);
                }
              }}
            />
            <button
              type="button"
              disabled={maxReached}
              className="h-9 shrink-0 rounded-full border border-[#2f3336] px-3 text-xs text-[#e7e9ea]/75 hover:bg-[#16181c] disabled:cursor-not-allowed disabled:opacity-45"
              onClick={() => addValue(input)}
            >
              {t("oafBots.chips.addCustom")}
            </button>
          </div>
        </div>
      </FieldShell>
      <ChipOptions options={options} onPick={addValue} selected={values} disableUnselected={maxReached} maxInitial={initialOptionCount} />
      {limitText ? <p className={`text-xs leading-relaxed ${maxReached ? "text-amber-100/80" : "text-[#71767b]"}`}>{limitText}</p> : null}
    </div>
  );
}

export function ChipOptions({
  options,
  selected,
  onPick,
  maxInitial = 6,
  disableUnselected,
}: {
  options: ChipOption[];
  selected: string[];
  onPick: (value: string) => void;
  maxInitial?: number;
  disableUnselected?: boolean;
}) {
  const { t } = useT();
  const [expanded, setExpanded] = useState(false);
  const orderedOptions = useMemo(() => {
    return [...options].sort((a, b) => Number(selected.includes(b.value)) - Number(selected.includes(a.value)));
  }, [options, selected]);
  const visibleOptions = expanded ? orderedOptions : orderedOptions.slice(0, maxInitial);
  const hasMore = orderedOptions.length > maxInitial;
  return (
    <div className="flex min-w-0 flex-wrap gap-2">
      {visibleOptions.map((option) => {
        const active = selected.includes(option.value);
        const disabled = Boolean(disableUnselected && !active);
        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            onClick={() => onPick(option.value)}
            className={`max-w-full rounded-full border px-3 py-1.5 text-left text-xs leading-5 transition [overflow-wrap:anywhere] ${
              active
                ? "border-[#1d9bf0]/55 bg-[#1d9bf0]/14 text-[#e7e9ea]"
                : disabled
                  ? "cursor-not-allowed border-[#2f3336] bg-black text-[#71767b]/45"
                  : "border-[#2f3336] bg-black text-[#71767b] hover:bg-[#16181c] hover:text-[#e7e9ea]"
            }`}
          >
            {option.label}
          </button>
        );
      })}
      {hasMore ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="rounded-full border border-[#2f3336] bg-black px-3 py-1.5 text-xs text-[#71767b] hover:bg-[#16181c] hover:text-[#e7e9ea]"
        >
          {expanded ? t("oafBots.chips.less") : t("oafBots.chips.more")}
        </button>
      ) : null}
    </div>
  );
}

export function getChipLabel(value: string, options: ChipOption[]) {
  return options.find((option) => option.value === value)?.label ?? value;
}

export function getSelectLabel(value: string, options: SelectOption[]) {
  return options.find((option) => option.value === value)?.label ?? value;
}
