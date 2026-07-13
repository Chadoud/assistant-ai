/** Shared Electron cloud auth IPC — keeps validation and bridge calls in one place. */

import { toast } from "sonner";
import { describeEmailAuthError, describeSocialSignInError } from "./userFacingErrors";

type CloudAuthFailure =
  | { kind: "desktop_only" }
  | { kind: "invalid"; reason: "credentials" | "name_required" | "password_mismatch" }
  | { kind: "api"; message: string };

type CloudAuthRegistration = {
  firstName: string;
  lastName: string;
  confirmPassword: string;
};

function normalizeName(value: string): string {
  return value.trim();
}

/**
 * Validates email/password auth input before IPC.
 * Registration requires matching passwords and non-empty names.
 */
function validateCloudAuthInput(
  mode: "register" | "login",
  email: string,
  password: string,
  registration?: CloudAuthRegistration,
): CloudAuthFailure | null {
  const em = email.trim();
  if (!em || password.length < 8) {
    return { kind: "invalid", reason: "credentials" };
  }
  if (mode !== "register") {
    return null;
  }
  if (!normalizeName(registration?.firstName ?? "") || !normalizeName(registration?.lastName ?? "")) {
    return { kind: "invalid", reason: "name_required" };
  }
  if (password !== registration?.confirmPassword) {
    return { kind: "invalid", reason: "password_mismatch" };
  }
  return null;
}

export async function performCloudAuth(
  mode: "register" | "login",
  email: string,
  password: string,
  registration?: CloudAuthRegistration,
): Promise<{ ok: true } | { ok: false; failure: CloudAuthFailure }> {
  const reg = window.electronAPI?.cloudAuthRegister;
  const log = window.electronAPI?.cloudAuthLogin;
  if (!reg || !log) {
    return { ok: false, failure: { kind: "desktop_only" } };
  }

  const validationFailure = validateCloudAuthInput(mode, email, password, registration);
  if (validationFailure) {
    return { ok: false, failure: validationFailure };
  }

  const em = email.trim();
  const res =
    mode === "register"
      ? await reg(em, password, normalizeName(registration?.firstName ?? ""), normalizeName(registration?.lastName ?? ""))
      : await log(em, password);
  if (!res.ok) {
    return { ok: false, failure: { kind: "api", message: res.error ?? "" } };
  }
  return { ok: true };
}

type SocialProvider = "google" | "apple";

type SocialLoginResult =
  | { ok: true }
  | { ok: false; reason: "desktop_only" | "cancelled" | "error"; message?: string };

/** Runs a Google/Apple sign-in through the system browser + exo:// callback. */
export async function performSocialLogin(provider: SocialProvider): Promise<SocialLoginResult> {
  const social = window.electronAPI?.cloudAuthSocial;
  if (!social) {
    return { ok: false, reason: "desktop_only" };
  }
  const res = await social(provider);
  if (res.ok) {
    return { ok: true };
  }
  if (res.error === "cancelled") {
    return { ok: false, reason: "cancelled" };
  }
  return { ok: false, reason: "error", message: res.error };
}

export async function performCloudLogout(): Promise<boolean> {
  const out = window.electronAPI?.cloudAuthLogout;
  if (!out) return false;
  await out();
  return true;
}

type TI18n = (key: string, vars?: Record<string, string | number>) => string;

/** Maps `performCloudAuth` result to toasts; returns whether sign-in succeeded. */
export function toastCloudAuthResult(
  t: TI18n,
  mode: "register" | "login",
  result: { ok: true } | { ok: false; failure: CloudAuthFailure },
): boolean {
  if (result.ok) {
    toast.success(mode === "register" ? t("settings.accountRegistered") : t("settings.accountLoggedIn"));
    return true;
  }
  const { failure: f } = result;
  if (f.kind === "desktop_only") {
    toast.message(t("settings.accountDesktopOnlyTitle"), {
      description: t("settings.accountDesktopOnlyDesc"),
      duration: 8000,
    });
    return false;
  }
  if (f.kind === "invalid") {
    if (f.reason === "password_mismatch") {
      toast.error(t("settings.accountPasswordMismatch"));
      return false;
    }
    if (f.reason === "name_required") {
      toast.error(t("settings.accountNameRequired"));
      return false;
    }
    toast.error(t("settings.accountInvalid"));
    return false;
  }
  toast.error(t("settings.accountFailed"), {
    description: describeEmailAuthError(t, f.message),
  });
  return false;
}

/** User-safe toast for social sign-in failures. */
export function toastSocialAuthFailure(t: TI18n, raw: string | undefined): void {
  toast.error(t("cloudAuth.socialFailed"), {
    description: describeSocialSignInError(t, raw),
  });
}
