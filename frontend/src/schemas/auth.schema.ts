import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Please enter a valid email."),
  password: z.string().min(6, "Password must be at least 6 characters."),
});

export const registerSchema = z
  .object({
    name: z.string().min(1, "Name is required."),
    email: z.string().email("Please enter a valid email."),
    verificationCode: z.string().length(6, "Verification code must be 6 digits."),
    password: z.string().min(6, "Password must be at least 6 characters."),
    confirmPassword: z.string().min(6, "Confirm password must be at least 6 characters."),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });
