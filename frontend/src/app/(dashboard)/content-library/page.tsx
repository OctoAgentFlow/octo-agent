"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Archive, BookOpen, Database, ExternalLink, Pause, Pencil, Play, Plus, RefreshCw, Trash2, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { useConfirm } from "@/components/providers/confirm-provider";
import { useToast } from "@/components/providers/toast-provider";
import { useT } from "@/i18n/use-t";
import { formatDateTime, usePreferredTimeZone } from "@/lib/timezone";
import {
  contentLibraryService,
  type ContentLibraryItemApi,
  type ContentLibraryItemPayload,
  type ContentLibraryItemType,
  type ContentLibraryStatus,
} from "@/services/content-library.service";

type StatusFilter = ContentLibraryStatus | "all";
type LibraryFormState = {
  title: string;
  itemType: ContentLibraryItemType;
  body: string;
  topics: string;
  sourceUrl: string;
  growthGoal: string;
  ctaPreference: string;
  status: ContentLibraryStatus;
};

const contentItemTypes: ContentLibraryItemType[] = [
  "idea",
  "feature_highlight",
  "pain_point",
  "product_update",
  "faq",
  "case_study",
  "comparison",
  "tutorial",
  "data_insight",
  "announcement",
  "campaign",
  "link",
  "thread_seed",
];

const statusFilters: StatusFilter[] = ["all", "active", "paused", "archived"];
const fieldControlClass = "h-10 w-full rounded-2xl border border-[#2f3336] bg-black px-3 text-sm text-[#e7e9ea] outline-none placeholder:text-[#71767b] focus:border-[#1d9bf0]";

const emptyForm: LibraryFormState = {
  title: "",
  itemType: "idea",
  body: "",
  topics: "",
  sourceUrl: "",
  growthGoal: "",
  ctaPreference: "",
  status: "active",
};

function parseCommaList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function itemToForm(item: ContentLibraryItemApi): LibraryFormState {
  return {
    title: item.title,
    itemType: item.item_type,
    body: item.body,
    topics: item.topics.join(", "),
    sourceUrl: item.source_url || "",
    growthGoal: item.growth_goal || "",
    ctaPreference: item.cta_preference || "",
    status: item.status,
  };
}

function formToPayload(form: LibraryFormState): ContentLibraryItemPayload {
  return {
    title: form.title.trim(),
    item_type: form.itemType,
    body: form.body.trim(),
    source_url: form.sourceUrl.trim() || undefined,
    topics: parseCommaList(form.topics),
    growth_goal: form.growthGoal.trim() || undefined,
    cta_preference: form.ctaPreference.trim() || undefined,
    priority: 0,
    status: form.status,
  };
}

function itemToPayload(item: ContentLibraryItemApi, status: ContentLibraryStatus): ContentLibraryItemPayload {
  return {
    twitter_account_id: item.twitter_account_id,
    bot_id: item.bot_id,
    title: item.title,
    item_type: item.item_type,
    body: item.body,
    source_url: item.source_url,
    topics: item.topics,
    growth_goal: item.growth_goal,
    cta_preference: item.cta_preference,
    priority: item.priority,
    status,
  };
}

export default function ContentLibraryPage() {
  const { t } = useT();
  const { pushToast } = useToast();
  const { confirm } = useConfirm();
  const timeZone = usePreferredTimeZone();
  const searchParams = useSearchParams();
  const focusedItemID = Number(searchParams.get("memory_id") || searchParams.get("content_item_id") || "0") || 0;
  const [items, setItems] = useState<ContentLibraryItemApi[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingID, setEditingID] = useState<number | null>(null);
  const [form, setForm] = useState<LibraryFormState>(emptyForm);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const data = await contentLibraryService.list({ limit: 200 });
      setItems(data.items || []);
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("contentDrafts.contentLibrary.errors.save") : t("contentDrafts.contentLibrary.errors.save"));
    } finally {
      setLoading(false);
    }
  }, [pushToast, t]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const metrics = useMemo(() => {
    const active = items.filter((item) => item.status === "active").length;
    const exposure = items.filter((item) => item.source_url?.includes("exposure-radar") || item.body.includes('"source":"exposure"')).length;
    const archived = items.filter((item) => item.status === "archived").length;
    return { active, total: items.length, exposure, archived };
  }, [items]);

  const visibleItems = useMemo(() => {
    const filtered = statusFilter === "all" ? items : items.filter((item) => item.status === statusFilter);
    if (!focusedItemID) return filtered;
    return [...filtered].sort((a, b) => (a.id === focusedItemID ? -1 : b.id === focusedItemID ? 1 : 0));
  }, [focusedItemID, items, statusFilter]);

  const resetForm = () => {
    setEditingID(null);
    setForm(emptyForm);
  };

  const editItem = (item: ContentLibraryItemApi) => {
    setEditingID(item.id);
    setForm(itemToForm(item));
    setFormOpen(true);
  };

  const submitForm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.title.trim() || !form.body.trim()) {
      pushToast(t("contentDrafts.contentLibrary.errors.required"));
      return;
    }
    setSaving(true);
    try {
      const payload = formToPayload(form);
      const saved = editingID ? await contentLibraryService.update(editingID, payload) : await contentLibraryService.create(payload);
      setItems((current) => {
        const without = current.filter((item) => item.id !== saved.id);
        return [saved, ...without];
      });
      pushToast(t(editingID ? "contentDrafts.contentLibrary.toast.updated" : "contentDrafts.contentLibrary.toast.created"));
      resetForm();
      setFormOpen(false);
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("contentDrafts.contentLibrary.errors.save") : t("contentDrafts.contentLibrary.errors.save"));
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (item: ContentLibraryItemApi, status: ContentLibraryStatus) => {
    setSaving(true);
    try {
      const saved = await contentLibraryService.update(item.id, itemToPayload(item, status));
      setItems((current) => current.map((entry) => (entry.id === saved.id ? saved : entry)));
      pushToast(t("contentDrafts.contentLibrary.toast.updated"));
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("contentDrafts.contentLibrary.errors.save") : t("contentDrafts.contentLibrary.errors.save"));
    } finally {
      setSaving(false);
    }
  };

  const deleteItem = async (item: ContentLibraryItemApi) => {
    const confirmed = await confirm({
      description: t("contentDrafts.contentLibrary.confirmDelete"),
      confirmLabel: t("contentDrafts.contentLibrary.delete"),
      tone: "destructive",
    });
    if (!confirmed) return;
    setSaving(true);
    try {
      await contentLibraryService.delete(item.id);
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      pushToast(t("contentDrafts.contentLibrary.toast.deleted"));
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("contentDrafts.contentLibrary.errors.delete") : t("contentDrafts.contentLibrary.errors.delete"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#1d9bf0]">Content Memory</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">{t("contentDrafts.contentLibrary.title")}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#71767b]">{t("contentDrafts.contentLibrary.description")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => void loadItems()}>
            <RefreshCw className="size-4" />
            {t("common.refresh")}
          </Button>
          <Button
            type="button"
            onClick={() => {
              if (!formOpen) resetForm();
              setFormOpen((current) => !current);
            }}
          >
            <Plus className="size-4" />
            {formOpen ? t("contentDrafts.contentLibrary.closeForm") : t("contentDrafts.contentLibrary.add")}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <LibraryMetric icon={<Database className="size-4" />} label={t("contentDrafts.contentLibrary.metrics.active")} value={metrics.active} />
        <LibraryMetric icon={<BookOpen className="size-4" />} label={t("contentDrafts.contentLibrary.metrics.total")} value={metrics.total} />
        <LibraryMetric icon={<Wand2 className="size-4" />} label={t("contentDrafts.contentLibrary.metrics.exposure")} value={metrics.exposure} />
        <LibraryMetric icon={<Archive className="size-4" />} label={t("contentDrafts.contentLibrary.status.archived")} value={metrics.archived} />
      </div>

      {formOpen ? (
        <Card className="bg-[#0f1419]">
          <CardHeader title={editingID ? t("contentDrafts.contentLibrary.saveEdit") : t("contentDrafts.contentLibrary.add")} description={t("contentDrafts.contentLibrary.description")} />
          <form className="grid gap-4" onSubmit={submitForm}>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label={t("contentDrafts.contentLibrary.fields.title")}>
                <input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder={t("contentDrafts.contentLibrary.fields.titlePlaceholder")} className={fieldControlClass} />
              </Field>
              <Field label={t("contentDrafts.contentLibrary.fields.itemType")}>
                <select value={form.itemType} onChange={(event) => setForm((current) => ({ ...current, itemType: event.target.value as ContentLibraryItemType }))} className={fieldControlClass}>
                  {contentItemTypes.map((type) => (
                    <option key={type} value={type}>
                      {t(`contentDrafts.contentLibrary.itemType.${type}`)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label={t("contentDrafts.contentLibrary.fields.body")}>
              <textarea value={form.body} onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))} placeholder={t("contentDrafts.contentLibrary.fields.bodyPlaceholder")} rows={6} className={`${fieldControlClass} min-h-36 py-3`} />
            </Field>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label={t("contentDrafts.contentLibrary.fields.topics")}>
                <input value={form.topics} onChange={(event) => setForm((current) => ({ ...current, topics: event.target.value }))} placeholder={t("contentDrafts.contentLibrary.fields.topicsPlaceholder")} className={fieldControlClass} />
              </Field>
              <Field label={t("contentDrafts.contentLibrary.fields.sourceUrl")}>
                <input value={form.sourceUrl} onChange={(event) => setForm((current) => ({ ...current, sourceUrl: event.target.value }))} placeholder={t("contentDrafts.contentLibrary.fields.sourceUrlPlaceholder")} className={fieldControlClass} />
              </Field>
              <Field label={t("contentDrafts.contentLibrary.fields.growthGoal")}>
                <input value={form.growthGoal} onChange={(event) => setForm((current) => ({ ...current, growthGoal: event.target.value }))} placeholder={t("contentDrafts.contentLibrary.fields.growthGoalPlaceholder")} className={fieldControlClass} />
              </Field>
              <Field label={t("contentDrafts.contentLibrary.fields.ctaPreference")}>
                <input value={form.ctaPreference} onChange={(event) => setForm((current) => ({ ...current, ctaPreference: event.target.value }))} placeholder={t("contentDrafts.contentLibrary.fields.ctaPreferencePlaceholder")} className={fieldControlClass} />
              </Field>
              <Field label={t("contentDrafts.contentLibrary.fields.status")}>
                <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as ContentLibraryStatus }))} className={fieldControlClass}>
                  <option value="active">{t("contentDrafts.contentLibrary.status.active")}</option>
                  <option value="paused">{t("contentDrafts.contentLibrary.status.paused")}</option>
                  <option value="archived">{t("contentDrafts.contentLibrary.status.archived")}</option>
                </select>
              </Field>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={saving}>
                {editingID ? t("contentDrafts.contentLibrary.saveEdit") : t("contentDrafts.contentLibrary.saveNew")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  resetForm();
                  setFormOpen(false);
                }}
              >
                {t("common.cancel")}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      <Card className="bg-[#0f1419]">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">{t("contentDrafts.contentLibrary.title")}</h2>
            <p className="mt-1 text-sm text-[#71767b]">{t("contentDrafts.contentLibrary.filters.result", { count: visibleItems.length, total: items.length })}</p>
          </div>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} className="h-10 rounded-2xl border border-[#2f3336] bg-black px-3 text-sm text-[#e7e9ea] outline-none focus:border-[#1d9bf0]">
            {statusFilters.map((status) => (
              <option key={status} value={status}>
                {status === "all" ? t("common.all") : t(`contentDrafts.contentLibrary.status.${status}`)}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <p className="mt-6 text-sm text-[#71767b]">{t("common.loading")}</p>
        ) : visibleItems.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-[#2f3336] bg-black/40 p-8 text-center">
            <p className="text-sm text-[#71767b]">{t("contentDrafts.contentLibrary.empty")}</p>
            <Button type="button" className="mt-4" onClick={() => setFormOpen(true)}>
              <Plus className="size-4" />
              {t("contentDrafts.contentLibrary.addFirst")}
            </Button>
          </div>
        ) : (
          <div className="mt-5 grid gap-3 xl:grid-cols-2">
            {visibleItems.map((item) => (
              <article key={item.id} className={`rounded-2xl border p-4 ${item.id === focusedItemID ? "border-[#1d9bf0]/50 bg-[#06111d]" : "border-[#2f3336] bg-black/55"}`}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-[#1d9bf0]/30 bg-[#1d9bf0]/10 px-2.5 py-1 text-xs font-semibold text-[#8ecdf8]">{t(`contentDrafts.contentLibrary.itemType.${item.item_type}`)}</span>
                      <span className="rounded-full border border-[#2f3336] bg-[#16181c] px-2.5 py-1 text-xs text-[#8b98a5]">{t(`contentDrafts.contentLibrary.status.${item.status}`)}</span>
                    </div>
                    <h3 className="mt-3 break-words text-base font-semibold text-[#e7e9ea]">{item.title}</h3>
                  </div>
                  <Link href={`/content-drafts?panel=content&content_item_id=${item.id}#content-library`} className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-full bg-[#1d9bf0] px-3 text-xs font-semibold text-white hover:bg-[#1a8cd8]">
                    <Wand2 className="size-3.5" />
                    {t("contentDrafts.contentLibrary.useForGenerate")}
                  </Link>
                </div>
                <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-[#cfd9e2]">{item.body}</p>
                {item.topics.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {item.topics.slice(0, 8).map((topic) => (
                      <span key={topic} className="rounded-full border border-[#2f3336] px-2 py-0.5 text-xs text-[#71767b]">
                        {topic}
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-3 text-xs text-[#71767b]">
                  <span>{t("contentDrafts.contentLibrary.usageCount", { count: item.usage_count })}</span>
                  {item.last_used_at ? <span>{t("contentDrafts.contentLibrary.lastUsed", { time: formatDateTime(item.last_used_at, timeZone) })}</span> : null}
                  {item.source_url ? (
                    <a href={item.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#8ecdf8] hover:text-[#c7e7ff]">
                      {t("contentDrafts.contentLibrary.fields.sourceUrl")}
                      <ExternalLink className="size-3" />
                    </a>
                  ) : null}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => editItem(item)}>
                    <Pencil className="size-4" />
                    {t("contentDrafts.contentLibrary.edit")}
                  </Button>
                  {item.status === "active" ? (
                    <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => void updateStatus(item, "paused")}>
                      <Pause className="size-4" />
                      {t("contentDrafts.contentLibrary.pause")}
                    </Button>
                  ) : (
                    <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => void updateStatus(item, "active")}>
                      <Play className="size-4" />
                      {t("contentDrafts.contentLibrary.activate")}
                    </Button>
                  )}
                  <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => void updateStatus(item, "archived")}>
                    <Archive className="size-4" />
                    {t("contentDrafts.contentLibrary.status.archived")}
                  </Button>
                  <Button type="button" size="sm" variant="outline" disabled={saving} className="border-[#f4212e]/25 bg-[#f4212e]/5 text-[#ff8a91] hover:bg-[#f4212e]/10" onClick={() => void deleteItem(item)}>
                    <Trash2 className="size-4" />
                    {t("contentDrafts.contentLibrary.delete")}
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-[#71767b]">{label}</span>
      {children}
    </label>
  );
}

function LibraryMetric({ icon, label, value }: { icon: ReactNode; label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-[#2f3336] bg-[#0f1419] p-4">
      <div className="flex items-center gap-2 text-[#8ecdf8]">{icon}</div>
      <p className="mt-3 text-xs text-[#71767b]">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-[#e7e9ea]">{value}</p>
    </div>
  );
}
