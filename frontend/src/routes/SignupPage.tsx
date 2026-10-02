/** Create an account. */

import { Form, Link, useActionData, useNavigation, useSearchParams } from "react-router";
import { Button } from "@/ui/Button";
import { Field, FormError } from "@/ui/Field";
import { AuthPage } from "./AuthPage";
import type { FormFailure } from "./authActions";
import { safeNext } from "./authActions";

export function SignupPage() {
  const failure = useActionData() as FormFailure | undefined;
  const navigation = useNavigation();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));

  return (
    <AuthPage
      title="Create an account"
      description="An account lets you write problems, keep lists and see what you have solved. Rooms stay open to anyone with the link."
      footer={
        <>
          Already have one?{" "}
          <Link to={{ pathname: "/login", search: params.toString() }} className="link">
            Sign in
          </Link>
          .
        </>
      }
    >
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

        <Button type="submit" variant="primary" busy={navigation.state === "submitting"} data-testid="signup-submit">
          Create account
        </Button>
      </Form>
    </AuthPage>
  );
}
