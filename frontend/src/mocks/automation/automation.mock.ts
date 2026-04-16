import type { AutomationModule, AutomationRuntimeStatus } from "@/types/automation";

export const automationModulesMock: AutomationModule[] = [
  {
    type: "post",
    nameKey: "automation.module.post.name",
    descriptionKey: "automation.module.post.description",
    state: "Running",
    config: {
      enabled: true,
      frequency: { intervalMinutes: 180, dailyLimit: 6 },
      tone: "Professional",
      safety: { requireApproval: true, maxPerHour: 2, blockedKeywords: ["airdrop", "giveaway"] },
    },
    lastRunKey: "automation.time.todayAt",
    lastRunParams: { time: "10:23" },
    nextRunKey: "automation.time.inMinutes",
    nextRunParams: { minutes: 42 },
  },
  {
    type: "reply",
    nameKey: "automation.module.reply.name",
    descriptionKey: "automation.module.reply.description",
    state: "Needs Review",
    config: {
      enabled: true,
      frequency: { intervalMinutes: 15, dailyLimit: 120 },
      tone: "Friendly",
      safety: { requireApproval: false, maxPerHour: 30, blockedKeywords: ["price", "pump"] },
    },
    lastRunKey: "automation.time.todayAt",
    lastRunParams: { time: "10:11" },
    nextRunKey: "automation.time.inMinutes",
    nextRunParams: { minutes: 6 },
  },
  {
    type: "dm",
    nameKey: "automation.module.dm.name",
    descriptionKey: "automation.module.dm.description",
    state: "Queued",
    config: {
      enabled: false,
      frequency: { intervalMinutes: 60, dailyLimit: 40 },
      tone: "Web3-native",
      safety: { requireApproval: true, maxPerHour: 10, blockedKeywords: ["seed phrase", "private key"] },
    },
    lastRunKey: "automation.time.yesterdayAt",
    lastRunParams: { time: "18:02" },
    nextRunKey: "automation.time.paused",
  },
];

export const automationRuntimeStatusMock: AutomationRuntimeStatus = {
  queueDepth: 18,
  lastSuccessKey: "automation.time.minutesAgo",
  lastSuccessParams: { minutes: 2 },
  retriesLast24h: 3,
  needsReview: 7,
};

