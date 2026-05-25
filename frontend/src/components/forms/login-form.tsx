"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Resolver } from "react-hook-form";
import { useForm } from "react-hook-form";
import { z } from "zod";
import axios from "axios";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/providers/toast-provider";
import { useT } from "@/i18n/use-t";
import { adminLoginSchema, loginSchema, registerSchema } from "@/schemas/auth.schema";
import { authService } from "@/services/auth.service";

type AuthMode = "login" | "register";

type LoginFormProps = {
  mode: AuthMode;
  adminMode?: boolean;
  onSuccess?: (mode: AuthMode, tokens: { accessToken: string; refreshToken: string }) => void;
};

type LoginValues = {
  email: string;
  password: string;
  verificationCode: string;
};
type RegisterValues = z.infer<typeof registerSchema>;
const CODE_COOLDOWN_SECONDS = 60;

export function LoginForm({ mode, adminMode = false, onSuccess }: LoginFormProps) {
  const { t } = useT();
  const { pushToast } = useToast();
  const [codeCooldown, setCodeCooldown] = useState(0);
  const [sendingCode, setSendingCode] = useState(false);
  const codeCooldownKey = adminMode ? "octo_admin_auth_code_cooldown_until" : "octo_auth_code_cooldown_until";

  const loginForm = useForm<LoginValues>({
    resolver: zodResolver(adminMode ? adminLoginSchema : loginSchema) as unknown as Resolver<LoginValues>,
    defaultValues: { email: "", password: "", verificationCode: "" },
  });

  const registerForm = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", verificationCode: "", password: "", confirmPassword: "" },
  });

  const currentForm = mode === "login" ? loginForm : registerForm;
  const emailRegister = mode === "login" ? loginForm.register("email") : registerForm.register("email");
  const passwordRegister =
    mode === "login" ? loginForm.register("password") : registerForm.register("password");
  const loginCodeRegister = loginForm.register("verificationCode");
  const emailError =
    mode === "login"
      ? loginForm.formState.errors.email?.message
      : registerForm.formState.errors.email?.message;
  const passwordError =
    mode === "login"
      ? loginForm.formState.errors.password?.message
      : registerForm.formState.errors.password?.message;
  const loginCodeError = loginForm.formState.errors.verificationCode?.message;

  const onSubmit = currentForm.handleSubmit(async (values) => {
    try {
      if (mode === "login") {
        const data = adminMode
          ? await authService.adminLogin({
              email: values.email,
              verification_code: values.verificationCode || "",
            })
          : await authService.login({
              email: values.email,
              password: values.password || "",
            });
        pushToast(t("auth.toast.loginSuccess"));
        onSuccess?.(mode, {
          accessToken: data.tokens.access_token,
          refreshToken: data.tokens.refresh_token,
        });
        return;
      }

      const registerValues = values as RegisterValues;
      const data = await authService.register({
        email: registerValues.email,
        password: registerValues.password,
        name: registerValues.name,
        verification_code: registerValues.verificationCode,
      });
      pushToast(t("auth.toast.accountCreated"));
      onSuccess?.(mode, {
        accessToken: data.tokens.access_token,
        refreshToken: data.tokens.refresh_token,
      });
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.message || t("auth.toast.requestFailed");
        pushToast(message);
        return;
      }
      pushToast(t("auth.toast.requestFailed"));
    }
  });

  const sendEmailCode = async () => {
    if (sendingCode || codeCooldown > 0) return;
    const email = adminMode && mode === "login" ? loginForm.getValues("email") : registerForm.getValues("email");
    if (!email) {
      pushToast(t("auth.toast.emailRequired"));
      return;
    }
    setSendingCode(true);
    try {
      await authService.sendEmailCode({ email, purpose: adminMode && mode === "login" ? "admin_login" : "register" });
      pushToast(t("auth.toast.codeSent"));
      const cooldownUntil = Date.now() + CODE_COOLDOWN_SECONDS * 1000;
      window.localStorage.setItem(codeCooldownKey, String(cooldownUntil));
      setCodeCooldown(CODE_COOLDOWN_SECONDS);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.message || t("auth.toast.codeSendFailed");
        pushToast(message);
      } else {
        pushToast(t("auth.toast.codeSendFailed"));
      }
    } finally {
      setSendingCode(false);
    }
  };

  useEffect(() => {
    if (codeCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setCodeCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [codeCooldown]);

  useEffect(() => {
    const saved = window.localStorage.getItem(codeCooldownKey);
    if (!saved) return;
    const cooldownUntil = Number(saved);
    if (!Number.isFinite(cooldownUntil)) {
      window.localStorage.removeItem(codeCooldownKey);
      return;
    }
    const remainSeconds = Math.ceil((cooldownUntil - Date.now()) / 1000);
    if (remainSeconds > 0) {
      setCodeCooldown(remainSeconds);
      return;
    }
    window.localStorage.removeItem(codeCooldownKey);
  }, [codeCooldownKey]);

  useEffect(() => {
    if (codeCooldown > 0) return;
    window.localStorage.removeItem(codeCooldownKey);
  }, [codeCooldown, codeCooldownKey]);

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

      {!(adminMode && mode === "login") ? (
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
      ) : null}

      {adminMode && mode === "login" ? (
        <div className="space-y-1.5">
          <label htmlFor="adminVerificationCode" className="text-xs text-white/70">
            {t("auth.form.adminCode.label")}
          </label>
          <div className="flex gap-2">
            <Input
              id="adminVerificationCode"
              type="text"
              placeholder={t("auth.form.adminCode.placeholder")}
              error={loginCodeError}
              {...loginCodeRegister}
            />
            <Button
              type="button"
              variant="outline"
              className="h-10 shrink-0"
              onClick={sendEmailCode}
              disabled={sendingCode || codeCooldown > 0}
            >
              {sendingCode ? t("auth.form.code.sending") : codeCooldown > 0 ? `${codeCooldown}s` : t("auth.form.code.send")}
            </Button>
          </div>
        </div>
      ) : null}

      {mode === "register" ? (
        <>
          <div className="space-y-1.5">
            <label htmlFor="name" className="text-xs text-white/70">
              {t("auth.form.name.label")}
            </label>
            <Input id="name" type="text" placeholder={t("auth.form.name.placeholder")} error={registerForm.formState.errors.name?.message} {...registerForm.register("name")} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="verificationCode" className="text-xs text-white/70">
              {t("auth.form.verificationCode.label")}
            </label>
            <div className="flex gap-2">
              <Input
                id="verificationCode"
                type="text"
                placeholder={t("auth.form.verificationCode.placeholder")}
                error={registerForm.formState.errors.verificationCode?.message}
                {...registerForm.register("verificationCode")}
              />
              <Button
                type="button"
                variant="outline"
                className="h-10 shrink-0"
                onClick={sendEmailCode}
                disabled={sendingCode || codeCooldown > 0}
              >
                {sendingCode ? t("auth.form.code.sending") : codeCooldown > 0 ? `${codeCooldown}s` : t("auth.form.code.send")}
              </Button>
            </div>
          </div>
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
        </>
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
    </form>
  );
}
