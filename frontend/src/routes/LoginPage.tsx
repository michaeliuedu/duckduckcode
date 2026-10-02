/** Sign in. */

import { Form, Link, useActionData, useNavigation, useSearchParams } from "react-router";
import { Button } from "@/ui/Button";
import { Field, FormError } from "@/ui/Field";
import { AuthPage } from "./AuthPage";
import type { FormFailure } from "./authActions";
import { safeNext } from "./authActions";

export function LoginPage() {
  const failure = useActionData() as FormFailure | undefined;
  const navigation = useNavigation();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));

  return (
    <AuthPage
      title="Sign in"
      description="An account lets you write problems, keep lists and track what you have solved. Joining a room never needs one."
      footer={
        <>
          No account yet?{" "}
          <Link to={{ pathname: "/signup", search: params.toString() }} className="link">
            Create one
          </Link>
          .
        </>
      }
    >
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

        <Button type="submit" variant="primary" busy={navigation.state === "submitting"} data-testid="login-submit">
          Sign in
        </Button>
      </Form>
    </AuthPage>
  );
}
