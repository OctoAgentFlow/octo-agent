import { z } from "zod";
export const agentSchema = z.object({ name: z.string().min(1), model: z.string().min(1) });
