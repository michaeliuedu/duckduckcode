/**
 * Router actions for the account forms.
 *
 * Each returns `{ error, fields }` on failure rather than throwing, so the form
 * shows the message next to the input that caused it instead of the page being
 * replaced by an error boundary. Success updates the session store and
 * redirects.
 */

import { redirect, type ActionFunctionArgs } from "react-router";
import { ApiError, api, type FieldErrors } from "@/api/client";
import { setCurrentUser } from "@/auth/session";

export interface FormFailure {
  error: string;
  fields: FieldErrors;
}

/** Turns any thrown value into something a form can render. */
function asFailure(error: unknown, fallback: string): FormFailure {
  if (error instanceof ApiError) return { error: error.message, fields: error.fields };
  return { error: fallback, fields: {} };
}

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

/**
 * Where to go after signing in. Only same-site paths are honoured: taking an
 * arbitrary URL here would turn the login page into an open redirect, which is
 * the classic way to make a phishing link look legitimate.
 */
export function safeNext(raw: string | null): string {
  if (!raw) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export async function loginAction({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  try {
    const { user } = await api.login({ email: text(form, "email"), password: text(form, "password") });
    setCurrentUser(user);
    return redirect(safeNext(text(form, "next") || null));
  } catch (error) {
    return asFailure(error, "Could not sign you in.");
  }
}

export async function signupAction({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  try {
    const { user } = await api.signup({
      email: text(form, "email"),
      handle: text(form, "handle"),
      displayName: text(form, "displayName"),
      password: text(form, "password"),
    });
    setCurrentUser(user);
    return redirect(safeNext(text(form, "next") || null));
  } catch (error) {
    return asFailure(error, "Could not create the account.");
  }
}

export async function logoutAction() {
  try {
    await api.logout();
  } catch {
    // Even if the request failed, the local view of the session should go: the
    // person asked to sign out, and the cookie may already be invalid.
  }
  setCurrentUser(null);
  return redirect("/");
}

/**
 * Settings has two independent forms on one route, so each carries a hidden
 * `intent` and this action dispatches on it. The alternative — a route per
 * form — would put two URLs behind one page for no gain.
 */
export async function settingsAction({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const intent = text(form, "intent");

  if (intent === "password") {
    try {
      await api.changePassword({
        currentPassword: text(form, "currentPassword"),
        newPassword: text(form, "newPassword"),
      });
      return { saved: "password" as const };
    } catch (error) {
      return { ...asFailure(error, "Could not change your password."), intent };
    }
  }

  try {
    const { user } = await api.updateProfile({
      handle: text(form, "handle"),
      displayName: text(form, "displayName"),
    });
    setCurrentUser(user);
    return { saved: "profile" as const };
  } catch (error) {
    return { ...asFailure(error, "Could not save your profile."), intent: "profile" };
  }
}

export type SettingsIntent = "profile" | "password";

export type SettingsActionData = (FormFailure & { intent: string }) | { saved: SettingsIntent };
