import type { ContentDraftPlanApi } from "@/services/content-draft.service";
import type { ContentLibraryItemPayload } from "@/services/content-library.service";
import type { ExposureRadarItemApi } from "@/services/exposure-radar.service";
import { replyAngleGenerationGuides } from "@/components/exposure-radar/constants";
import { exposureMetricSummary } from "@/components/exposure-radar/radar-diagnostic-utils";
import { clampPriority, compactTitle, uniqueList } from "@/components/exposure-radar/radar-signal-utils";
import { buildMemoryOpportunityExplanation, buildReplyAngleIDs, formatMemoryOpportunityExplanation } from "@/components/exposure-radar/opportunity-reply-utils";
import { normalizeQualityStage, normalizeVelocityState } from "@/components/exposure-radar/radar-utils";
import type { ReplyAngleSuggestion } from "@/components/exposure-radar/types";

export function buildRadarMemoryPayload(item: ExposureRadarItemApi, twitterAccountID: number, botID: number, selectedReplyAngle?: ReplyAngleSuggestion): ContentLibraryItemPayload {
  const velocityState = normalizeVelocityState(item.velocity_state, item.status);
  const qualityStage = normalizeQualityStage(item.quality_stage, item);
  const opportunityExplanation = buildMemoryOpportunityExplanation(item);
  const replyAngleIDs = buildReplyAngleIDs(item);
  const selectedReplyGuide = selectedReplyAngle ? replyAngleGenerationGuides[selectedReplyAngle.id] : undefined;
  const title = compactTitle(item.topic_name || item.title || "Exposure Radar signal");
  const bodyLines = [
    `Signal: ${item.title}`,
    item.author_handle ? `Author: @${item.author_handle}${item.author_name ? ` (${item.author_name})` : ""}` : "",
    item.content ? `Context: ${item.content}` : "",
    exposureMetricSummary(item),
    item.reason ? `Why it matters: ${item.reason}` : "",
    item.recommended_use ? `Suggested operator action: ${item.recommended_use}` : "",
    item.ranking_reason ? `Ranking note: ${item.ranking_reason}` : "",
    item.quality_reason ? `Quality stage: ${qualityStage}; ${item.quality_reason}` : `Quality stage: ${qualityStage}.`,
    formatMemoryOpportunityExplanation(opportunityExplanation, selectedReplyGuide, replyAngleIDs),
    `Radar metadata: region=${item.region}; quality=${item.data_quality}; score=${item.score}; velocity=${velocityState}; risk=${item.risk_level || "unknown"}.`,
  ].filter(Boolean);
  return {
    twitter_account_id: twitterAccountID,
    bot_id: botID,
    title,
    item_type: "data_insight",
    body: bodyLines.join("\n"),
    source_url: item.url || undefined,
    topics: uniqueList(["exposure-radar", "operator-explanation", item.region, item.topic_name, velocityState, qualityStage, item.opportunity_type, item.data_quality, selectedReplyAngle ? `reply-angle-${selectedReplyAngle.id}` : "", ...replyAngleIDs.map((id) => `reply-angle-${id}`)]),
    growth_goal: "Use as OAF Bot memory for context-aware X replies, opportunity review, and safe manual growth decisions.",
    cta_preference: "Use only when relevant. Keep replies review-first, match the selected angle, and do not force product promotion.",
    priority: clampPriority(item.score),
    status: "active",
  };
}

export function buildRadarContentSeedPayload(item: ExposureRadarItemApi, twitterAccountID: number, botID: number): ContentLibraryItemPayload {
  const velocityState = normalizeVelocityState(item.velocity_state, item.status);
  const qualityStage = normalizeQualityStage(item.quality_stage, item);
  const replyAngleIDs = buildReplyAngleIDs(item);
  const title = compactTitle(`${item.topic_name || item.title || "Exposure signal"} content seed`);
  const bodyLines = [
    `Source signal: ${item.title}`,
    item.author_handle ? `Source author: @${item.author_handle}${item.author_name ? ` (${item.author_name})` : ""}` : "",
    item.content ? `Observed context: ${item.content}` : "",
    exposureMetricSummary(item),
    item.reason ? `Audience insight: ${item.reason}` : "",
    item.recommended_use ? `Possible content angle: ${item.recommended_use}` : "",
    item.quality_reason ? `Quality note: ${item.quality_reason}` : "",
    replyAngleIDs.length ? `Reply angles to learn from: ${replyAngleIDs.map((id) => replyAngleGenerationGuides[id].label).join(", ")}` : "",
    "Draft direction: Turn this into an original post, thread seed, or operator note. Do not copy the source post and do not force a product pitch.",
    `Radar metadata: region=${item.region}; quality=${item.data_quality}; score=${item.score}; velocity=${velocityState}; stage=${qualityStage}; risk=${item.risk_level || "unknown"}.`,
  ].filter(Boolean);
  return {
    twitter_account_id: twitterAccountID,
    bot_id: botID,
    title,
    item_type: "thread_seed",
    body: bodyLines.join("\n"),
    source_url: item.url || undefined,
    topics: uniqueList(["exposure-radar", "content-seed", item.region, item.topic_name, velocityState, qualityStage, item.opportunity_type, item.data_quality, ...replyAngleIDs.map((id) => `reply-angle-${id}`)]),
    growth_goal: "Convert a live opportunity signal into original account content while preserving persona, context, and safety boundaries.",
    cta_preference: "Use as research context only. Keep the final post useful, specific, and manually reviewed before publishing.",
    priority: clampPriority(item.score),
    status: "active",
  };
}

export function findContentDraftPlanForSeed(plans: ContentDraftPlanApi[], accountID: number, botID: number) {
  return plans.find((plan) => plan.x_account_id === accountID && plan.bot_id === botID && plan.enabled)
    || plans.find((plan) => plan.x_account_id === accountID && plan.bot_id === botID)
    || null;
}

export function buildSeedDraftDirection(item: ExposureRadarItemApi) {
  const qualityStage = normalizeQualityStage(item.quality_stage, item);
  const velocityState = normalizeVelocityState(item.velocity_state, item.status);
  return [
    "Create an original X post or short thread seed from this Exposure Radar signal.",
    "Do not copy the source post. Do not directly pitch the product.",
    `Signal title: ${item.title}`,
    item.content ? `Observed context: ${item.content}` : "",
    item.topic_name ? `Topic: ${item.topic_name}` : "",
    exposureMetricSummary(item),
    item.reason ? `Why this matters: ${item.reason}` : "",
    item.recommended_use ? `Suggested operator angle: ${item.recommended_use}` : "",
    `Quality stage: ${qualityStage}; velocity: ${velocityState}; risk: ${item.risk_level || "unknown"}.`,
    "Write with a concise founder/operator voice. Make it useful even if readers never saw the source post.",
  ].filter(Boolean).join("\n");
}
