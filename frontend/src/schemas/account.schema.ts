import { z } from "zod";
export const accountSchema = z.object({ platform: z.string().min(1), username: z.string().min(1) });
