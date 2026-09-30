/** Create an account. */

import { Form, Link, useActionData, useNavigation, useSearchParams } from "react-router";
import { AppHeader } from "@/ui/AppHeader";
import { Button } from "@/ui/Button";
import { Field, FormError } from "@/ui/Field";
import type { FormFailure } from "./authActions";
import { safeNext } from "./authActions";

export function SignupPage() {
  const failure = useActionData() as FormFailure | undefined;
  const navigation = useNavigation();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));

  return (
    <div className="flex h-dvh flex-col">
      <AppHeader />
      <main className="flex flex-1 justify-center overflow-y-auto px-6 py-14">
        <div className="w-full max-w-[400px]">
          <h1 className="text-[26px] font-semibold tracking-tight">Create an account</h1>
          <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--muted)]">
            An account lets you write problems, keep lists and see what you have solved. Rooms stay open to anyone with
            the link.
          </p>

          <div className="auth-card mt-6">
            <Form method="post" className="flex flex-col gap-4" data-testid="signup-form">
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
                label="Username"
                name="handle"
                autoComplete="username"
                required
                spellCheck={false}
                error={failure?.fields.handle}
                hint="Lowercase letters, numbers, hyphens and underscores. This appears on problems you publish."
              />
              <Field
                label="Display name"
                name="displayName"
                autoComplete="name"
                error={failure?.fields.displayName}
                hint="What people see on your cursor in a room. Defaults to your username."
              />
              <Field
                label="Password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={10}
                error={failure?.fields.password}
                hint="At least 10 characters. A short phrase beats a mangled word."
              />

              <Button
                type="submit"
                variant="primary"
                busy={navigation.state === "submitting"}
                data-testid="signup-submit"
              >
                Create account
              </Button>
            </Form>
          </div>

          <p className="mt-5 text-[13px] text-[var(--muted)]">
            Already have one?{" "}
            <Link to={{ pathname: "/login", search: params.toString() }} className="font-medium text-[var(--brand)]">
              Sign in
            </Link>
            .
          </p>
        </div>
      </main>
    </div>
  );
}
