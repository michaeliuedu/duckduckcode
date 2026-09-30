/** Sign in. */

import { Form, Link, useActionData, useNavigation, useSearchParams } from "react-router";
import { AppHeader } from "@/ui/AppHeader";
import { Button } from "@/ui/Button";
import { Field, FormError } from "@/ui/Field";
import type { FormFailure } from "./authActions";
import { safeNext } from "./authActions";

export function LoginPage() {
  const failure = useActionData() as FormFailure | undefined;
  const navigation = useNavigation();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));

  return (
    <div className="flex h-dvh flex-col">
      <AppHeader />
      <main className="flex flex-1 justify-center overflow-y-auto px-6 py-14">
        <div className="w-full max-w-[400px]">
          <h1 className="text-[26px] font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--muted)]">
            An account lets you write problems, keep lists and track what you have solved. Joining a room never needs
            one.
          </p>

          <div className="auth-card mt-6">
            <Form method="post" className="flex flex-col gap-4" data-testid="login-form">
              <input type="hidden" name="next" value={next} />
              {failure && <FormError>{failure.error}</FormError>}

              <Field
                label="Email"
                name="email"
                type="email"
                autoComplete="email"
                required
                autoFocus
                error={failure?.fields.email}
              />
              <Field
                label="Password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                error={failure?.fields.password}
              />

              <Button
                type="submit"
                variant="primary"
                busy={navigation.state === "submitting"}
                data-testid="login-submit"
              >
                Sign in
              </Button>
            </Form>
          </div>

          <p className="mt-5 text-[13px] text-[var(--muted)]">
            No account yet?{" "}
            <Link to={{ pathname: "/signup", search: params.toString() }} className="font-medium text-[var(--brand)]">
              Create one
            </Link>
            .
          </p>
        </div>
      </main>
    </div>
  );
}
