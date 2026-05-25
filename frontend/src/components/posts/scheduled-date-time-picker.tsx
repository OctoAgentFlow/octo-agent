"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
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

function createSeedDate() {
  const date = new Date(Date.now() + 5 * 60 * 1000);
  date.setSeconds(0, 0);
  return date;
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

type ScheduledDateTimePickerProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
};

export function ScheduledDateTimePicker({
  value,
  onChange,
  disabled,
  className,
}: ScheduledDateTimePickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedDate = useMemo(() => parseLocalDateTime(value), [value]);
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const seed = selectedDate ?? createSeedDate();
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

  const displayValue = selectedDate ? selectedDate.toLocaleString() : "";
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDayOffset = new Date(year, month, 1).getDay();
  const currentTime = selectedDate ?? createSeedDate();
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 8 }, (_, index) => currentYear - 1 + index);
  const monthOptions = Array.from({ length: 12 }, (_, index) => ({
    value: index,
    label: new Intl.DateTimeFormat(undefined, { month: "short" }).format(new Date(year, index, 1)),
  }));

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
            const seed = selectedDate ?? createSeedDate();
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
