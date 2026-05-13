"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Bot, Lock, Sparkles } from "lucide-react";

import { SectionCard } from "@/components/dashboard/section-card";
import { useToast } from "@/components/providers/toast-provider";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { broadcastDataSynced } from "@/lib/app-page-refresh";
import { accountService, type AccountListItem } from "@/services/account.service";
import { oafBotService } from "@/services/oaf-bot.service";
import type { OAFBot, OAFBotPayload, OAFBotSamples } from "@/types/oaf-bot";
import type { PlanLimits, PlanUsage } from "@/types/billing";

const emptyLimits: PlanLimits = {
  maxBots: 1,
  maxTwitterAccounts: 1,
  aiGenerationsMonthly: 100,
  dailyAutoPosts: 1,
  dailyAutoReplies: 5,
  dailyAutoComments: 3,
  dailyAutoDMs: 5,
  analyticsDays: 7,
  teamSeats: 1,
  fullPersonaFields: false,
  autoDMImport: false,
  advancedBotStrategy: false,
  bulkReview: false,
  botPerformance: false,
  dataExport: false,
  multiBotMatrix: false,
  abTesting: false,
  advancedFlowBuilder: false,
  advancedRiskRules: false,
  prioritySupport: false,
};

const emptyUsage: PlanUsage = {
  oafBots: 0,
  twitterAccounts: 0,
  aiGenerationsMonth: 0,
  autoPostsToday: 0,
  autoRepliesToday: 0,
  autoCommentsToday: 0,
  autoDMsToday: 0,
};

const emptyForm: OAFBotPayload = {
  name: "",
  twitter_account_id: 0,
  occupation: "",
  industry: "",
  age_range: "",
  gender: "",
  education: "",
  mbti: "",
  personality_tags: [],
  identity_summary: "",
  voice_tone: "",
  topics: [],
  forbidden_topics: [],
  growth_goal: "",
  safety_mode: "balanced",
};

export default function OAFBotsPage() {
  const { pushToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [bots, setBots] = useState<OAFBot[]>([]);
  const [accounts, setAccounts] = useState<AccountListItem[]>([]);
  const [limits, setLimits] = useState<PlanLimits>(emptyLimits);
  const [usage, setUsage] = useState<PlanUsage>(emptyUsage);
  const [selectedID, setSelectedID] = useState<number | null>(null);
  const [form, setForm] = useState<OAFBotPayload>(emptyForm);
  const [samples, setSamples] = useState<OAFBotSamples | null>(null);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  const selectedBot = useMemo(() => bots.find((bot) => bot.id === selectedID) ?? null, [bots, selectedID]);
  const canCreate = usage.oafBots < limits.maxBots;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [botData, accountData] = await Promise.all([oafBotService.list(), accountService.list()]);
      setBots(botData.items);
      setLimits(botData.limits);
      setUsage({ ...botData.usage, oafBots: botData.items.length });
      setAccounts(accountData.items);
      if (!selectedID && botData.items[0]) {
        setSelectedID(botData.items[0].id);
        setForm(botToPayload(botData.items[0]));
      }
      broadcastDataSynced(Date.now());
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || "加载 OAF Bot 失败" : "加载 OAF Bot 失败");
    } finally {
      setLoading(false);
    }
  }, [pushToast, selectedID]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectBot = (bot: OAFBot) => {
    setSelectedID(bot.id);
    setForm(botToPayload(bot));
    setSamples(null);
  };

  const startCreate = () => {
    setSelectedID(null);
    setForm(emptyForm);
    setSamples(null);
  };

  const save = async () => {
    setSaving(true);
    try {
      const saved = selectedID ? await oafBotService.update(selectedID, form) : await oafBotService.create(form);
      setBots((items) => [saved, ...items.filter((item) => item.id !== saved.id)]);
      setSelectedID(saved.id);
      setForm(botToPayload(saved));
      setUsage((prev) => ({ ...prev, oafBots: selectedID ? prev.oafBots : prev.oafBots + 1 }));
      pushToast("OAF Bot 已保存");
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || "保存 OAF Bot 失败" : "保存 OAF Bot 失败");
    } finally {
      setSaving(false);
    }
  };

  const testGenerate = async () => {
    if (!selectedID) {
      pushToast("请先保存 OAF Bot，再生成示例内容");
      return;
    }
    setGenerating(true);
    try {
      setSamples(await oafBotService.testGenerate(selectedID));
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || "生成示例失败" : "生成示例失败");
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return <Card><CardHeader title="正在加载 OAF Bot..." description="读取机器人画像和套餐限制。" /></Card>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-sm text-violet-100/80"><Bot className="size-4" /> OAF Bot</p>
          <h1 className="mt-2 text-2xl font-semibold text-white">AI 社交人格机器人</h1>
          <p className="mt-2 max-w-2xl text-sm text-white/60">
            为绑定的 X 账号配置可复用的人设。当前阶段支持画像管理和示例生成，后续会接入自动发推、回复、评论和私信执行链路。
          </p>
        </div>
        <Button
          type="button"
          disabled={!canCreate}
          onClick={startCreate}
          className="bg-gradient-to-r from-blue-500 to-violet-500 text-white"
        >
          新建 OAF Bot
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <QuotaCard label="OAF Bots" used={usage.oafBots} limit={limits.maxBots} />
        <QuotaCard label="X Accounts" used={usage.twitterAccounts} limit={limits.maxTwitterAccounts} />
        <QuotaCard label="AI 生成/月" used={usage.aiGenerationsMonth} limit={limits.aiGenerationsMonthly} />
        <QuotaCard label="自动评论/日" used={usage.autoCommentsToday} limit={limits.dailyAutoComments} />
      </div>

      {!canCreate ? (
        <div className="flex items-center gap-2 rounded-xl border border-amber-300/20 bg-amber-400/10 p-4 text-sm text-amber-100">
          <Lock className="size-4" />
          当前套餐 OAF Bot 数量已达上限。升级 Plus / Pro 可创建更多机器人。
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <SectionCard title="机器人列表" description="选择一个机器人进行编辑，或新建机器人画像。">
          <div className="space-y-2">
            {bots.length === 0 ? (
              <p className="rounded-lg border border-white/10 bg-white/[0.04] p-4 text-sm text-white/55">暂无 OAF Bot。</p>
            ) : (
              bots.map((bot) => (
                <button
                  key={bot.id}
                  type="button"
                  onClick={() => selectBot(bot)}
                  className={`w-full rounded-xl border p-4 text-left transition ${
                    selectedID === bot.id ? "border-violet-300/45 bg-violet-500/12" : "border-white/10 bg-white/[0.04] hover:bg-white/[0.07]"
                  }`}
                >
                  <p className="font-medium text-white">{bot.name}</p>
                  <p className="mt-1 text-xs text-white/55">{bot.voice_tone || "尚未设置语言风格"}</p>
                  <p className="mt-2 line-clamp-2 text-sm text-white/65">{bot.identity_summary || "尚未填写身份摘要"}</p>
                </button>
              ))
            )}
          </div>
        </SectionCard>

        <SectionCard title={selectedBot ? "编辑 OAF Bot" : "新建 OAF Bot"} description="配置机器人画像、话题边界和增长目标。">
          <div className="grid gap-4 md:grid-cols-2">
            <TextField label="名称" value={form.name} onChange={(value) => setForm((prev) => ({ ...prev, name: value }))} />
            <label className="space-y-1.5 text-sm text-white/70">
              <span>X 账号</span>
              <select
                className="form-input"
                value={form.twitter_account_id || 0}
                onChange={(event) => setForm((prev) => ({ ...prev, twitter_account_id: Number(event.target.value) }))}
              >
                <option value={0}>暂不绑定</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>@{account.username}</option>
                ))}
              </select>
            </label>
            <TextField label="职业" value={form.occupation} onChange={(value) => setForm((prev) => ({ ...prev, occupation: value }))} />
            <TextField label="行业" value={form.industry} onChange={(value) => setForm((prev) => ({ ...prev, industry: value }))} />
            <TextField label="年龄段" value={form.age_range} onChange={(value) => setForm((prev) => ({ ...prev, age_range: value }))} />
            <TextField label="性别表达" value={form.gender} onChange={(value) => setForm((prev) => ({ ...prev, gender: value }))} />
            <TextField label="学历" value={form.education} onChange={(value) => setForm((prev) => ({ ...prev, education: value }))} />
            <TextField label="MBTI" value={form.mbti} onChange={(value) => setForm((prev) => ({ ...prev, mbti: value }))} />
            <TextField label="性格标签（逗号分隔）" value={form.personality_tags.join(", ")} onChange={(value) => setForm((prev) => ({ ...prev, personality_tags: splitList(value) }))} />
            <TextField label="话题领域（逗号分隔）" value={form.topics.join(", ")} onChange={(value) => setForm((prev) => ({ ...prev, topics: splitList(value) }))} />
            <TextField label="禁聊话题（逗号分隔）" value={form.forbidden_topics.join(", ")} onChange={(value) => setForm((prev) => ({ ...prev, forbidden_topics: splitList(value) }))} />
            <TextField label="安全模式" value={form.safety_mode} onChange={(value) => setForm((prev) => ({ ...prev, safety_mode: value }))} />
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <TextArea label="身份摘要" value={form.identity_summary} onChange={(value) => setForm((prev) => ({ ...prev, identity_summary: value }))} />
            <TextArea label="增长目标" value={form.growth_goal} onChange={(value) => setForm((prev) => ({ ...prev, growth_goal: value }))} />
          </div>
          <TextArea label="语言风格" value={form.voice_tone} onChange={(value) => setForm((prev) => ({ ...prev, voice_tone: value }))} className="mt-4" />

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={testGenerate} disabled={!selectedID || generating}>
              <Sparkles className="size-4" />
              {generating ? "生成中..." : "生成示例"}
            </Button>
            <Button type="button" onClick={save} disabled={saving || (!selectedID && !canCreate)} className="bg-gradient-to-r from-blue-500 to-violet-500 text-white">
              {saving ? "保存中..." : "保存 OAF Bot"}
            </Button>
          </div>

          {samples ? (
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <SampleCard title="示例推文" text={samples.tweet} />
              <SampleCard title="示例回复" text={samples.reply} />
              <SampleCard title="示例私信" text={samples.dm} />
            </div>
          ) : null}
        </SectionCard>
      </div>
    </div>
  );
}

function botToPayload(bot: OAFBot): OAFBotPayload {
  return {
    name: bot.name,
    twitter_account_id: bot.twitter_account_id,
    occupation: bot.occupation,
    industry: bot.industry,
    age_range: bot.age_range,
    gender: bot.gender,
    education: bot.education,
    mbti: bot.mbti,
    personality_tags: bot.personality_tags || [],
    identity_summary: bot.identity_summary,
    voice_tone: bot.voice_tone,
    topics: bot.topics || [],
    forbidden_topics: bot.forbidden_topics || [],
    growth_goal: bot.growth_goal,
    safety_mode: bot.safety_mode || "balanced",
  };
}

function splitList(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function QuotaCard({ label, used, limit }: { label: string; used: number; limit: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
      <p className="text-xs text-white/55">{label}</p>
      <p className="mt-2 text-lg font-semibold text-white">{used}<span className="text-sm font-normal text-white/45"> / {limit}</span></p>
    </div>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="space-y-1.5 text-sm text-white/70">
      <span>{label}</span>
      <input className="form-input" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function TextArea({ label, value, onChange, className = "" }: { label: string; value: string; onChange: (value: string) => void; className?: string }) {
  return (
    <label className={`block space-y-1.5 text-sm text-white/70 ${className}`}>
      <span>{label}</span>
      <textarea className="form-input min-h-28 resize-y" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SampleCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <p className="text-xs text-white/45">{title}</p>
      <p className="mt-2 text-sm text-white/75">{text}</p>
    </div>
  );
}
