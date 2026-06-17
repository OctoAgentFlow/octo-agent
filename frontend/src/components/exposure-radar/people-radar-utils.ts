import type { ExposureRadarItemApi } from "@/services/exposure-radar.service";
import type { ManualActionState, PeopleRadarEntry, PeopleRadarStage } from "@/components/exposure-radar/types";
import { compactTitle, isManualActionHandled, isRadarItemSaved } from "@/components/exposure-radar/radar-signal-utils";
import type { TranslationFn } from "@/components/exposure-radar/radar-utils";

export function buildPeopleRadar(items: ExposureRadarItemApi[], manualActionStates: Record<string, ManualActionState>, savedMemoryIDs: Set<string>): PeopleRadarEntry[] {
  const people = new Map<string, PeopleRadarEntry>();
  for (const item of items) {
    if (item.data_quality !== "tweet_level") continue;
    const handle = (item.author_handle || "").replace(/^@/, "").trim();
    const name = item.author_name || handle || item.author_id || "";
    if (!handle && !name) continue;
    const key = (handle || item.author_id || name).toLowerCase();
    const existing = people.get(key);
    const state = manualActionStates[item.id];
    const handled = isManualActionHandled(item, state) ? 1 : 0;
    const drafted = item.generated_comment || item.review_task_id ? 1 : 0;
    const saved = isRadarItemSaved(item, savedMemoryIDs) ? 1 : 0;
    const engagement = publicEngagementCount(item);
    if (!existing) {
      people.set(key, {
        key,
        name,
        handle: handle || undefined,
        count: 1,
        handled,
        drafted,
        saved,
        maxScore: item.score || 0,
        totalEngagement: engagement,
        followers: item.followers_count,
        stage: "new",
        latestItem: item,
      });
      continue;
    }
    existing.count += 1;
    existing.handled += handled;
    existing.drafted += drafted;
    existing.saved += saved;
    existing.maxScore = Math.max(existing.maxScore, item.score || 0);
    existing.totalEngagement += engagement;
    if (typeof item.followers_count === "number" && item.followers_count > 0) {
      existing.followers = typeof existing.followers === "number" && existing.followers > 0 ? Math.max(existing.followers, item.followers_count) : item.followers_count;
    }
    if (radarItemTimeValue(item) > radarItemTimeValue(existing.latestItem)) {
      existing.latestItem = item;
    }
  }
  return Array.from(people.values())
    .map((person) => ({ ...person, stage: peopleRadarStage(person) }))
    .sort((a, b) => {
      const stageDelta = peopleRadarStageWeight(b.stage) - peopleRadarStageWeight(a.stage);
      if (stageDelta !== 0) return stageDelta;
      if (a.maxScore !== b.maxScore) return b.maxScore - a.maxScore;
      if (a.count !== b.count) return b.count - a.count;
      return b.totalEngagement - a.totalEngagement;
    });
}

export function publicEngagementCount(item: ExposureRadarItemApi) {
  return (item.reply_count || 0) + (item.retweet_count || 0) + (item.like_count || 0) + (item.quote_count || 0) + (item.bookmark_count || 0);
}

export function radarItemTimeValue(item: ExposureRadarItemApi) {
  const raw = item.published_at || item.updated_at || "";
  const value = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(value) ? value : 0;
}

export function peopleRadarStage(person: PeopleRadarEntry): PeopleRadarStage {
  const unhandled = Math.max(0, person.count - person.handled);
  if (unhandled > 0 && person.maxScore >= 75) return "priority";
  if (person.count >= 2) return "repeat";
  if (person.handled > 0 || person.drafted > 0 || person.saved > 0) return "engaged";
  return "new";
}

export function buildPeopleRadarPlaybook(people: PeopleRadarEntry[], t: TranslationFn) {
  const priority = people.filter((person) => person.stage === "priority").length;
  const repeat = people.filter((person) => person.stage === "repeat").length;
  const engaged = people.filter((person) => person.stage === "engaged").length;
  const avoid = people.filter((person) => person.stage === "avoid" || person.crmStage === "avoid").length;
  if (priority > 0) {
    return {
      title: t("exposureRadar.peopleRadar.playbook.priority.title"),
      detail: t("exposureRadar.peopleRadar.playbook.priority.detail", { count: priority }),
      tone: "positive" as const,
    };
  }
  if (repeat > 0) {
    return {
      title: t("exposureRadar.peopleRadar.playbook.repeat.title"),
      detail: t("exposureRadar.peopleRadar.playbook.repeat.detail", { count: repeat }),
      tone: "neutral" as const,
    };
  }
  if (engaged > 0) {
    return {
      title: t("exposureRadar.peopleRadar.playbook.engaged.title"),
      detail: t("exposureRadar.peopleRadar.playbook.engaged.detail", { count: engaged }),
      tone: "positive" as const,
    };
  }
  if (avoid > 0) {
    return {
      title: t("exposureRadar.peopleRadar.playbook.avoid.title"),
      detail: t("exposureRadar.peopleRadar.playbook.avoid.detail", { count: avoid }),
      tone: "warning" as const,
    };
  }
  return {
    title: t("exposureRadar.peopleRadar.playbook.default.title"),
    detail: t("exposureRadar.peopleRadar.playbook.default.detail"),
    tone: "neutral" as const,
  };
}

export function peopleRadarPlaybookTone(tone: "positive" | "warning" | "neutral") {
  if (tone === "positive") return "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]";
  if (tone === "warning") return "border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]";
  return "border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-[#8ecdf8]";
}

export function buildPeopleRadarNextTouch(person: PeopleRadarEntry, t: TranslationFn) {
  const stage = person.crmStage || person.stage;
  if (stage === "avoid") return t("exposureRadar.peopleRadar.nextTouch.avoid");
  if (stage === "priority") return t("exposureRadar.peopleRadar.nextTouch.priority", { title: compactTitle(person.latestItem.title) });
  if (stage === "repeat") return t("exposureRadar.peopleRadar.nextTouch.repeat", { count: person.count });
  if (stage === "engaged") return t("exposureRadar.peopleRadar.nextTouch.engaged");
  if (person.saved > 0) return t("exposureRadar.peopleRadar.nextTouch.saved");
  return t("exposureRadar.peopleRadar.nextTouch.default");
}

export function peopleRadarStageWeight(stage: PeopleRadarStage) {
  switch (stage) {
    case "priority":
      return 4;
    case "repeat":
      return 3;
    case "engaged":
      return 2;
    case "watch":
      return 2;
    case "avoid":
      return 0;
    default:
      return 1;
  }
}
