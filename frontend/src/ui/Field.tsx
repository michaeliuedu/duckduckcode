/**
 * A labelled input with its validation message.
 *
 * The message is wired to the input with `aria-describedby` and
 * `aria-invalid`, so a screen reader announces why the form was rejected
 * rather than just moving focus to a red box.
 */

import { useId, type InputHTMLAttributes, type ReactNode } from "react";

export interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "className"> {
  label: string;
  /** Server- or client-side message for this field. */
  error?: string;
  /** Static guidance shown under the input when there is no error. */
  hint?: ReactNode;
}

export function Field({ label, error, hint, ...input }: FieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium">
        {label}
      </label>
      <input
        id={id}
        className="field h-9 w-full text-[14px]"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        data-error={error ? "true" : undefined}
        {...input}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-[12px] text-[var(--error)]">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-[12px] text-[var(--muted)]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** The form-level message, above the fields. */
export function FormError({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      data-testid="form-error"
      className="rounded-md border border-[var(--line)] bg-[var(--chip)] px-3 py-2 text-[13px] text-[var(--error)]"
    >
      {children}
    </div>
  );
}

/** The confirmation shown after a form saves. */
export function FormSuccess({ children, testId = "form-success" }: { children: ReactNode; testId?: string }) {
  return (
    <div
      role="status"
      data-testid={testId}
      className="rounded-md border border-[var(--line)] bg-[var(--chip)] px-3 py-2 text-[13px] text-[var(--ok)]"
    >
      {children}
    </div>
  );
}
