"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";

const pad = (value: number) => String(value).padStart(2, "0");

const hours = Array.from({ length: 24 }, (_, index) => index);
const minutes = Array.from({ length: 60 }, (_, index) => index);
const seconds = Array.from({ length: 60 }, (_, index) => index);

export function formatLocalDateTime(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function isoToLocalDateTimeValue(iso?: string | null): string {
 if (!iso) return "";
 const date = new Date(iso);
 if (Number.isNaN(date.getTime())) return "";
 return formatLocalDateTime(date);
}

export const scheduledPostTimezones = [
  "UTC",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
] as const;

export function defaultScheduledPostTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

function timeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = zonedParts(date, timeZone);
  const asUTC = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUTC - date.getTime();
}

export function formatDateTimeInTimeZone(date: Date, timeZone: string) {
  const parts = zonedParts(date, timeZone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
}

export function isoToZonedDateTimeValue(iso?: string | null, timeZone = defaultScheduledPostTimezone()): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return formatDateTimeInTimeZone(date, timeZone);
}

export function zonedDateTimeValueToISO(value: string, timeZone: string): string | undefined {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return undefined;
  const [, year, month, day, hour, minute, second = "00"] = match;
  const wallClockUTC = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  const firstPass = wallClockUTC - timeZoneOffsetMs(new Date(wallClockUTC), timeZone);
  const secondPass = wallClockUTC - timeZoneOffsetMs(new Date(firstPass), timeZone);
  const date = new Date(secondPass);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function parseLocalDateTime(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second = "00"] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  );
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function createSeedDate(timeZone = defaultScheduledPostTimezone()) {
  const seed = new Date(Date.now() + 5 * 60 * 1000);
  seed.setSeconds(0, 0);
  return parseLocalDateTime(formatDateTimeInTimeZone(seed, timeZone)) ?? seed;
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

type ScheduledDateTimePickerProps = {
  value: string;
  onChange: (value: string) => void;
  timeZone?: string;
  onTimeZoneChange?: (value: string) => void;
  disabled?: boolean;
  className?: string;
};

export function ScheduledDateTimePicker({
  value,
  onChange,
  timeZone = defaultScheduledPostTimezone(),
  onTimeZoneChange,
  disabled,
  className,
}: ScheduledDateTimePickerProps) {
  const { t } = useT();
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedDate = useMemo(() => parseLocalDateTime(value), [value]);
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const seed = selectedDate ?? createSeedDate(timeZone);
    return new Date(seed.getFullYear(), seed.getMonth(), 1);
  });

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const displayValue = selectedDate ? `${value.replace("T", " ")} ${timeZone}` : "";
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDayOffset = new Date(year, month, 1).getDay();
  const currentTime = selectedDate ?? createSeedDate(timeZone);
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 8 }, (_, index) => currentYear - 1 + index);
  const monthOptions = Array.from({ length: 12 }, (_, index) => ({
    value: index,
    label: new Intl.DateTimeFormat(undefined, { month: "short" }).format(new Date(year, index, 1)),
  }));
  const timezoneOptions = useMemo(() => Array.from(new Set([timeZone, ...scheduledPostTimezones])), [timeZone]);

  const setDatePart = (day: number) => {
    const next = new Date(
      year,
      month,
      day,
      currentTime.getHours(),
      currentTime.getMinutes(),
      currentTime.getSeconds()
    );
    onChange(formatLocalDateTime(next));
  };

  const setTimePart = (part: "hour" | "minute" | "second", nextValue: number) => {
    const next = selectedDate ? new Date(selectedDate.getTime()) : createSeedDate();
    if (part === "hour") next.setHours(nextValue);
    if (part === "minute") next.setMinutes(nextValue);
    if (part === "second") next.setSeconds(nextValue);
    onChange(formatLocalDateTime(next));
  };

  return (
    <div ref={rootRef} className={cn("relative max-w-md", className)}>
      <button
        type="button"
        className={cn(
          "form-input flex min-h-11 items-center justify-between gap-3 text-left",
          !displayValue && "text-white/40",
          disabled && "cursor-not-allowed opacity-50"
        )}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          if (!open) {
            const seed = selectedDate ?? createSeedDate(timeZone);
            setVisibleMonth(new Date(seed.getFullYear(), seed.getMonth(), 1));
          }
          setOpen((next) => !next);
        }}
      >
        <span>{selectedDate ? formatLocalDateTime(selectedDate).replace("T", " ") : "YYYY-MM-DD HH:mm:ss"}</span>
        <CalendarClock className="size-4 shrink-0 text-[#1d9bf0]" />
      </button>

      {open ? (
        <div className="absolute left-0 top-full z-30 mt-2 w-[min(360px,calc(100vw-2rem))] rounded-2xl border border-[#2f3336] bg-black p-3 shadow-[0_18px_60px_rgba(0,0,0,0.55)]">
          <div className="mb-3 flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Previous month"
              onClick={() => setVisibleMonth(new Date(year, month - 1, 1))}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <div className="grid min-w-0 flex-1 grid-cols-[1fr_92px] gap-2">
              <select
                className="form-input rounded-xl px-2 py-2 text-sm"
                aria-label="Month"
                value={month}
                onChange={(event) => setVisibleMonth(new Date(year, Number(event.target.value), 1))}
              >
                {monthOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <select
                className="form-input rounded-xl px-2 py-2 text-sm"
                aria-label="Year"
                value={year}
                onChange={(event) => setVisibleMonth(new Date(Number(event.target.value), month, 1))}
              >
                {yearOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Next month"
              onClick={() => setVisibleMonth(new Date(year, month + 1, 1))}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-[#71767b]">
            {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
              <div key={`${day}-${index}`} className="h-7 leading-7">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstDayOffset }, (_, index) => (
              <div key={`blank-${index}`} className="size-9" />
            ))}
            {Array.from({ length: daysInMonth }, (_, index) => {
              const day = index + 1;
              const active =
                selectedDate?.getFullYear() === year &&
                selectedDate.getMonth() === month &&
                selectedDate.getDate() === day;
              return (
                <button
                  key={day}
                  type="button"
                  className={cn(
                    "flex size-9 items-center justify-center rounded-full text-sm font-medium text-[#e7e9ea] transition-colors hover:bg-[#16181c]",
                    active && "bg-[#1d9bf0] text-white hover:bg-[#1a8cd8]"
                  )}
                  onClick={() => setDatePart(day)}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <TimeSelect label="HH" value={currentTime.getHours()} values={hours} onChange={(next) => setTimePart("hour", next)} />
            <TimeSelect label="MM" value={currentTime.getMinutes()} values={minutes} onChange={(next) => setTimePart("minute", next)} />
            <TimeSelect label="SS" value={currentTime.getSeconds()} values={seconds} onChange={(next) => setTimePart("second", next)} />
          </div>
          <label className="mt-3 block text-[11px] font-medium text-[#71767b]">
            {t("posts.create.scheduledTimezone")}
            <select
              className="form-input mt-1 rounded-xl px-2 py-2 text-sm"
              value={timeZone}
              onChange={(event) => {
                const nextZone = event.target.value;
                if (onTimeZoneChange) {
                  onTimeZoneChange(nextZone);
                }
              }}
            >
              {timezoneOptions.map((zone) => (
                <option key={zone} value={zone}>
                  {scheduledPostTimezones.includes(zone as typeof scheduledPostTimezones[number]) ? t(`posts.timezone.${zone.replaceAll("/", "_")}`) : zone}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
    </div>
  );
}

function TimeSelect({
  label,
  value,
  values,
  onChange,
}: {
  label: string;
  value: number;
  values: number[];
  onChange: (value: number) => void;
}) {
  return (
    <label className="block text-[11px] font-medium text-[#71767b]">
      {label}
      <select className="form-input mt-1 rounded-xl px-2 py-2 text-sm" value={value} onChange={(event) => onChange(Number(event.target.value))}>
        {values.map((item) => (
          <option key={item} value={item}>
            {pad(item)}
          </option>
        ))}
      </select>
    </label>
  );
}
