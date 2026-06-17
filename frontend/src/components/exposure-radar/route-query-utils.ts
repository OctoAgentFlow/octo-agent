import type { ExposureRadarRegion } from "@/services/exposure-radar.service";
import { isExposureRadarWorkspaceTab } from "@/components/exposure-radar/local-state";
import type { ExposureRadarWorkspaceTab } from "@/components/exposure-radar/types";

export type ExposureRadarQueryState = {
  region: ExposureRadarRegion;
  hours: number;
  maxFans: number;
  minHotCount: number;
  selectedAccountID: number;
  selectedBotID: number;
  workspaceTab: ExposureRadarWorkspaceTab;
};

export function exposureRadarQueryStateFromSearch(search: string, current: ExposureRadarQueryState): ExposureRadarQueryState {
  const params = new URLSearchParams(search);
  const nextRegion = params.get("region");
  const nextTab = params.get("tab");
  return {
    region: nextRegion === "zh" || nextRegion === "en" ? nextRegion : current.region,
    hours: getPositiveParam(params, "hours", current.hours),
    maxFans: getPositiveParam(params, "max_fans", getPositiveParam(params, "maxFans", current.maxFans)),
    minHotCount: getNonNegativeParam(params, "min_hot_count", getNonNegativeParam(params, "minHotCount", current.minHotCount)),
    selectedAccountID: getPositiveParam(params, "x_account_id", getPositiveParam(params, "account_id", current.selectedAccountID)),
    selectedBotID: getPositiveParam(params, "bot_id", current.selectedBotID),
    workspaceTab: isExposureRadarWorkspaceTab(nextTab) ? nextTab : current.workspaceTab,
  };
}

export function exposureRadarQueryStringFromState(
  search: string,
  state: Pick<ExposureRadarQueryState, "region" | "hours" | "maxFans" | "minHotCount" | "selectedAccountID" | "selectedBotID" | "workspaceTab">,
) {
  const params = new URLSearchParams(search);
  params.set("region", state.region);
  params.set("hours", String(state.hours));
  params.set("max_fans", String(state.maxFans));
  params.set("min_hot_count", String(state.minHotCount));
  params.set("tab", state.workspaceTab);
  if (state.selectedAccountID > 0) {
    params.set("x_account_id", String(state.selectedAccountID));
  } else {
    params.delete("x_account_id");
    params.delete("account_id");
  }
  if (state.selectedBotID > 0) {
    params.set("bot_id", String(state.selectedBotID));
  } else {
    params.delete("bot_id");
  }
  return params.toString();
}

function getPositiveParam(params: URLSearchParams, key: string, fallback: number) {
  const value = Number(params.get(key));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getNonNegativeParam(params: URLSearchParams, key: string, fallback: number) {
  const value = Number(params.get(key));
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}
