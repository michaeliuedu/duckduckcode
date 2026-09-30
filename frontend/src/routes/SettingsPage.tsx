/** Account settings: profile, password, and the local cursor colour. */

import { Form, useActionData, useNavigation } from "react-router";
import { useCurrentUser } from "@/auth/session";
import { PALETTE, recolorParticipant, useParticipant } from "@/lib/participant";
import { AppHeader } from "@/ui/AppHeader";
import { Button } from "@/ui/Button";
import { Field, FormError, FormSuccess } from "@/ui/Field";
import type { SettingsActionData } from "./authActions";

export function SettingsPage() {
  const user = useCurrentUser();
  const result = useActionData() as SettingsActionData | undefined;
  const navigation = useNavigation();

  // The loader guarantees a user; this satisfies the type and would only fire
  // if someone were signed out in another tab mid-render.
  if (!user) return null;

  const submitting = navigation.formData?.get("intent");
  const failure = result && "error" in result ? result : undefined;
  const saved = result && "saved" in result ? result.saved : undefined;

  return (
    <div className="flex h-dvh flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-[520px] flex-1 overflow-y-auto px-6 py-14">
        <h1 className="text-[24px] font-semibold tracking-tight">Settings</h1>
        <p className="mt-1.5 text-[14px] text-[var(--muted)]">
          Signed in as <span className="font-medium text-[var(--ink)]">{user.email}</span>.
        </p>

        <section className="mt-10">
          <h2 className="text-[15px] font-semibold">Profile</h2>
          <p className="mt-1 text-[13px] text-[var(--muted)]">
            Your display name is what appears on your cursor in a room and next to problems you publish.
          </p>
          <Form method="post" replace className="mt-4 flex flex-col gap-4" data-testid="profile-form">
            <input type="hidden" name="intent" value="profile" />
            {failure?.intent === "profile" && <FormError>{failure.error}</FormError>}
            {saved === "profile" && <FormSuccess>Profile saved.</FormSuccess>}

            <Field
              label="Username"
              name="handle"
              defaultValue={user.handle}
              required
              spellCheck={false}
              error={failure?.intent === "profile" ? failure.fields.handle : undefined}
            />
            <Field
              label="Display name"
              name="displayName"
              defaultValue={user.displayName}
              error={failure?.intent === "profile" ? failure.fields.displayName : undefined}
            />
            <div>
              <Button type="submit" variant="primary" busy={submitting === "profile"}>
                Save profile
              </Button>
            </div>
          </Form>
        </section>

        <section className="mt-12 border-t border-[var(--line)] pt-8">
          <h2 className="text-[15px] font-semibold">Cursor colour</h2>
          <p className="mt-1 text-[13px] text-[var(--muted)]">
            Kept in this browser rather than on your account, so you can look different on a shared machine.
          </p>
          <ColourPicker />
        </section>

        <section className="mt-12 border-t border-[var(--line)] pt-8">
          <h2 className="text-[15px] font-semibold">Password</h2>
          <p className="mt-1 text-[13px] text-[var(--muted)]">
            Changing it signs out every other browser you are signed in on.
          </p>
          <Form method="post" replace className="mt-4 flex flex-col gap-4" data-testid="password-form">
            <input type="hidden" name="intent" value="password" />
            {failure?.intent === "password" && <FormError>{failure.error}</FormError>}
            {saved === "password" && <FormSuccess>Password changed. Other sessions were signed out.</FormSuccess>}

            <Field
              label="Current password"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
              error={failure?.intent === "password" ? failure.fields.currentPassword : undefined}
            />
            <Field
              label="New password"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              error={failure?.intent === "password" ? failure.fields.newPassword : undefined}
              hint="At least 10 characters."
            />
            <div>
              <Button type="submit" variant="primary" busy={submitting === "password"}>
                Change password
              </Button>
            </div>
          </Form>
        </section>
      </main>
    </div>
  );
}

function ColourPicker() {
  const participant = useParticipant();
  return (
    <div className="mt-4 flex gap-2" role="group" aria-label="Cursor colour">
      {PALETTE.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={`Use ${color}`}
          aria-pressed={color === participant.color}
          data-testid={`settings-color-${color.replace("#", "")}`}
          className="h-7 w-7 rounded-full border-2 transition-transform hover:scale-110"
          style={{ backgroundColor: color, borderColor: color === participant.color ? "var(--ink)" : "transparent" }}
          onClick={() => recolorParticipant(color)}
        />
      ))}
    </div>
  );
}
