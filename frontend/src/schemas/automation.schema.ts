import { z } from "zod";

export const toneEnum = z.enum(["Professional", "Friendly", "Degen", "Web3-native"]);
export const executionModeEnum = z.enum(["manual", "review", "autopilot"]);

export const safetySchema = z.object({
  requireApproval: z.boolean(),
  maxPerHour: z.number().int().min(0).max(500),
  blockedKeywords: z.array(z.string().min(1)).max(50),
});

export const frequencySchema = z.object({
  intervalMinutes: z.number().int().min(1).max(1440),
  dailyLimit: z.number().int().min(0).max(5000),
});

export const baseAutomationConfigSchema = z.object({
  enabled: z.boolean(),
  frequency: frequencySchema,
  tone: toneEnum,
  executionMode: executionModeEnum,
  safety: safetySchema,
});

export const autoPostSchema = baseAutomationConfigSchema;
export const autoReplySchema = baseAutomationConfigSchema;
export const autoDmSchema = baseAutomationConfigSchema;
export const autoCommentSchema = baseAutomationConfigSchema;
