"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/i18n/use-t";
import { loginSchema, registerSchema } from "@/schemas/auth.schema";

type AuthMode = "login" | "register";

type LoginFormProps = {
  mode: AuthMode;
  onSuccess?: (mode: AuthMode) => void;
};

type LoginValues = z.infer<typeof loginSchema>;
type RegisterValues = z.infer<typeof registerSchema>;

export function LoginForm({ mode, onSuccess }: LoginFormProps) {
  const { t } = useT();
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);

  const loginForm = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const registerForm = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: "", password: "", confirmPassword: "" },
  });

  const currentForm = mode === "login" ? loginForm : registerForm;
  const emailRegister = mode === "login" ? loginForm.register("email") : registerForm.register("email");
  const passwordRegister =
    mode === "login" ? loginForm.register("password") : registerForm.register("password");
  const emailError =
    mode === "login"
      ? loginForm.formState.errors.email?.message
      : registerForm.formState.errors.email?.message;
  const passwordError =
    mode === "login"
      ? loginForm.formState.errors.password?.message
      : registerForm.formState.errors.password?.message;

  const onSubmit = currentForm.handleSubmit(async () => {
    setSubmitMessage(null);
    await new Promise((resolve) => setTimeout(resolve, 700));
    setSubmitMessage(mode === "login" ? t("auth.form.mock.loginSuccess") : t("auth.form.mock.registerSuccess"));
    onSuccess?.(mode);
  });

  return (
    <form className="space-y-3" onSubmit={onSubmit}>
      <div className="space-y-1.5">
        <label htmlFor={`email-${mode}`} className="text-xs text-white/70">
          {t("auth.form.email.label")}
        </label>
        <Input
          id={`email-${mode}`}
          type="email"
          placeholder={t("auth.form.email.placeholder")}
          error={emailError}
          {...emailRegister}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor={`password-${mode}`} className="text-xs text-white/70">
          {t("auth.form.password.label")}
        </label>
        <Input
          id={`password-${mode}`}
          type="password"
          placeholder={t("auth.form.password.placeholder")}
          error={passwordError}
          {...passwordRegister}
        />
      </div>

      {mode === "register" ? (
        <div className="space-y-1.5">
          <label htmlFor="confirmPassword" className="text-xs text-white/70">
            {t("auth.form.confirmPassword.label")}
          </label>
          <Input
            id="confirmPassword"
            type="password"
            placeholder={t("auth.form.confirmPassword.placeholder")}
            error={registerForm.formState.errors.confirmPassword?.message}
            {...registerForm.register("confirmPassword")}
          />
        </div>
      ) : null}

      <Button
        type="submit"
        className="mt-2 h-10 w-full bg-gradient-to-r from-blue-500 to-violet-500 text-white hover:opacity-90"
        disabled={currentForm.formState.isSubmitting}
      >
        {currentForm.formState.isSubmitting
          ? t("auth.form.submit.loading")
          : mode === "login"
            ? t("auth.form.submit.login")
            : t("auth.form.submit.register")}
      </Button>

      {submitMessage ? <p className="text-xs text-emerald-300">{submitMessage}</p> : null}
    </form>
  );
}
