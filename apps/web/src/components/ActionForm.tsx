"use client";

import { createContext, type ReactNode, useContext, useState, useTransition } from "react";
import type { FormState } from "./form-state";

const Pending = createContext(false);

/**
 * A form that calls a server action and shows its result. Submitting doesn't
 * clear what was typed, so a mistake can be fixed in place.
 */
export function ActionForm({
  action,
  children,
  className = "form",
  confirm,
  onDone,
}: {
  action: (fd: FormData) => Promise<FormState>;
  children: ReactNode;
  className?: string;
  /** Ask before submitting, for things that can't be undone. */
  confirm?: string;
  onDone?: (state: FormState) => void;
}) {
  const [state, setState] = useState<FormState>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        if (confirm && !window.confirm(confirm)) return;
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const next = await action(fd);
          setState(next);
          onDone?.(next);
        });
      }}
    >
      <Pending.Provider value={pending}>{children}</Pending.Provider>
      {state?.message ? (
        <p role="status" className={`status ${state.ok ? "status-ok" : "status-error"}`}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

export function SubmitButton({
  children,
  pendingText = "Saving…",
  className = "btn btn-primary",
  name,
  value,
}: {
  children: ReactNode;
  pendingText?: string;
  className?: string;
  name?: string;
  value?: string;
}) {
  const pending = useContext(Pending);
  return (
    <button type="submit" className={className} disabled={pending} name={name} value={value}>
      {pending ? pendingText : children}
    </button>
  );
}
